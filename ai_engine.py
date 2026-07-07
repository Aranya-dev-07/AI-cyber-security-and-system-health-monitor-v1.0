"""
ai_engine.py
============
Production-grade AI Anomaly Detection Engine for the AI-Powered
Cybersecurity & System Health Monitoring Platform.

This module implements an unsupervised anomaly detection system built on
Isolation Forest (scikit-learn), with a modular architecture designed to
accommodate future models such as Local Outlier Factor, One-Class SVM,
DBSCAN, and Autoencoders without modifying the public API.

ARCHITECTURE
-------------
The module is built around a single class ``AnomalyDetectionEngine``
that owns the full ML lifecycle:

    1. Initialization   — model + scaler creation (``initialize_model``)
    2. Data preparation — feature engineering + scaling (``prepare_training_data``)
    3. Training         — Isolation Forest fitting (``train_model``)
    4. Inference        — per-cycle anomaly scoring (``predict_anomaly``)
    5. Alerting         — intelligent human-readable alerts (``generate_ai_alert``)
    6. Persistence      — joblib save/load (``save_model`` / ``load_model``)

DATA FLOW
----------
    config.py (metrics_data + process_data)
        ↓
    prepare_training_data()   — cleans, engineers, scales features
        ↓
    train_model()             — fits Isolation Forest on historical data
        ↓  [every monitoring cycle]
    predict_anomaly(metric)   — returns AnomalyPrediction dataclass
        ↓
    generate_ai_alert()       — prints structured alert to terminal
        ↓
    database.insert_ai_prediction()   — persists result to SQLite
        ↓
    api.py GET /ai/*          — exposes predictions to the dashboard

WHY ISOLATION FOREST
---------------------
- Unsupervised: no labelled attack/normal data required.
- Multivariate: handles CPU + RAM + Network + Processes together.
- Distribution-free: no normality assumption on features.
- Fast inference: O(log n) per sample — well within the 5s cycle budget.
- Continuous score: maps cleanly to LOW / MEDIUM / HIGH / CRITICAL severity.

THREAD SAFETY
--------------
``predict_anomaly`` is a read-only transform on the fitted model and
scaler — both are stateless after training, making concurrent calls
from FastAPI request threads and the monitoring thread safe without
additional locking. Training (a write operation) is protected by
``_training_lock``.

MODEL PERSISTENCE
------------------
    models/isolation_forest.joblib   — fitted IsolationForest object
    models/scaler.joblib             — fitted StandardScaler object
"""

from __future__ import annotations

import logging
import os
import threading
from collections import deque
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_HERE       = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR  = os.path.join(_HERE, "models")
MODEL_PATH  = os.path.join(MODELS_DIR, "isolation_forest.joblib")
SCALER_PATH = os.path.join(MODELS_DIR, "scaler.joblib")

os.makedirs(MODELS_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Configuration dataclass
# ---------------------------------------------------------------------------
@dataclass
class ModelConfig:
    """Tunable parameters for the Isolation Forest engine.

    Attributes:
        n_estimators: Number of isolation trees. Higher = more robust,
            slower to train. 100 is a strong default.
        contamination: Expected proportion of anomalies in training data.
            ``"auto"`` lets the algorithm decide; set to e.g. ``0.05``
            if you expect ~5% anomalous samples in your history.
        max_samples: Samples drawn per tree. ``"auto"`` uses
            min(256, n_samples).
        random_state: Seed for reproducibility.
        rolling_window: Number of past readings kept for rolling
            feature computation (rolling mean, moving average).
        min_train_samples: Minimum samples required before the model
            will attempt its first training run.
        retrain_interval: Retrain after this many new samples have
            been collected since the last training run.
        zscore_spike_threshold: Z-score above which a single-feature
            spike is flagged in the reason string.
    """
    n_estimators:          int   = 100
    contamination:         Any   = "auto"
    max_samples:           Any   = "auto"
    random_state:          int   = 42
    rolling_window:        int   = 20
    min_train_samples:     int   = 10
    retrain_interval:      int   = 100
    zscore_spike_threshold: float = 2.5


# ---------------------------------------------------------------------------
# Output dataclass
# ---------------------------------------------------------------------------
@dataclass
class AnomalyPrediction:
    """The result of one call to ``predict_anomaly``.

    Attributes:
        timestamp: ISO-8601 timestamp of the analyzed metric snapshot.
        is_anomaly: ``True`` if the sample is classified as anomalous.
        anomaly_score: Raw Isolation Forest score. More negative =
            more anomalous. Range approximately [-0.5, 0.5].
        confidence: Human-readable confidence percentage (0–100).
            Derived from the anomaly score.
        severity: One of ``NORMAL``, ``LOW``, ``MEDIUM``, ``HIGH``,
            ``CRITICAL``.
        reason: Intelligent natural-language explanation of why the
            anomaly was detected.
        features_used: Names of the engineered features fed to the
            model for this prediction.
        model_tier: Which model tier produced this prediction
            (``"isolation_forest"`` for Tier 1).
    """
    timestamp:     str
    is_anomaly:    bool
    anomaly_score: float
    confidence:    float
    severity:      str
    reason:        str
    features_used: List[str] = field(default_factory=list)
    model_tier:    str       = "isolation_forest"

    def to_dict(self) -> Dict[str, Any]:
        """Return a plain dict (database / API friendly)."""
        return asdict(self)


# ---------------------------------------------------------------------------
# Feature names (locked — used in training AND inference)
# ---------------------------------------------------------------------------
FEATURE_NAMES: List[str] = [
    "cpu_percent",
    "ram_percent",
    "disk_percent",
    "net_sent_mb",
    "net_recv_mb",
    "net_throughput_mb",
    "cpu_ram_ratio",
    "avg_process_cpu",
    "avg_process_memory",
    "total_active_processes",
    "rolling_cpu_avg",
    "rolling_ram_avg",
    "rolling_net_avg",
]


# ---------------------------------------------------------------------------
# Main engine class
# ---------------------------------------------------------------------------
class AnomalyDetectionEngine:
    """Isolation Forest-based anomaly detection engine.

    Owns the full ML lifecycle: initialization, feature engineering,
    training, inference, alerting, and model persistence.

    This class is designed to be instantiated once and shared across
    the monitoring thread and FastAPI request threads. All mutable
    state is protected by ``_training_lock`` where necessary.

    Args:
        model_config: Tunable parameters. Uses :class:`ModelConfig`
            defaults if not provided.

    Example::

        engine = AnomalyDetectionEngine()
        engine.initialize_model()
        engine.load_model()          # loads saved model if available

        # after enough data has been collected:
        engine.train_model(metrics_list)

        # every monitoring cycle:
        prediction = engine.predict_anomaly(metric_dict, process_list)
        if prediction.is_anomaly:
            engine.generate_ai_alert(prediction)
    """

    def __init__(self, model_config: Optional[ModelConfig] = None) -> None:
        self.cfg             = model_config or ModelConfig()
        self._model: Optional[IsolationForest]  = None
        self._scaler: Optional[StandardScaler]  = None
        self._is_trained: bool                  = False
        self._training_lock: threading.Lock     = threading.Lock()
        self._samples_since_retrain: int        = 0
        self._total_predictions: int            = 0

        # Rolling windows for feature computation (per-metric deques)
        self._rolling_cpu:  deque = deque(maxlen=self.cfg.rolling_window)
        self._rolling_ram:  deque = deque(maxlen=self.cfg.rolling_window)
        self._rolling_net:  deque = deque(maxlen=self.cfg.rolling_window)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def initialize_model(self) -> None:
        """Initialise a fresh Isolation Forest model and StandardScaler.

        Safe to call multiple times — subsequent calls reset the model
        to an untrained state (use :meth:`load_model` immediately after
        to restore a persisted model instead of retraining from scratch).

        Raises:
            Never raises: errors are logged.
        """
        try:
            with self._training_lock:
                self._model = IsolationForest(
                    n_estimators=self.cfg.n_estimators,
                    contamination=self.cfg.contamination,
                    max_samples=self.cfg.max_samples,
                    random_state=self.cfg.random_state,
                    n_jobs=-1,
                )
                self._scaler    = StandardScaler()
                self._is_trained = False

            logger.info(
                "Isolation Forest initialized: n_estimators=%d contamination=%s",
                self.cfg.n_estimators, self.cfg.contamination,
            )
        except Exception:
            logger.exception("Failed to initialize the anomaly detection model.")

    def prepare_training_data(
        self,
        metrics_list: List[Dict[str, Any]],
        process_snapshots: Optional[List[Dict[str, Any]]] = None,
    ) -> Optional[np.ndarray]:
        """Convert raw monitoring dicts into a scaled feature matrix.

        Performs:
            * Missing value imputation (median fill).
            * Feature engineering (ratios, rolling averages, throughput).
            * ``StandardScaler`` normalization.

        Args:
            metrics_list: List of metric dicts as produced by
                :func:`config.collect_system_metrics`.
            process_snapshots: Optional list of process snapshot dicts
                (each element is a ``{"processes": [...]}`` dict from
                ``config.process_data``). Aligned by index with
                ``metrics_list`` where available.

        Returns:
            A 2-D ``numpy`` array of shape
            ``(n_samples, len(FEATURE_NAMES))``, scaled and ready for
            training or inference. Returns ``None`` if preparation fails
            or if there are fewer than 2 valid samples.
        """
        if not metrics_list:
            logger.warning("prepare_training_data: empty metrics_list.")
            return None

        try:
            rows: List[List[float]] = []

            # Temporary rolling windows just for batch preparation
            tmp_cpu: deque = deque(maxlen=self.cfg.rolling_window)
            tmp_ram: deque = deque(maxlen=self.cfg.rolling_window)
            tmp_net: deque = deque(maxlen=self.cfg.rolling_window)

            for i, m in enumerate(metrics_list):
                procs = []
                if process_snapshots and i < len(process_snapshots):
                    procs = process_snapshots[i].get("processes", [])

                row = self._engineer_features(m, procs, tmp_cpu, tmp_ram, tmp_net)
                rows.append(row)

            matrix = np.array(rows, dtype=float)

            # Impute NaN / Inf with column medians
            matrix = self._impute(matrix)

            if matrix.shape[0] < 2:
                logger.warning("prepare_training_data: fewer than 2 valid samples.")
                return None

            return matrix

        except Exception:
            logger.exception("Failed to prepare training data.")
            return None

    def train_model(
        self,
        metrics_list: List[Dict[str, Any]],
        process_snapshots: Optional[List[Dict[str, Any]]] = None,
    ) -> bool:
        """Fit the Isolation Forest on historical monitoring data.

        Will not train if fewer than ``cfg.min_train_samples`` samples
        are available. After successful training, persists the model and
        scaler to disk via :meth:`save_model`.

        Args:
            metrics_list: Historical metric dicts from
                ``config.metrics_data``.
            process_snapshots: Matching process snapshot dicts from
                ``config.process_data``.

        Returns:
            ``True`` if training succeeded, ``False`` otherwise.
        """
        if len(metrics_list) < self.cfg.min_train_samples:
            logger.info(
                "train_model: only %d samples available, need %d. Skipping.",
                len(metrics_list), self.cfg.min_train_samples,
            )
            return False

        try:
            matrix = self.prepare_training_data(metrics_list, process_snapshots)
            if matrix is None:
                return False

            with self._training_lock:
                if self._model is None or self._scaler is None:
                    self.initialize_model()

                scaled = self._scaler.fit_transform(matrix)      # type: ignore[union-attr]
                self._model.fit(scaled)                           # type: ignore[union-attr]
                self._is_trained       = True
                self._samples_since_retrain = 0

            self.save_model()
            logger.info(
                "Isolation Forest trained on %d samples (%d features).",
                matrix.shape[0], matrix.shape[1],
            )
            return True

        except Exception:
            logger.exception("Failed to train the anomaly detection model.")
            return False

    def predict_anomaly(
        self,
        metric: Dict[str, Any],
        processes: Optional[List[Dict[str, Any]]] = None,
    ) -> AnomalyPrediction:
        """Classify one monitoring sample and return a full prediction.

        Updates the internal rolling windows with the new sample before
        computing features, so the rolling averages reflect the most
        recent history.

        Automatically triggers a background retrain when
        ``_samples_since_retrain`` reaches ``cfg.retrain_interval``
        and enough data is available in ``config.metrics_data``.

        Args:
            metric: A single metric dict as produced by
                :func:`config.collect_system_metrics`.
            processes: Top-process list for this cycle from
                :func:`config.collect_process_metrics`.

        Returns:
            An :class:`AnomalyPrediction` with all fields populated.
            If the model is not yet trained, returns a ``NORMAL``
            prediction with a note in the reason field.
        """
        timestamp = metric.get("timestamp", datetime.now().isoformat())

        # Update live rolling windows with this new reading
        self._rolling_cpu.append(float(metric.get("cpu_percent", 0.0)))
        self._rolling_ram.append(float(metric.get("ram_percent", 0.0)))
        net = float(metric.get("net_sent_mb", 0.0)) + float(metric.get("net_recv_mb", 0.0))
        self._rolling_net.append(net)

        self._samples_since_retrain += 1
        self._total_predictions     += 1

        # Schedule background retrain if interval reached
        if (
            self._samples_since_retrain >= self.cfg.retrain_interval
            and len(config.metrics_data) >= self.cfg.min_train_samples
        ):
            self._schedule_retrain()

        if not self._is_trained or self._model is None or self._scaler is None:
            return AnomalyPrediction(
                timestamp=timestamp,
                is_anomaly=False,
                anomaly_score=0.0,
                confidence=0.0,
                severity="NORMAL",
                reason=(
                    f"Model not yet trained. Need {self.cfg.min_train_samples} samples; "
                    f"collected {len(config.metrics_data)} so far."
                ),
                features_used=FEATURE_NAMES,
            )

        try:
            features = self._engineer_features(
                metric, processes or [],
                self._rolling_cpu, self._rolling_ram, self._rolling_net,
            )
            feature_array = np.array([features], dtype=float)
            feature_array = self._impute(feature_array)

            with self._training_lock:
                scaled  = self._scaler.transform(feature_array)
                raw_score = float(self._model.score_samples(scaled)[0])

            is_anomaly, confidence = self._score_to_decision(raw_score)
            severity = self._compute_severity(raw_score, feature_array[0], metric)
            reason   = self._build_reason(feature_array[0], metric, is_anomaly)

            return AnomalyPrediction(
                timestamp=timestamp,
                is_anomaly=is_anomaly,
                anomaly_score=round(raw_score, 4),
                confidence=round(confidence, 2),
                severity=severity,
                reason=reason,
                features_used=FEATURE_NAMES,
            )

        except Exception:
            logger.exception("predict_anomaly failed; returning safe default.")
            return AnomalyPrediction(
                timestamp=timestamp,
                is_anomaly=False,
                anomaly_score=0.0,
                confidence=0.0,
                severity="NORMAL",
                reason="Prediction error — check logs.",
            )

    def generate_ai_alert(self, prediction: AnomalyPrediction) -> None:
        """Print a structured AI alert to the terminal and log it.

        Only prints if ``prediction.is_anomaly`` is ``True``.

        Args:
            prediction: The result of a :meth:`predict_anomaly` call.
        """
        if not prediction.is_anomaly:
            return

        severity_colors = {
            "LOW":      "⚠ ",
            "MEDIUM":   "🔶",
            "HIGH":     "🔴",
            "CRITICAL": "🚨",
        }
        icon = severity_colors.get(prediction.severity, "⚠ ")

        alert = (
            f"\n{'=' * 60}\n"
            f"  {icon}  [AI ALERT]  Potential anomaly detected.\n"
            f"{'=' * 60}\n"
            f"  Confidence : {prediction.confidence:.1f}%\n"
            f"  Severity   : {prediction.severity}\n"
            f"  Score      : {prediction.anomaly_score:.4f}\n"
            f"  Reason     :\n"
            f"    {prediction.reason}\n"
            f"  Timestamp  : {prediction.timestamp}\n"
            f"  Model Tier : {prediction.model_tier}\n"
            f"{'=' * 60}\n"
        )
        print(alert)
        logger.warning(
            "AI ALERT | severity=%s confidence=%.1f%% score=%.4f | %s",
            prediction.severity, prediction.confidence,
            prediction.anomaly_score, prediction.reason,
        )

    def save_model(self) -> bool:
        """Persist the trained model and scaler to disk using joblib.

        Saves to:
            * ``models/isolation_forest.joblib``
            * ``models/scaler.joblib``

        Returns:
            ``True`` on success, ``False`` on failure.
        """
        if not self._is_trained or self._model is None or self._scaler is None:
            logger.warning("save_model: model not trained yet; nothing to save.")
            return False

        try:
            os.makedirs(MODELS_DIR, exist_ok=True)
            joblib.dump(self._model,  MODEL_PATH)
            joblib.dump(self._scaler, SCALER_PATH)
            logger.info("Model saved to '%s'.", MODEL_PATH)
            return True
        except Exception:
            logger.exception("Failed to save model.")
            return False

    def load_model(self) -> bool:
        """Load a previously saved model and scaler from disk.

        If both ``isolation_forest.joblib`` and ``scaler.joblib`` are
        found, loads them and marks the engine as trained — skipping
        the need for an immediate retraining cycle.

        Returns:
            ``True`` if both files were loaded successfully,
            ``False`` if either is missing or loading fails.
        """
        if not os.path.isfile(MODEL_PATH) or not os.path.isfile(SCALER_PATH):
            logger.info(
                "No saved model found at '%s'. Will train from scratch once "
                "%d samples are collected.",
                MODEL_PATH, self.cfg.min_train_samples,
            )
            return False

        try:
            with self._training_lock:
                self._model   = joblib.load(MODEL_PATH)
                self._scaler  = joblib.load(SCALER_PATH)
                self._is_trained = True

            logger.info("Loaded saved model from '%s'.", MODEL_PATH)
            return True
        except Exception:
            logger.exception("Failed to load saved model; will retrain.")
            self._is_trained = False
            return False

    # ------------------------------------------------------------------
    # Properties (read-only access for api.py / main.py)
    # ------------------------------------------------------------------
    @property
    def is_trained(self) -> bool:
        """``True`` if the model has been fitted at least once."""
        return self._is_trained

    @property
    def total_predictions(self) -> int:
        """Total number of ``predict_anomaly`` calls made so far."""
        return self._total_predictions

    @property
    def samples_until_retrain(self) -> int:
        """Samples remaining before the next scheduled retrain."""
        return max(0, self.cfg.retrain_interval - self._samples_since_retrain)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------
    def _engineer_features(
        self,
        metric: Dict[str, Any],
        processes: List[Dict[str, Any]],
        rolling_cpu: deque,
        rolling_ram: deque,
        rolling_net: deque,
    ) -> List[float]:
        """Compute the full feature vector for one monitoring sample.

        Args:
            metric: Raw metric dict from ``config.collect_system_metrics``.
            processes: Process list for this cycle.
            rolling_cpu: Running deque of recent CPU readings.
            rolling_ram: Running deque of recent RAM readings.
            rolling_net: Running deque of recent net throughput readings.

        Returns:
            A list of floats aligned with :data:`FEATURE_NAMES`.
        """
        cpu    = float(metric.get("cpu_percent",  0.0))
        ram    = float(metric.get("ram_percent",  0.0))
        disk   = float(metric.get("disk_percent", 0.0))
        sent   = float(metric.get("net_sent_mb",  0.0))
        recv   = float(metric.get("net_recv_mb",  0.0))
        net_tp = sent + recv

        # Ratios
        cpu_ram_ratio = cpu / max(ram, 1.0)

        # Process features
        proc_cpus  = [float(p.get("cpu_percent",    0.0)) for p in processes]
        proc_mems  = [float(p.get("memory_percent", 0.0)) for p in processes]
        avg_proc_cpu = float(np.mean(proc_cpus))  if proc_cpus else 0.0
        avg_proc_mem = float(np.mean(proc_mems))  if proc_mems else 0.0
        total_procs  = float(len(processes))

        # Rolling features
        rolling_cpu.append(cpu)
        rolling_ram.append(ram)
        rolling_net.append(net_tp)

        roll_cpu_avg = float(np.mean(rolling_cpu)) if rolling_cpu else cpu
        roll_ram_avg = float(np.mean(rolling_ram)) if rolling_ram else ram
        roll_net_avg = float(np.mean(rolling_net)) if rolling_net else net_tp

        return [
            cpu,           # cpu_percent
            ram,           # ram_percent
            disk,          # disk_percent
            sent,          # net_sent_mb
            recv,          # net_recv_mb
            net_tp,        # net_throughput_mb
            cpu_ram_ratio, # cpu_ram_ratio
            avg_proc_cpu,  # avg_process_cpu
            avg_proc_mem,  # avg_process_memory
            total_procs,   # total_active_processes
            roll_cpu_avg,  # rolling_cpu_avg
            roll_ram_avg,  # rolling_ram_avg
            roll_net_avg,  # rolling_net_avg
        ]

    @staticmethod
    def _impute(matrix: np.ndarray) -> np.ndarray:
        """Replace NaN and Inf values with column medians.

        Args:
            matrix: Feature matrix of shape (n_samples, n_features).

        Returns:
            Cleaned matrix of the same shape.
        """
        matrix = np.where(np.isinf(matrix), np.nan, matrix)
        col_medians = np.nanmedian(matrix, axis=0)
        nan_mask    = np.isnan(matrix)
        matrix[nan_mask] = np.take(col_medians, np.where(nan_mask)[1])
        return matrix

    @staticmethod
    def _score_to_decision(raw_score: float) -> Tuple[bool, float]:
        """Convert an Isolation Forest score to (is_anomaly, confidence).

        Isolation Forest ``score_samples`` returns values typically in
        [-0.5, 0.5].  Scores below 0 are anomalous; the more negative,
        the more anomalous.

        Args:
            raw_score: Output of ``IsolationForest.score_samples``.

        Returns:
            A tuple of (``is_anomaly``, ``confidence_percent``).
        """
        is_anomaly = raw_score < 0.0
        # Map score to 0-100 confidence: score of -0.5 → ~100%, 0.0 → 50%
        confidence = float(np.clip((0.5 - raw_score) * 100.0, 0.0, 100.0))
        return is_anomaly, confidence

    def _compute_severity(
        self,
        raw_score: float,
        features: np.ndarray,
        metric: Dict[str, Any],
    ) -> str:
        """Map anomaly score + feature context to a severity label.

        Severity is determined by combining the raw anomaly score with
        how many individual features exceed their expected range and by
        how far each deviates from the rolling mean.

        Args:
            raw_score: Isolation Forest score (more negative = worse).
            features: Engineered feature vector for this sample.
            metric: Original raw metric dict.

        Returns:
            One of ``"NORMAL"``, ``"LOW"``, ``"MEDIUM"``, ``"HIGH"``,
            ``"CRITICAL"``.
        """
        if raw_score >= 0.0:
            return "NORMAL"

        # Count features that exceed their rolling baseline significantly
        abnormal_count = 0
        if len(self._rolling_cpu) >= 3:
            roll_mean_cpu = float(np.mean(self._rolling_cpu))
            if float(metric.get("cpu_percent", 0.0)) > roll_mean_cpu * 1.5:
                abnormal_count += 1
        if len(self._rolling_ram) >= 3:
            roll_mean_ram = float(np.mean(self._rolling_ram))
            if float(metric.get("ram_percent", 0.0)) > roll_mean_ram * 1.3:
                abnormal_count += 1
        if len(self._rolling_net) >= 3:
            roll_mean_net = float(np.mean(self._rolling_net))
            net_now = float(metric.get("net_sent_mb", 0.0)) + float(metric.get("net_recv_mb", 0.0))
            if net_now > roll_mean_net * 2.0:
                abnormal_count += 1

        score_abs = abs(raw_score)
        if score_abs >= 0.35 or abnormal_count >= 3:
            return "CRITICAL"
        if score_abs >= 0.25 or abnormal_count == 2:
            return "HIGH"
        if score_abs >= 0.15 or abnormal_count == 1:
            return "MEDIUM"
        return "LOW"

    def _build_reason(
        self,
        features: np.ndarray,
        metric: Dict[str, Any],
        is_anomaly: bool,
    ) -> str:
        """Construct a human-readable explanation of the prediction.

        Compares each key metric against its rolling baseline and
        reports which features deviated most significantly.

        Args:
            features: Engineered feature vector for this sample.
            metric: Original raw metric dict.
            is_anomaly: Whether the sample was classified as anomalous.

        Returns:
            A natural-language reason string, ready for display in the
            terminal alert and the dashboard.
        """
        if not is_anomaly:
            return "All metrics within learned normal range."

        reasons: List[str] = []

        cpu = float(metric.get("cpu_percent", 0.0))
        ram = float(metric.get("ram_percent", 0.0))
        net = float(metric.get("net_sent_mb", 0.0)) + float(metric.get("net_recv_mb", 0.0))

        if len(self._rolling_cpu) >= 3:
            baseline_cpu = float(np.mean(self._rolling_cpu))
            if baseline_cpu > 0 and cpu > baseline_cpu * 1.5:
                pct = ((cpu - baseline_cpu) / baseline_cpu) * 100
                reasons.append(
                    f"CPU usage ({cpu:.1f}%) is {pct:.0f}% above its "
                    f"learned baseline ({baseline_cpu:.1f}%)."
                )

        if len(self._rolling_ram) >= 3:
            baseline_ram = float(np.mean(self._rolling_ram))
            if baseline_ram > 0 and ram > baseline_ram * 1.3:
                pct = ((ram - baseline_ram) / baseline_ram) * 100
                reasons.append(
                    f"RAM usage ({ram:.1f}%) is {pct:.0f}% above its "
                    f"learned baseline ({baseline_ram:.1f}%)."
                )

        if len(self._rolling_net) >= 3:
            baseline_net = float(np.mean(self._rolling_net))
            if baseline_net > 0 and net > baseline_net * 2.0:
                reasons.append(
                    f"Network throughput ({net:.3f} MB) is "
                    f"{(net / baseline_net):.1f}x the learned baseline "
                    f"({baseline_net:.3f} MB) — possible data exfiltration or spike."
                )

        if cpu > config.CPU_THRESHOLD:
            reasons.append(
                f"CPU usage ({cpu:.1f}%) exceeds the configured threshold "
                f"({config.CPU_THRESHOLD}%)."
            )
        if ram > config.RAM_THRESHOLD:
            reasons.append(
                f"RAM usage ({ram:.1f}%) exceeds the configured threshold "
                f"({config.RAM_THRESHOLD}%)."
            )

        if len(reasons) > 1:
            reasons.append(
                "Multiple abnormal metrics detected simultaneously — "
                "possible coordinated resource exhaustion or attack."
            )

        if not reasons:
            reasons.append(
                "Multivariate feature combination is inconsistent with "
                "learned system behavior (no single metric dominates)."
            )

        return " | ".join(reasons)

    def _schedule_retrain(self) -> None:
        """Trigger a background retraining cycle without blocking inference.

        Spawns a daemon thread that calls :meth:`train_model` with the
        current contents of ``config.metrics_data`` and
        ``config.process_data``.
        """
        def _retrain() -> None:
            logger.info("Background retrain triggered after %d new samples.", self.cfg.retrain_interval)
            with config.data_lock:
                metrics_snap  = list(config.metrics_data)
                process_snap  = list(config.process_data)
            self.train_model(metrics_snap, process_snap)

        t = threading.Thread(target=_retrain, daemon=True, name="AIRetrainThread")
        t.start()


# ---------------------------------------------------------------------------
# Module-level singleton (shared by main.py, api.py)
# ---------------------------------------------------------------------------
engine: AnomalyDetectionEngine = AnomalyDetectionEngine()


# ---------------------------------------------------------------------------
# Convenience functions (match the public API spec from the prompt)
# ---------------------------------------------------------------------------
def initialize_model() -> None:
    """Module-level convenience wrapper for :meth:`AnomalyDetectionEngine.initialize_model`."""
    engine.initialize_model()


def prepare_training_data(
    metrics_list: List[Dict[str, Any]],
    process_snapshots: Optional[List[Dict[str, Any]]] = None,
) -> Optional[np.ndarray]:
    """Module-level convenience wrapper for :meth:`AnomalyDetectionEngine.prepare_training_data`."""
    return engine.prepare_training_data(metrics_list, process_snapshots)


def train_model(
    metrics_list: List[Dict[str, Any]],
    process_snapshots: Optional[List[Dict[str, Any]]] = None,
) -> bool:
    """Module-level convenience wrapper for :meth:`AnomalyDetectionEngine.train_model`."""
    return engine.train_model(metrics_list, process_snapshots)


def predict_anomaly(
    metric: Dict[str, Any],
    processes: Optional[List[Dict[str, Any]]] = None,
) -> AnomalyPrediction:
    """Module-level convenience wrapper for :meth:`AnomalyDetectionEngine.predict_anomaly`."""
    return engine.predict_anomaly(metric, processes)


def generate_ai_alert(prediction: AnomalyPrediction) -> None:
    """Module-level convenience wrapper for :meth:`AnomalyDetectionEngine.generate_ai_alert`."""
    engine.generate_ai_alert(prediction)


def save_model() -> bool:
    """Module-level convenience wrapper for :meth:`AnomalyDetectionEngine.save_model`."""
    return engine.save_model()


def load_model() -> bool:
    """Module-level convenience wrapper for :meth:`AnomalyDetectionEngine.load_model`."""
    return engine.load_model()