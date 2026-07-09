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
    7. Health scoring   — composite system health (``compute_health_score``)
    8. Root cause       — metric attribution (``analyze_root_cause``)
    9. Trend analysis   — rolling trend detection (``analyze_trends``)
    10. Recommendations — actionable advice (``generate_recommendations``)
    11. Timeline        — chronological event log (``get_timeline``)
    12. Insights        — NL system summary (``generate_insights``)
    13. Historical comparison — baseline deviation (``compare_to_baseline``)

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
# Timeline event dataclass
# ---------------------------------------------------------------------------
@dataclass
class TimelineEvent:
    """One entry in the chronological system health timeline."""
    timestamp: str
    event_type: str          # "metric", "anomaly", "alert", "health", "trend", "root_cause"
    title: str
    description: str
    severity: str = "NORMAL"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


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

        # ── NEW: state for dashboard intelligence layer ──
        self._timeline: deque = deque(maxlen=500)
        self._health_score: float = 100.0
        self._health_status: str = "Healthy"
        self._health_reasons: List[str] = []
        self._health_confidence: float = 100.0
        self._last_health_update: str = datetime.now().isoformat()
        self._active_anomalies: List[Dict[str, Any]] = []
        self._baseline: Dict[str, float] = {
            "cpu_percent": 0.0,
            "ram_percent": 0.0,
            "disk_percent": 0.0,
            "net_throughput_mb": 0.0,
        }
        self._baseline_computed: bool = False

        # ── NEW: Explainable AI Root Cause Analysis Engine ──
        # Independent module, consumes predictions only after they are
        # made — never re-runs or alters anomaly detection itself.
        self._rca_engine: "RootCauseAnalysisEngine" = RootCauseAnalysisEngine(self)

        # ── NEW: Explainable AI Health Score Engine ──
        # Independent module, recalculated every monitoring cycle.
        # Does not read or modify self._health_score / _health_status
        # (the pre-existing internal bookkeeping used by recommendations
        # and trend penalties) — this is a separate, explicitly weighted,
        # fully explainable score computed in parallel.
        self._health_score_engine: "HealthScoreEngine" = HealthScoreEngine(self)

        # ── NEW: Explainable AI Trend Analysis Engine ──
        # Independent module, recalculated every monitoring cycle. Does
        # not read or modify the pre-existing analyze_trends()/_detect_trend
        # logic — a separate, richer implementation with duration-in-minutes,
        # spike-vs-long-term-trend classification, and historical comparison.
        self._trend_engine: "TrendAnalysisEngine" = TrendAnalysisEngine(self)

        # ── NEW: Explainable AI Predictive Alert Engine ──
        # Independent module, recalculated every monitoring cycle. Only
        # consumes this cycle's TrendAnalysisEngine output — never
        # recomputes trends or reads raw metrics for its own regression.
        self._predictive_engine: "PredictiveAlertEngine" = PredictiveAlertEngine(self)

        # ── NEW: Explainable AI Recommendation Engine ──
        # Independent module, recalculated every monitoring cycle. Does
        # not read or modify the pre-existing generate_recommendations()
        # method — a separate implementation that synthesizes across the
        # current prediction, Root Cause Analysis, Trend Analysis, and
        # Health Score outputs.
        self._recommendation_engine: "RecommendationEngine" = RecommendationEngine(self)

    # ------------------------------------------------------------------
    # Public API — original methods
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

            # Compute baseline from training data
            self._compute_baseline(metrics_list)

            self.save_model()

            self._add_timeline_event(
                "health", "Model Trained",
                f"Isolation Forest trained on {matrix.shape[0]} samples "
                f"with {matrix.shape[1]} features.",
                severity="NORMAL",
            )

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
            prediction = AnomalyPrediction(
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
            # Still update health score even when untrained
            self._update_health_score(metric, prediction, processes)

            # ── NEW: Explainable AI Health Score — recalculated every cycle ──
            try:
                self._health_score_engine.compute(metric, processes or [], prediction)
            except Exception:
                logger.exception("Health Score computation failed (untrained-model branch).")

            # ── NEW: Trend Analysis / Predictive Alerts / Recommendations ──
            self._run_extended_ai_pipeline(metric, processes or [], prediction)

            return prediction

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

            prediction = AnomalyPrediction(
                timestamp=timestamp,
                is_anomaly=is_anomaly,
                anomaly_score=round(raw_score, 4),
                confidence=round(confidence, 2),
                severity=severity,
                reason=reason,
                features_used=FEATURE_NAMES,
            )

            # Update all dashboard intelligence
            self._update_health_score(metric, prediction, processes)

            # ── NEW: Explainable AI Health Score — recalculated every cycle ──
            try:
                self._health_score_engine.compute(metric, processes or [], prediction)
            except Exception:
                logger.exception("Health Score computation failed.")

            if is_anomaly:
                self._register_anomaly(prediction, metric, processes)

            # ── NEW: Trend Analysis / Predictive Alerts / Recommendations ──
            # Placed after _register_anomaly so this cycle's Root Cause
            # Analysis (if any) is already available to the Recommendation
            # and Predictive Alert engines.
            self._run_extended_ai_pipeline(metric, processes or [], prediction)

            # Add metric event to timeline
            self._add_timeline_event(
                "metric", "Metric Collected",
                f"CPU={metric.get('cpu_percent', 0):.1f}% "
                f"RAM={metric.get('ram_percent', 0):.1f}% "
                f"Disk={metric.get('disk_percent', 0):.1f}%",
                severity="NORMAL",
                metadata={"cpu": metric.get("cpu_percent"), "ram": metric.get("ram_percent")},
            )

            return prediction

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
    # NEW: Dashboard intelligence methods
    # ------------------------------------------------------------------
    def compute_health_score(self) -> Dict[str, Any]:
        """Return the current AI health assessment for the dashboard.

        Returns:
            A dict with ``score``, ``status``, ``confidence``,
            ``last_updated``, and ``reasons``.
        """
        return {
            "score": round(self._health_score, 1),
            "status": self._health_status,
            "confidence": round(self._health_confidence, 1),
            "last_updated": self._last_health_update,
            "reasons": list(self._health_reasons),
        }

    def analyze_root_cause(self) -> List[Dict[str, Any]]:
        """Identify the root cause of active anomalies.

        Examines the most recent anomalies and the rolling metric
        windows to attribute the primary responsible metric and
        process.

        Returns:
            A list of root-cause analysis dicts, one per active
            anomaly (most recent first, max 5).
        """
        results: List[Dict[str, Any]] = []

        with config.data_lock:
            recent_metrics = list(config.metrics_data[-20:]) if config.metrics_data else []
            recent_procs = list(config.process_data[-5:]) if config.process_data else []

        if not recent_metrics:
            return results

        latest = recent_metrics[-1] if recent_metrics else {}

        # Determine which metric is most abnormal
        deviations = self._compute_deviations(latest)
        sorted_devs = sorted(deviations.items(), key=lambda x: abs(x[1]), reverse=True)

        primary_metric = sorted_devs[0][0] if sorted_devs else "cpu_percent"
        primary_dev = sorted_devs[0][1] if sorted_devs else 0.0

        # Find responsible process
        responsible_process = "N/A"
        if recent_procs:
            last_procs = recent_procs[-1].get("processes", [])
            if last_procs:
                if "cpu" in primary_metric.lower():
                    sorted_p = sorted(last_procs, key=lambda p: p.get("cpu_percent", 0), reverse=True)
                elif "ram" in primary_metric.lower() or "memory" in primary_metric.lower():
                    sorted_p = sorted(last_procs, key=lambda p: p.get("memory_percent", 0), reverse=True)
                else:
                    sorted_p = sorted(last_procs, key=lambda p: p.get("cpu_percent", 0), reverse=True)
                if sorted_p:
                    responsible_process = sorted_p[0].get("name", "unknown")

        # Determine root cause description
        root_cause, recommendation = self._determine_root_cause(
            primary_metric, primary_dev, latest, responsible_process
        )

        # Severity from deviation magnitude
        dev_abs = abs(primary_dev)
        if dev_abs >= 50:
            severity = "CRITICAL"
        elif dev_abs >= 30:
            severity = "HIGH"
        elif dev_abs >= 15:
            severity = "MEDIUM"
        elif dev_abs >= 5:
            severity = "LOW"
        else:
            severity = "NORMAL"

        confidence = min(99.0, 50.0 + dev_abs * 1.2)

        # Historical comparison
        baseline_val = self._baseline.get(primary_metric, 0.0)
        current_val = float(latest.get(primary_metric, 0.0))

        metric_display = primary_metric.replace("_", " ").replace("percent", "").strip().upper()
        if not metric_display:
            metric_display = primary_metric.upper()

        results.append({
            "primary_metric": metric_display,
            "responsible_process": responsible_process,
            "root_cause": root_cause,
            "severity": severity,
            "confidence": round(confidence, 1),
            "recommendation": recommendation,
            "current_value": round(current_val, 2),
            "baseline_value": round(baseline_val, 2),
            "deviation_percent": round(primary_dev, 1),
            "timestamp": latest.get("timestamp", datetime.now().isoformat()),
        })

        return results

    def analyze_trends(self) -> List[Dict[str, Any]]:
        """Detect trends in monitored metrics using rolling analysis.

        Examines the last N readings for each key metric and identifies
        sustained increasing, decreasing, stable, or spike patterns.

        Returns:
            A list of trend dicts, one per analyzed metric.
        """
        trends: List[Dict[str, Any]] = []

        with config.data_lock:
            recent = list(config.metrics_data[-30:]) if config.metrics_data else []

        if len(recent) < 3:
            return trends

        metric_keys = [
            ("cpu_percent", "CPU Usage"),
            ("ram_percent", "RAM Usage"),
            ("disk_percent", "Disk Usage"),
        ]

        # Compute net throughput trend separately
        net_values = [
            float(m.get("net_sent_mb", 0)) + float(m.get("net_recv_mb", 0))
            for m in recent
        ]

        for key, display_name in metric_keys:
            values = [float(m.get(key, 0)) for m in recent]
            trend_info = self._detect_trend(values, display_name)
            trend_info["metric_key"] = key
            trends.append(trend_info)

        # Network trend
        net_trend = self._detect_trend(net_values, "Network Activity")
        net_trend["metric_key"] = "net_throughput_mb"
        trends.append(net_trend)

        return trends

    def get_active_anomalies(self) -> List[Dict[str, Any]]:
        """Return all currently active (recent) anomalies.

        Returns:
            A list of anomaly dicts, most recent first, max 20.
        """
        return list(reversed(self._active_anomalies[-20:]))

    # ------------------------------------------------------------------
    # NEW: Explainable AI Root Cause Analysis — public accessors
    # ------------------------------------------------------------------
    def get_latest_root_cause_analysis(self) -> Optional[Dict[str, Any]]:
        """Return the most recent Root Cause Analysis result, if any.

        This is produced by the independent :class:`RootCauseAnalysisEngine`
        and reflects the most recently *detected* anomaly only — it does
        not perform any new detection itself.

        Returns:
            The result dict (see :meth:`RootCauseAnalysisEngine.analyze`
            for the schema), or ``None`` if no anomaly has occurred yet.
        """
        return self._rca_engine.get_latest()

    def get_root_cause_analysis_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return past Root Cause Analysis results, most recent first.

        Args:
            limit: Maximum number of results to return.
        """
        return self._rca_engine.get_history(limit=limit)

    # ------------------------------------------------------------------
    # NEW: Explainable AI Health Score — public accessors
    # ------------------------------------------------------------------
    def get_latest_health_score(self) -> Optional[Dict[str, Any]]:
        """Return the most recent Health Score result, if any.

        Produced by the independent :class:`HealthScoreEngine`, recomputed
        every monitoring cycle. Does not read the pre-existing internal
        ``compute_health_score()`` bookkeeping — this is a separate,
        explicitly weighted, fully explainable score.

        Returns:
            The result dict (see :meth:`HealthScoreEngine.compute` for the
            schema), or ``None`` if no monitoring cycle has run yet.
        """
        return self._health_score_engine.get_latest()

    def get_health_score_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return past Health Score results, most recent first.

        Args:
            limit: Maximum number of results to return.
        """
        return self._health_score_engine.get_history(limit=limit)

    # ------------------------------------------------------------------
    # NEW: Explainable AI Trend Analysis — public accessors
    # ------------------------------------------------------------------
    def get_latest_trend_analysis(self) -> List[Dict[str, Any]]:
        """Return the most recent Trend Analysis result set (one entry per metric).

        Produced by the independent :class:`TrendAnalysisEngine`, recomputed
        every monitoring cycle. Does not read the pre-existing
        ``analyze_trends()``/``_detect_trend`` logic.
        """
        return self._trend_engine.get_latest()

    def get_trend_analysis_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return past Trend Analysis result bundles, most recent first."""
        return self._trend_engine.get_history(limit=limit)

    # ------------------------------------------------------------------
    # NEW: Explainable AI Predictive Alerts — public accessors
    # ------------------------------------------------------------------
    def get_latest_predictive_alerts(self) -> List[Dict[str, Any]]:
        """Return the most recently forecast predictive alerts (may be empty).

        Produced by the independent :class:`PredictiveAlertEngine`, which
        only extrapolates off this cycle's Trend Analysis output — it
        performs no anomaly detection or trend computation of its own.
        """
        return self._predictive_engine.get_latest()

    def get_predictive_alerts_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return past predictive alert bundles, most recent first."""
        return self._predictive_engine.get_history(limit=limit)

    # ------------------------------------------------------------------
    # NEW: Explainable AI Recommendations — public accessors
    # ------------------------------------------------------------------
    def get_latest_smart_recommendations(self) -> List[Dict[str, Any]]:
        """Return the most recent Recommendation Engine output.

        Produced by the independent :class:`RecommendationEngine`, which
        synthesizes across this cycle's prediction, Root Cause Analysis,
        Trend Analysis, and Health Score — without duplicating the
        pre-existing ``generate_recommendations()`` method.
        """
        return self._recommendation_engine.get_latest()

    def get_smart_recommendations_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return past recommendation bundles, most recent first."""
        return self._recommendation_engine.get_history(limit=limit)

    def generate_recommendations(self) -> List[Dict[str, Any]]:
        """Generate actionable recommendations based on current state.

        Examines health score, active anomalies, and trends to produce
        prioritized recommendations.

        Returns:
            A list of recommendation dicts with ``priority``,
            ``recommendation``, ``estimated_impact``, and ``category``.
        """
        recs: List[Dict[str, Any]] = []

        with config.data_lock:
            latest = config.metrics_data[-1] if config.metrics_data else {}
            recent_procs = list(config.process_data[-3:]) if config.process_data else []

        if not latest:
            recs.append({
                "priority": "LOW",
                "recommendation": "Start monitoring to enable AI-powered recommendations.",
                "estimated_impact": "Enables full system health visibility.",
                "category": "setup",
            })
            return recs

        cpu = float(latest.get("cpu_percent", 0))
        ram = float(latest.get("ram_percent", 0))
        disk = float(latest.get("disk_percent", 0))
        net = float(latest.get("net_sent_mb", 0)) + float(latest.get("net_recv_mb", 0))

        # CPU recommendations
        if cpu > config.CPU_THRESHOLD:
            top_proc = "unknown"
            if recent_procs:
                procs = recent_procs[-1].get("processes", [])
                if procs:
                    top_proc = procs[0].get("name", "unknown")
            recs.append({
                "priority": "CRITICAL" if cpu > 95 else "HIGH",
                "recommendation": (
                    f"CPU usage is critically high at {cpu:.1f}%. "
                    f"Consider terminating or restarting '{top_proc}' which is the "
                    f"top CPU consumer."
                ),
                "estimated_impact": f"Could reduce CPU usage by 10-30%.",
                "category": "cpu",
            })
        elif cpu > 70:
            recs.append({
                "priority": "MEDIUM",
                "recommendation": (
                    f"CPU usage is elevated at {cpu:.1f}%. "
                    f"Monitor for sustained increase. Consider deferring "
                    f"non-critical background tasks."
                ),
                "estimated_impact": "Prevents potential CPU exhaustion.",
                "category": "cpu",
            })

        # RAM recommendations
        if ram > config.RAM_THRESHOLD:
            mem_proc = "unknown"
            if recent_procs:
                procs = recent_procs[-1].get("processes", [])
                sorted_procs = sorted(procs, key=lambda p: p.get("memory_percent", 0), reverse=True)
                if sorted_procs:
                    mem_proc = sorted_procs[0].get("name", "unknown")
            recs.append({
                "priority": "CRITICAL" if ram > 95 else "HIGH",
                "recommendation": (
                    f"RAM usage at {ram:.1f}% exceeds threshold. "
                    f"'{mem_proc}' is consuming the most memory. "
                    f"Investigate for possible memory leak and consider restarting."
                ),
                "estimated_impact": "May free 15-40% RAM and prevent OOM conditions.",
                "category": "ram",
            })
        elif ram > 70:
            recs.append({
                "priority": "MEDIUM",
                "recommendation": (
                    f"RAM usage at {ram:.1f}% is trending high. "
                    f"Close unused applications to prevent threshold breach."
                ),
                "estimated_impact": "Maintains system stability.",
                "category": "ram",
            })

        # Disk recommendations
        if disk > 90:
            recs.append({
                "priority": "CRITICAL" if disk > 95 else "HIGH",
                "recommendation": (
                    f"Disk usage at {disk:.1f}% is critically high. "
                    f"Immediately clear temporary files, logs, and unused data. "
                    f"Consider expanding storage."
                ),
                "estimated_impact": "Prevents disk-full system failure.",
                "category": "disk",
            })
        elif disk > 80:
            recs.append({
                "priority": "MEDIUM",
                "recommendation": (
                    f"Disk usage at {disk:.1f}%. Plan storage cleanup "
                    f"or expansion in the near term."
                ),
                "estimated_impact": "Avoids future disk pressure.",
                "category": "disk",
            })

        # Network recommendations
        if net > config.NETWORK_THRESHOLD:
            recs.append({
                "priority": "HIGH",
                "recommendation": (
                    f"Network throughput ({net:.3f} MB/cycle) exceeds threshold. "
                    f"Investigate for unauthorized data transfer or "
                    f"misconfigured services."
                ),
                "estimated_impact": "May identify data exfiltration or bandwidth abuse.",
                "category": "network",
            })

        # Anomaly-based recommendations
        active = self.get_active_anomalies()
        critical_count = sum(1 for a in active if a.get("severity") == "CRITICAL")
        high_count = sum(1 for a in active if a.get("severity") == "HIGH")

        if critical_count > 0:
            recs.append({
                "priority": "CRITICAL",
                "recommendation": (
                    f"{critical_count} CRITICAL anomaly(ies) detected. "
                    f"Immediate investigation required. Review the anomaly details "
                    f"and root cause analysis for specific actions."
                ),
                "estimated_impact": "Prevents potential security incident or system failure.",
                "category": "anomaly",
            })

        if high_count > 0:
            recs.append({
                "priority": "HIGH",
                "recommendation": (
                    f"{high_count} HIGH severity anomaly(ies) active. "
                    f"Schedule investigation within the next 15 minutes."
                ),
                "estimated_impact": "Reduces risk of escalation to CRITICAL.",
                "category": "anomaly",
            })

        # Health score recommendations
        if self._health_score < 50:
            recs.append({
                "priority": "HIGH",
                "recommendation": (
                    f"Overall health score is {self._health_score:.0f}/100. "
                    f"Multiple subsystems are under stress. Consider a full "
                    f"system review and load reduction."
                ),
                "estimated_impact": "Restores system health to acceptable levels.",
                "category": "health",
            })

        # If everything looks good
        if not recs:
            recs.append({
                "priority": "LOW",
                "recommendation": "All systems operating within normal parameters. No action required.",
                "estimated_impact": "Continued stable operation.",
                "category": "status",
            })

        # Sort by priority
        priority_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        recs.sort(key=lambda r: priority_order.get(r["priority"], 4))

        return recs

    def get_timeline(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return the chronological event timeline.

        Args:
            limit: Maximum events to return (most recent first).

        Returns:
            A list of timeline event dicts.
        """
        events = list(self._timeline)
        events.reverse()
        return events[:limit]

    def generate_insights(self) -> Dict[str, Any]:
        """Generate a natural-language AI summary of the current state.

        Returns:
            A dict with ``summary``, ``key_findings``, ``risk_level``,
            and ``timestamp``.
        """
        with config.data_lock:
            recent = list(config.metrics_data[-20:]) if config.metrics_data else []
            proc_data = list(config.process_data[-5:]) if config.process_data else []

        if not recent:
            return {
                "summary": "Monitoring has not started yet. Start monitoring to receive AI-powered insights.",
                "key_findings": [],
                "risk_level": "UNKNOWN",
                "timestamp": datetime.now().isoformat(),
            }

        latest = recent[-1]
        cpu = float(latest.get("cpu_percent", 0))
        ram = float(latest.get("ram_percent", 0))
        disk = float(latest.get("disk_percent", 0))
        net = float(latest.get("net_sent_mb", 0)) + float(latest.get("net_recv_mb", 0))

        findings: List[str] = []
        paragraphs: List[str] = []

        # Load assessment
        if cpu > 85:
            load_desc = "heavy"
        elif cpu > 60:
            load_desc = "moderate"
        elif cpu > 30:
            load_desc = "light"
        else:
            load_desc = "minimal"

        paragraphs.append(
            f"The system is currently operating under {load_desc} load."
        )

        # CPU analysis
        if cpu > config.CPU_THRESHOLD:
            duration_above = sum(
                1 for m in recent if float(m.get("cpu_percent", 0)) > config.CPU_THRESHOLD
            )
            duration_min = (duration_above * config.MONITOR_INTERVAL) / 60
            paragraphs.append(
                f"CPU utilization is at {cpu:.1f}% and has exceeded the "
                f"{config.CPU_THRESHOLD}% threshold for approximately "
                f"{duration_min:.0f} minutes."
            )
            findings.append(f"CPU above threshold for ~{duration_min:.0f} min")
        elif cpu > 70:
            paragraphs.append(
                f"CPU utilization at {cpu:.1f}% is elevated but below the alert threshold."
            )

        # RAM analysis
        if ram > config.RAM_THRESHOLD:
            # Check for continuous increase (potential leak)
            if len(recent) >= 5:
                ram_values = [float(m.get("ram_percent", 0)) for m in recent[-5:]]
                if all(ram_values[i] <= ram_values[i + 1] for i in range(len(ram_values) - 1)):
                    increase = ram_values[-1] - ram_values[0]
                    top_mem = "unknown"
                    if proc_data:
                        procs = proc_data[-1].get("processes", [])
                        sp = sorted(procs, key=lambda p: p.get("memory_percent", 0), reverse=True)
                        if sp:
                            top_mem = sp[0].get("name", "unknown")
                    paragraphs.append(
                        f"RAM usage at {ram:.1f}% indicates a possible memory leak "
                        f"originating from {top_mem}. Usage increased by {increase:.1f}% "
                        f"over the last {len(ram_values)} readings."
                    )
                    findings.append(f"Possible memory leak via {top_mem}")
                else:
                    paragraphs.append(f"RAM usage is elevated at {ram:.1f}%.")
        elif ram > 70:
            paragraphs.append(f"RAM usage at {ram:.1f}% is within acceptable range but trending upward.")

        # Disk analysis
        if disk > 90:
            paragraphs.append(
                f"Disk usage is critically high at {disk:.1f}%. Immediate attention required."
            )
            findings.append("Disk usage critical")

        # Network analysis
        if net > config.NETWORK_THRESHOLD:
            paragraphs.append(
                f"Network activity of {net:.3f} MB/cycle is above normal thresholds. "
                f"This may indicate data exfiltration or unusually heavy traffic."
            )
            findings.append("Abnormal network activity detected")

        # Health score
        paragraphs.append(
            f"Overall Health Score is {self._health_score:.0f}/100. "
            f"Status: {self._health_status}."
        )

        # Active anomalies
        active = self.get_active_anomalies()
        if active:
            crit = sum(1 for a in active if a.get("severity") == "CRITICAL")
            high = sum(1 for a in active if a.get("severity") == "HIGH")
            if crit > 0:
                paragraphs.append(f"{crit} CRITICAL anomaly(ies) require immediate attention.")
                findings.append(f"{crit} CRITICAL anomalies active")
            if high > 0:
                paragraphs.append(f"{high} HIGH severity anomaly(ies) detected.")
                findings.append(f"{high} HIGH anomalies active")

        # Recommendation
        if self._health_score < 50:
            paragraphs.append("Immediate action is recommended.")
        elif self._health_score < 70:
            paragraphs.append("Monitoring and preemptive action are advised.")
        else:
            paragraphs.append("No immediate action required.")

        # Risk level
        if self._health_score >= 80:
            risk = "LOW"
        elif self._health_score >= 60:
            risk = "MODERATE"
        elif self._health_score >= 40:
            risk = "HIGH"
        else:
            risk = "CRITICAL"

        return {
            "summary": " ".join(paragraphs),
            "key_findings": findings,
            "risk_level": risk,
            "timestamp": datetime.now().isoformat(),
        }

    def compare_to_baseline(self) -> Dict[str, Any]:
        """Compare current metric values against their learned baseline.

        Returns:
            A dict with per-metric current/baseline/deviation values.
        """
        with config.data_lock:
            latest = config.metrics_data[-1] if config.metrics_data else {}

        if not latest:
            return {"metrics": [], "baseline_computed": self._baseline_computed}

        net_now = float(latest.get("net_sent_mb", 0)) + float(latest.get("net_recv_mb", 0))

        comparisons = []
        metric_pairs = [
            ("CPU", "cpu_percent", float(latest.get("cpu_percent", 0))),
            ("RAM", "ram_percent", float(latest.get("ram_percent", 0))),
            ("Disk", "disk_percent", float(latest.get("disk_percent", 0))),
            ("Network", "net_throughput_mb", net_now),
        ]

        for display, key, current in metric_pairs:
            baseline = self._baseline.get(key, 0.0)
            if baseline > 0:
                deviation = ((current - baseline) / baseline) * 100
            else:
                deviation = 0.0

            status = "normal"
            if deviation > 30:
                status = "critical"
            elif deviation > 15:
                status = "warning"
            elif deviation < -15:
                status = "low"

            comparisons.append({
                "metric": display,
                "key": key,
                "current": round(current, 2),
                "baseline": round(baseline, 2),
                "deviation_percent": round(deviation, 1),
                "status": status,
            })

        return {
            "metrics": comparisons,
            "baseline_computed": self._baseline_computed,
            "timestamp": latest.get("timestamp", datetime.now().isoformat()),
        }

    def get_dashboard_bundle(self) -> Dict[str, Any]:
        """Return all AI dashboard data in a single response.

        This is the preferred endpoint for the dashboard to call —
        one HTTP request returns everything the AI tab needs, reducing
        the number of polling round-trips.

        Returns:
            A dict with keys: ``health``, ``root_causes``, ``trends``,
            ``active_anomalies``, ``recommendations``, ``timeline``,
            ``insights``, ``baseline_comparison``.
        """
        return {
            "health": self.compute_health_score(),
            "root_causes": self.analyze_root_cause(),
            "trends": self.analyze_trends(),
            "active_anomalies": self.get_active_anomalies(),
            "recommendations": self.generate_recommendations(),
            "timeline": self.get_timeline(limit=30),
            "insights": self.generate_insights(),
            "baseline_comparison": self.compare_to_baseline(),
        }

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
    # Private helpers — original
    # ------------------------------------------------------------------
    def _engineer_features(
        self,
        metric: Dict[str, Any],
        processes: List[Dict[str, Any]],
        rolling_cpu: deque,
        rolling_ram: deque,
        rolling_net: deque,
    ) -> List[float]:
        """Compute the full feature vector for one monitoring sample."""
        cpu    = float(metric.get("cpu_percent",  0.0))
        ram    = float(metric.get("ram_percent",  0.0))
        disk   = float(metric.get("disk_percent", 0.0))
        sent   = float(metric.get("net_sent_mb",  0.0))
        recv   = float(metric.get("net_recv_mb",  0.0))
        net_tp = sent + recv

        cpu_ram_ratio = cpu / max(ram, 1.0)

        proc_cpus  = [float(p.get("cpu_percent",    0.0)) for p in processes]
        proc_mems  = [float(p.get("memory_percent", 0.0)) for p in processes]
        avg_proc_cpu = float(np.mean(proc_cpus))  if proc_cpus else 0.0
        avg_proc_mem = float(np.mean(proc_mems))  if proc_mems else 0.0
        total_procs  = float(len(processes))

        rolling_cpu.append(cpu)
        rolling_ram.append(ram)
        rolling_net.append(net_tp)

        roll_cpu_avg = float(np.mean(rolling_cpu)) if rolling_cpu else cpu
        roll_ram_avg = float(np.mean(rolling_ram)) if rolling_ram else ram
        roll_net_avg = float(np.mean(rolling_net)) if rolling_net else net_tp

        return [
            cpu, ram, disk, sent, recv, net_tp, cpu_ram_ratio,
            avg_proc_cpu, avg_proc_mem, total_procs,
            roll_cpu_avg, roll_ram_avg, roll_net_avg,
        ]

    @staticmethod
    def _impute(matrix: np.ndarray) -> np.ndarray:
        """Replace NaN and Inf values with column medians."""
        matrix = np.where(np.isinf(matrix), np.nan, matrix)
        col_medians = np.nanmedian(matrix, axis=0)
        nan_mask    = np.isnan(matrix)
        if nan_mask.any():
            matrix[nan_mask] = np.take(col_medians, np.where(nan_mask)[1])
        return matrix

    @staticmethod
    def _score_to_decision(raw_score: float) -> Tuple[bool, float]:
        """Convert an Isolation Forest score to (is_anomaly, confidence)."""
        is_anomaly = raw_score < 0.0
        confidence = float(np.clip((0.5 - raw_score) * 100.0, 0.0, 100.0))
        return is_anomaly, confidence

    def _compute_severity(
        self,
        raw_score: float,
        features: np.ndarray,
        metric: Dict[str, Any],
    ) -> str:
        """Map anomaly score + feature context to a severity label."""
        if raw_score >= 0.0:
            return "NORMAL"

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
        """Construct a human-readable explanation of the prediction."""
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
        """Trigger a background retraining cycle without blocking inference."""
        def _retrain() -> None:
            logger.info("Background retrain triggered after %d new samples.", self.cfg.retrain_interval)
            with config.data_lock:
                metrics_snap  = list(config.metrics_data)
                process_snap  = list(config.process_data)
            self.train_model(metrics_snap, process_snap)

        t = threading.Thread(target=_retrain, daemon=True, name="AIRetrainThread")
        t.start()

    # ------------------------------------------------------------------
    # NEW: shared pipeline helper for the three newest explainable engines
    # ------------------------------------------------------------------
    def _run_extended_ai_pipeline(
        self,
        metric: Dict[str, Any],
        processes: List[Dict[str, Any]],
        prediction: AnomalyPrediction,
    ) -> None:
        """Run Trend Analysis, Predictive Alerts, and Recommendations, in order.

        Called once per monitoring cycle from both branches of
        ``predict_anomaly`` (trained and not-yet-trained), after health
        score and (if applicable) Root Cause Analysis have already run
        this cycle. Each stage is independently guarded so a failure in
        one never blocks the others or the caller.

        Pipeline order: Trend Analysis -> Predictive Alerts (consumes
        trend output) -> Recommendations (consumes prediction, RCA,
        trend output, and health score).
        """
        trend_results: List[Dict[str, Any]] = []
        try:
            trend_results = self._trend_engine.analyze()
        except Exception:
            logger.exception("Trend Analysis failed for cycle at %s.", prediction.timestamp)

        try:
            self._predictive_engine.forecast(trend_results, metric)
        except Exception:
            logger.exception("Predictive Alert forecasting failed for cycle at %s.", prediction.timestamp)

        try:
            self._recommendation_engine.generate(prediction, metric, processes, trend_results)
        except Exception:
            logger.exception("Recommendation generation failed for cycle at %s.", prediction.timestamp)

    # ------------------------------------------------------------------
    # Private helpers — NEW dashboard intelligence
    # ------------------------------------------------------------------
    def _update_health_score(
        self,
        metric: Dict[str, Any],
        prediction: AnomalyPrediction,
        processes: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """Recompute the composite health score after each prediction.

        The health score is a weighted combination of:
            - Individual metric proximity to thresholds (60% weight)
            - Recent anomaly density (25% weight)
            - Trend stability (15% weight)
        """
        reasons: List[str] = []
        score = 100.0

        cpu = float(metric.get("cpu_percent", 0))
        ram = float(metric.get("ram_percent", 0))
        disk = float(metric.get("disk_percent", 0))
        net = float(metric.get("net_sent_mb", 0)) + float(metric.get("net_recv_mb", 0))

        # ── Metric-based penalties (60% weight) ──
        # CPU penalty
        if cpu > config.CPU_THRESHOLD:
            penalty = min(20.0, (cpu - config.CPU_THRESHOLD) * 0.8)
            score -= penalty
            duration_above = sum(
                1 for v in self._rolling_cpu if v > config.CPU_THRESHOLD
            )
            if duration_above > 0:
                dur_min = (duration_above * config.MONITOR_INTERVAL) / 60
                reasons.append(f"CPU remained above {config.CPU_THRESHOLD}% for ~{dur_min:.0f} minutes.")
        elif cpu > 70:
            score -= (cpu - 70) * 0.3

        # RAM penalty
        if ram > config.RAM_THRESHOLD:
            penalty = min(20.0, (ram - config.RAM_THRESHOLD) * 0.8)
            score -= penalty
            # Check for continuous increase
            if len(self._rolling_ram) >= 5:
                ram_list = list(self._rolling_ram)[-5:]
                if all(ram_list[i] <= ram_list[i + 1] for i in range(len(ram_list) - 1)):
                    increase = ram_list[-1] - ram_list[0]
                    reasons.append(f"RAM usage increased continuously by {increase:.0f}%.")
                else:
                    reasons.append(f"RAM usage at {ram:.1f}% exceeds threshold.")
        elif ram > 70:
            score -= (ram - 70) * 0.3

        # Disk penalty
        if disk > 90:
            score -= min(15.0, (disk - 90) * 1.5)
            reasons.append(f"Disk usage critically high at {disk:.1f}%.")
        elif disk > 80:
            score -= (disk - 80) * 0.3

        # Network penalty
        if net > config.NETWORK_THRESHOLD:
            score -= min(10.0, (net - config.NETWORK_THRESHOLD) * 0.1)
            reasons.append(f"Network throughput {net:.3f} MB exceeds threshold.")

        # ── Anomaly-based penalties (25% weight) ──
        active = self._active_anomalies[-10:]
        recent_critical = sum(1 for a in active if a.get("severity") == "CRITICAL")
        recent_high = sum(1 for a in active if a.get("severity") == "HIGH")
        recent_medium = sum(1 for a in active if a.get("severity") == "MEDIUM")

        if recent_critical > 0:
            score -= recent_critical * 8
            reasons.append(f"{recent_critical} critical-severity anomaly(ies) detected.")
        if recent_high > 0:
            score -= recent_high * 5
            reasons.append(f"{recent_high} high-severity anomaly(ies) detected.")
        if recent_medium > 0:
            score -= recent_medium * 2

        # ── Trend stability penalty (15% weight) ──
        trends = self.analyze_trends()
        for t in trends:
            if t.get("direction") == "increasing" and t.get("severity") in ("HIGH", "CRITICAL"):
                score -= 5
                if t.get("trend") not in [r for r in reasons]:
                    reasons.append(f"{t.get('metric', 'Metric')} trending upward rapidly.")

        # Clamp
        score = max(0.0, min(100.0, score))

        # Determine status
        if score >= 90:
            status = "Healthy"
        elif score >= 70:
            status = "Good"
        elif score >= 50:
            status = "Degraded"
        elif score >= 30:
            status = "Poor"
        else:
            status = "Critical"

        # Confidence in health assessment
        sample_count = len(config.metrics_data)
        if sample_count < 5:
            confidence = 40.0
        elif sample_count < 20:
            confidence = 60.0 + sample_count
        else:
            confidence = min(98.0, 80.0 + sample_count * 0.2)

        if not reasons:
            reasons.append("All metrics within normal operating parameters.")

        self._health_score = score
        self._health_status = status
        self._health_confidence = confidence
        self._health_reasons = reasons
        self._last_health_update = datetime.now().isoformat()

        # Timeline event for health changes
        if score < 50:
            self._add_timeline_event(
                "health", f"Health Score Drop: {score:.0f}",
                " | ".join(reasons[:3]),
                severity="HIGH" if score >= 30 else "CRITICAL",
                metadata={"score": score},
            )

    def _register_anomaly(
        self,
        prediction: AnomalyPrediction,
        metric: Dict[str, Any],
        processes: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """Register a detected anomaly into the active anomalies list and timeline."""
        # Find affected metric
        deviations = self._compute_deviations(metric)
        sorted_devs = sorted(deviations.items(), key=lambda x: abs(x[1]), reverse=True)
        affected_metric = sorted_devs[0][0] if sorted_devs else "unknown"

        # Find responsible process
        responsible = "N/A"
        if processes:
            if "cpu" in affected_metric:
                sorted_p = sorted(processes, key=lambda p: p.get("cpu_percent", 0), reverse=True)
            else:
                sorted_p = sorted(processes, key=lambda p: p.get("memory_percent", 0), reverse=True)
            if sorted_p:
                responsible = sorted_p[0].get("name", "unknown")

        anomaly_entry = {
            "timestamp": prediction.timestamp,
            "severity": prediction.severity,
            "confidence": prediction.confidence,
            "anomaly_score": prediction.anomaly_score,
            "affected_metric": affected_metric.replace("_", " ").replace("percent", "").strip().upper(),
            "responsible_process": responsible,
            "reason": prediction.reason,
        }

        self._active_anomalies.append(anomaly_entry)
        # Keep only last 50
        if len(self._active_anomalies) > 50:
            self._active_anomalies = self._active_anomalies[-50:]

        self._add_timeline_event(
            "anomaly",
            f"Anomaly Detected ({prediction.severity})",
            prediction.reason[:120],
            severity=prediction.severity,
            metadata={"score": prediction.anomaly_score, "confidence": prediction.confidence},
        )

        # ── NEW: Explainable AI Root Cause Analysis ──
        # Runs strictly after the anomaly above has already been detected
        # and registered. Performs no detection of its own — it only
        # explains this prediction.
        try:
            rca_result = self._rca_engine.analyze(prediction, metric, processes or [])
            self._add_timeline_event(
                "root_cause",
                f"Root Cause: {rca_result['root_cause']}",
                rca_result["explanation"][:160],
                severity=rca_result["severity"],
                metadata={
                    "primary_metric": rca_result["primary_metric"],
                    "responsible_process": rca_result["responsible_process"].get("name"),
                    "confidence": rca_result["confidence"],
                },
            )
        except Exception:
            logger.exception("Root Cause Analysis failed for anomaly at %s.", prediction.timestamp)

    def _compute_deviations(self, metric: Dict[str, Any]) -> Dict[str, float]:
        """Compute how far each metric deviates from its baseline (%)."""
        deviations: Dict[str, float] = {}
        net_now = float(metric.get("net_sent_mb", 0)) + float(metric.get("net_recv_mb", 0))

        pairs = [
            ("cpu_percent", float(metric.get("cpu_percent", 0))),
            ("ram_percent", float(metric.get("ram_percent", 0))),
            ("disk_percent", float(metric.get("disk_percent", 0))),
            ("net_throughput_mb", net_now),
        ]

        for key, current in pairs:
            baseline = self._baseline.get(key, 0.0)
            if baseline > 0:
                deviations[key] = ((current - baseline) / baseline) * 100
            else:
                # Use rolling mean as fallback
                if key == "cpu_percent" and self._rolling_cpu:
                    bl = float(np.mean(self._rolling_cpu))
                    deviations[key] = ((current - bl) / max(bl, 1)) * 100
                elif key == "ram_percent" and self._rolling_ram:
                    bl = float(np.mean(self._rolling_ram))
                    deviations[key] = ((current - bl) / max(bl, 1)) * 100
                elif key == "net_throughput_mb" and self._rolling_net:
                    bl = float(np.mean(self._rolling_net))
                    deviations[key] = ((current - bl) / max(bl, 0.001)) * 100
                else:
                    deviations[key] = 0.0

        return deviations

    def _compute_baseline(self, metrics_list: List[Dict[str, Any]]) -> None:
        """Compute baseline averages from training data."""
        if not metrics_list:
            return

        cpus = [float(m.get("cpu_percent", 0)) for m in metrics_list]
        rams = [float(m.get("ram_percent", 0)) for m in metrics_list]
        disks = [float(m.get("disk_percent", 0)) for m in metrics_list]
        nets = [
            float(m.get("net_sent_mb", 0)) + float(m.get("net_recv_mb", 0))
            for m in metrics_list
        ]

        self._baseline = {
            "cpu_percent": float(np.mean(cpus)),
            "ram_percent": float(np.mean(rams)),
            "disk_percent": float(np.mean(disks)),
            "net_throughput_mb": float(np.mean(nets)),
        }
        self._baseline_computed = True
        logger.info("Baseline computed: %s", self._baseline)

    def _detect_trend(self, values: List[float], display_name: str) -> Dict[str, Any]:
        """Analyze a list of metric values and detect trends."""
        if len(values) < 3:
            return {
                "metric": display_name,
                "trend": "Insufficient data",
                "direction": "stable",
                "duration_samples": len(values),
                "confidence": 0.0,
                "severity": "NORMAL",
                "current_value": values[-1] if values else 0,
                "change_rate": 0.0,
            }

        arr = np.array(values, dtype=float)
        n = len(arr)

        # Simple linear regression for trend direction
        x = np.arange(n, dtype=float)
        slope = float(np.polyfit(x, arr, 1)[0])

        # Calculate change rate per sample
        change_rate = slope

        # Determine direction
        if abs(slope) < 0.1:
            direction = "stable"
            trend_desc = f"{display_name} is stable"
        elif slope > 0:
            direction = "increasing"
            trend_desc = f"{display_name} increasing steadily"
        else:
            direction = "decreasing"
            trend_desc = f"{display_name} decreasing"

        # Check for spikes (high variance)
        std = float(np.std(arr))
        mean = float(np.mean(arr))
        if std > mean * 0.3 and mean > 5:
            trend_desc = f"{display_name}: repeated spikes detected"
            direction = "volatile"

        # Trend confidence based on R²
        if n >= 3:
            correlation = float(np.corrcoef(x, arr)[0, 1]) if np.std(arr) > 0 else 0
            confidence = min(99.0, abs(correlation) * 100)
        else:
            confidence = 30.0

        # Severity
        if direction == "increasing" and abs(slope) > 2.0:
            severity = "HIGH"
        elif direction == "increasing" and abs(slope) > 0.5:
            severity = "MEDIUM"
        elif direction == "volatile":
            severity = "MEDIUM"
        else:
            severity = "LOW" if direction != "stable" else "NORMAL"

        return {
            "metric": display_name,
            "trend": trend_desc,
            "direction": direction,
            "duration_samples": n,
            "confidence": round(confidence, 1),
            "severity": severity,
            "current_value": round(float(arr[-1]), 2),
            "change_rate": round(change_rate, 3),
        }

    def _determine_root_cause(
        self,
        primary_metric: str,
        deviation: float,
        metric: Dict[str, Any],
        process_name: str,
    ) -> Tuple[str, str]:
        """Return (root_cause_description, recommendation) for a metric."""
        cpu = float(metric.get("cpu_percent", 0))
        ram = float(metric.get("ram_percent", 0))

        if "cpu" in primary_metric:
            if cpu > 90:
                cause = f"Extreme CPU load ({cpu:.1f}%). Likely caused by '{process_name}' consuming excessive compute resources."
                rec = f"Terminate or restart '{process_name}'. Investigate for infinite loops or runaway computation."
            else:
                cause = f"Elevated CPU usage ({cpu:.1f}%), {abs(deviation):.0f}% above baseline."
                rec = f"Monitor '{process_name}' and consider reducing concurrent workloads."
        elif "ram" in primary_metric:
            # Check for steady increase (leak indicator)
            if len(self._rolling_ram) >= 5:
                ram_list = list(self._rolling_ram)[-5:]
                if all(ram_list[i] <= ram_list[i + 1] for i in range(len(ram_list) - 1)):
                    cause = f"Possible memory leak. RAM at {ram:.1f}% with continuous upward trend via '{process_name}'."
                    rec = f"Restart '{process_name}' and inspect memory allocation. Check for unclosed handles."
                else:
                    cause = f"High RAM usage ({ram:.1f}%), {abs(deviation):.0f}% above baseline."
                    rec = f"Close unused applications. Monitor '{process_name}' memory consumption."
            else:
                cause = f"RAM usage ({ram:.1f}%) deviating from baseline."
                rec = f"Monitor '{process_name}' and consider freeing memory."
        elif "disk" in primary_metric:
            disk = float(metric.get("disk_percent", 0))
            cause = f"Disk usage at {disk:.1f}% is growing. Possible log accumulation or data growth."
            rec = "Clear temporary files, rotate logs, or expand storage capacity."
        elif "net" in primary_metric:
            net = float(metric.get("net_sent_mb", 0)) + float(metric.get("net_recv_mb", 0))
            cause = f"Abnormal network activity ({net:.3f} MB/cycle). Possible data exfiltration or service misconfiguration."
            rec = f"Investigate '{process_name}' network connections. Check for unauthorized outbound traffic."
        else:
            cause = f"Multivariate anomaly — no single metric dominates. Combined behavior deviates from learned baseline."
            rec = "Review all system metrics and active processes for coordinated anomalies."

        return cause, rec

    def _add_timeline_event(
        self,
        event_type: str,
        title: str,
        description: str,
        severity: str = "NORMAL",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Append an event to the internal timeline."""
        # Throttle metric events (only keep every 3rd to avoid flooding)
        if event_type == "metric":
            metric_events = sum(1 for e in self._timeline if e.get("event_type") == "metric")
            if metric_events > 0 and metric_events % 3 != 0:
                return

        event = TimelineEvent(
            timestamp=datetime.now().isoformat(),
            event_type=event_type,
            title=title,
            description=description,
            severity=severity,
            metadata=metadata or {},
        )
        self._timeline.append(event.to_dict())


# ---------------------------------------------------------------------------
# NEW: Explainable AI Root Cause Analysis Engine
# ---------------------------------------------------------------------------
class RootCauseAnalysisEngine:
    """Explainable AI Root Cause Analysis Engine.

    Independent module that runs strictly *after* ``AnomalyDetectionEngine``
    has already flagged a sample as anomalous. It performs NO anomaly
    detection of its own — it only consumes an already-computed
    :class:`AnomalyPrediction` plus the raw metric/process snapshot that
    produced it, and explains *why* the anomaly happened.

    This keeps the original Isolation Forest detection logic completely
    untouched: this class is a pure downstream consumer, wired in from
    ``AnomalyDetectionEngine._register_anomaly`` (an additive "dashboard
    intelligence" hook, not part of the core scoring path).

    Attributes:
        _parent: Read-only back-reference to the owning
            ``AnomalyDetectionEngine``, used only to read its rolling
            windows and learned baseline. No state is written back to it.
        _history: Bounded history of past root-cause results, most
            recent last.
        _latest: The most recently computed root-cause result, or
            ``None`` if no anomaly has been analyzed yet this session.
    """

    # Root-cause classification labels
    _LABEL_CPU_SATURATION      = "CPU Saturation"
    _LABEL_MEMORY_LEAK         = "Possible Memory Leak"
    _LABEL_DISK_BOTTLENECK     = "Disk Bottleneck"
    _LABEL_NETWORK_TRAFFIC     = "Heavy Network Traffic"
    _LABEL_RUNAWAY_PROCESS     = "Runaway Process"
    _LABEL_RESOURCE_SPIKE      = "Abnormal Resource Spike"
    _LABEL_TOO_MANY_PROCESSES  = "Too Many Background Processes"
    _LABEL_MULTI_HIGH_PROCESS  = "Multiple High Resource Processes"

    def __init__(self, parent_engine: "AnomalyDetectionEngine") -> None:
        self._parent: "AnomalyDetectionEngine" = parent_engine
        self._history: deque = deque(maxlen=100)
        self._latest: Optional[Dict[str, Any]] = None
        self._lock: threading.Lock = threading.Lock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def analyze(
        self,
        prediction: AnomalyPrediction,
        metric: Dict[str, Any],
        processes: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Explain a single already-detected anomaly.

        Args:
            prediction: The :class:`AnomalyPrediction` returned by
                ``AnomalyDetectionEngine.predict_anomaly`` for this cycle.
                Only consumed — never recomputed.
            metric: The raw system metric dict for this cycle.
            processes: The top-process snapshot for this cycle.

        Returns:
            A database/API-friendly dict matching the documented Root
            Cause Analysis output schema (``timestamp``, ``root_cause``,
            ``primary_metric``, ``responsible_process``, ``confidence``,
            ``severity``, ``historical_comparison``, ``recommendation``,
            ``explanation``).
        """
        deviations = self._parent._compute_deviations(metric)
        primary_key, primary_dev = self._identify_primary_metric(deviations)

        responsible_process = self._identify_responsible_process(primary_key, processes)

        duration_samples, continuous_increase = self._trend_context(primary_key)
        duration_min = (duration_samples * config.MONITOR_INTERVAL) / 60.0

        root_cause = self._classify_root_cause(
            primary_key, primary_dev, deviations, processes, continuous_increase
        )

        explanation = self._build_explanation(
            primary_key, primary_dev, metric, responsible_process,
            duration_min, continuous_increase, root_cause,
        )

        historical_comparison = self._historical_comparison_text(primary_key, primary_dev)

        recommendation = self._build_recommendation(root_cause, responsible_process, primary_key)

        confidence = self._compute_confidence(prediction, primary_dev)

        result: Dict[str, Any] = {
            "timestamp": prediction.timestamp,
            "root_cause": root_cause,
            "primary_metric": self._display_metric_name(primary_key),
            "responsible_process": responsible_process,
            "confidence": round(confidence, 1),
            "severity": prediction.severity,
            "historical_comparison": historical_comparison,
            "recommendation": recommendation,
            "explanation": explanation,
        }

        with self._lock:
            self._latest = result
            self._history.append(result)

        return result

    def get_latest(self) -> Optional[Dict[str, Any]]:
        """Return the most recently computed root-cause result, if any."""
        with self._lock:
            return dict(self._latest) if self._latest else None

    def get_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return past root-cause results, most recent first."""
        with self._lock:
            items = list(self._history)
        items.reverse()
        return items[:limit]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _display_metric_name(key: str) -> str:
        names = {
            "cpu_percent": "CPU Usage",
            "ram_percent": "RAM Usage",
            "disk_percent": "Disk Usage",
            "net_throughput_mb": "Network Throughput",
            "process_activity": "Process Activity",
        }
        return names.get(key, key.replace("_", " ").title())

    def _identify_primary_metric(self, deviations: Dict[str, float]) -> Tuple[str, float]:
        """Pick the metric with the largest absolute deviation from baseline."""
        if not deviations:
            return "cpu_percent", 0.0
        sorted_devs = sorted(deviations.items(), key=lambda kv: abs(kv[1]), reverse=True)
        return sorted_devs[0]

    def _identify_responsible_process(
        self, primary_key: str, processes: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Pick the top process for the resource type behind the anomaly.

        Note: the project's process collector (``config.py``) tracks
        ``memory_percent`` rather than an absolute MB figure, so the
        ``memory`` field below is a percentage, not megabytes.
        """
        if not processes:
            return {
                "name": "N/A", "pid": -1, "cpu": 0.0, "memory": 0.0, "status": "unknown",
            }

        if "ram" in primary_key or "memory" in primary_key:
            sorted_p = sorted(processes, key=lambda p: p.get("memory_percent", 0.0), reverse=True)
        else:
            sorted_p = sorted(processes, key=lambda p: p.get("cpu_percent", 0.0), reverse=True)

        top = sorted_p[0]
        return {
            "name":   top.get("name", "unknown"),
            "pid":    top.get("pid", -1),
            "cpu":    round(float(top.get("cpu_percent", 0.0)), 2),
            "memory": round(float(top.get("memory_percent", 0.0)), 2),
            "status": top.get("status", "unknown"),
        }

    def _trend_context(self, primary_key: str) -> Tuple[int, bool]:
        """Return (samples above baseline, is continuously increasing)."""
        window_map = {
            "cpu_percent": self._parent._rolling_cpu,
            "ram_percent": self._parent._rolling_ram,
            "net_throughput_mb": self._parent._rolling_net,
        }
        window = window_map.get(primary_key)
        if not window or len(window) < 2:
            return 0, False

        values = list(window)
        baseline = self._parent._baseline.get(primary_key, 0.0)
        duration = sum(1 for v in values if baseline and v > baseline)

        tail = values[-5:] if len(values) >= 5 else values
        continuous_increase = len(tail) >= 3 and all(
            tail[i] <= tail[i + 1] for i in range(len(tail) - 1)
        )
        return duration, continuous_increase

    def _classify_root_cause(
        self,
        primary_key: str,
        primary_dev: float,
        deviations: Dict[str, float],
        processes: List[Dict[str, Any]],
        continuous_increase: bool,
    ) -> str:
        """Map metric + pattern context to a labelled root cause."""
        high_dev_count = sum(1 for v in deviations.values() if abs(v) >= 30)

        if high_dev_count >= 2:
            return self._LABEL_MULTI_HIGH_PROCESS

        high_cpu_procs = sum(1 for p in processes if p.get("cpu_percent", 0.0) > 50)
        if len(processes) >= 5 and high_cpu_procs >= 3:
            return self._LABEL_TOO_MANY_PROCESSES

        if "ram" in primary_key:
            return self._LABEL_MEMORY_LEAK if continuous_increase else self._LABEL_RESOURCE_SPIKE
        if "cpu" in primary_key:
            if processes and processes[0].get("cpu_percent", 0.0) > 90:
                return self._LABEL_RUNAWAY_PROCESS
            return self._LABEL_CPU_SATURATION
        if "disk" in primary_key:
            return self._LABEL_DISK_BOTTLENECK
        if "net" in primary_key:
            return self._LABEL_NETWORK_TRAFFIC

        return self._LABEL_RESOURCE_SPIKE

    def _build_explanation(
        self,
        primary_key: str,
        primary_dev: float,
        metric: Dict[str, Any],
        responsible_process: Dict[str, Any],
        duration_min: float,
        continuous_increase: bool,
        root_cause: str,
    ) -> str:
        proc_name = responsible_process.get("name", "N/A")
        current_val = float(metric.get(primary_key, 0.0)) if primary_key in metric else None
        metric_disp = self._display_metric_name(primary_key)

        parts: List[str] = []

        if current_val is not None:
            parts.append(f"{metric_disp} is currently at {current_val:.1f}%.")

        if continuous_increase and duration_min > 0:
            parts.append(
                f"{metric_disp} has increased continuously over the last "
                f"~{duration_min:.0f} minute(s)."
            )
        elif duration_min > 0:
            parts.append(
                f"{metric_disp} has remained above its learned baseline for "
                f"~{duration_min:.0f} minute(s)."
            )

        if proc_name != "N/A":
            if root_cause == self._LABEL_MEMORY_LEAK:
                parts.append(
                    f"The process '{proc_name}' continuously consumed memory "
                    f"without releasing it, consistent with a leak pattern."
                )
            elif root_cause == self._LABEL_RUNAWAY_PROCESS:
                parts.append(
                    f"The process '{proc_name}' is consuming an unusually large "
                    f"share of CPU, consistent with a runaway or stuck process."
                )
            elif root_cause == self._LABEL_MULTI_HIGH_PROCESS:
                parts.append(
                    f"Multiple metrics deviated from baseline simultaneously, with "
                    f"'{proc_name}' among the top resource consumers — suggesting "
                    f"coordinated resource exhaustion rather than a single cause."
                )
            else:
                parts.append(f"'{proc_name}' is the top consumer of the affected resource.")

        parts.append(f"Deviation from learned baseline: {abs(primary_dev):.0f}%.")

        return " ".join(parts)

    def _historical_comparison_text(self, primary_key: str, primary_dev: float) -> str:
        metric_disp = self._display_metric_name(primary_key)
        direction = "above" if primary_dev >= 0 else "below"
        return f"{metric_disp} is currently {abs(primary_dev):.0f}% {direction} its learned baseline."

    def _build_recommendation(
        self,
        root_cause: str,
        responsible_process: Dict[str, Any],
        primary_key: str,
    ) -> str:
        proc_name = responsible_process.get("name", "the responsible process")

        recommendations = {
            self._LABEL_MEMORY_LEAK: (
                f"Restart '{proc_name}' and inspect its memory allocation for a leak."
            ),
            self._LABEL_CPU_SATURATION: (
                f"Reduce CPU-intensive workloads and review '{proc_name}' for "
                f"unnecessary compute usage."
            ),
            self._LABEL_RUNAWAY_PROCESS: (
                f"Terminate or restart '{proc_name}'; investigate for an infinite "
                f"loop or stuck operation."
            ),
            self._LABEL_DISK_BOTTLENECK: (
                "Check disk-intensive applications, clear temporary files or logs, "
                "and consider expanding storage."
            ),
            self._LABEL_NETWORK_TRAFFIC: (
                f"Investigate unusual network activity from '{proc_name}'; check for "
                f"unauthorized outbound connections or possible data exfiltration."
            ),
            self._LABEL_TOO_MANY_PROCESSES: (
                "Review background processes and close unnecessary ones to free up "
                "system resources."
            ),
            self._LABEL_MULTI_HIGH_PROCESS: (
                f"Investigate '{proc_name}' and other high-resource processes for "
                f"coordinated abnormal activity, including possible malware."
            ),
            self._LABEL_RESOURCE_SPIKE: (
                f"Monitor '{proc_name}' for recurring spikes; if they persist, "
                f"inspect the process for potential malware or misconfiguration."
            ),
        }

        return recommendations.get(
            root_cause,
            f"Investigate '{proc_name}' and monitor {self._display_metric_name(primary_key)} closely.",
        )

    @staticmethod
    def _compute_confidence(prediction: AnomalyPrediction, primary_dev: float) -> float:
        """Blend the anomaly model's confidence with deviation strength."""
        base = prediction.confidence
        dev_component = min(40.0, abs(primary_dev) * 0.8)
        blended = (base * 0.6) + (dev_component + 50.0) * 0.4
        return float(np.clip(blended, 0.0, 99.9))


# ---------------------------------------------------------------------------
# NEW: Explainable AI Health Score Engine
# ---------------------------------------------------------------------------
@dataclass
class HealthScoreWeights:
    """Configurable weights for the AI Health Score Engine.

    Weights need not sum to exactly 1.0 — :meth:`HealthScoreEngine.compute`
    normalizes by the total automatically — but keeping them close to 1.0
    keeps the numbers intuitive when tuning.

    Future developers can change system health scoring behavior entirely
    by constructing ``HealthScoreEngine(parent, weights=HealthScoreWeights(...))``
    with different values — no changes to the scoring algorithm itself
    are required.

    Attributes:
        cpu: Weight for the CPU utilisation sub-score.
        ram: Weight for the RAM utilisation sub-score.
        disk: Weight for the disk utilisation sub-score.
        network: Weight for the network throughput sub-score.
        anomalies: Weight for the active-anomaly-severity sub-score.
        historical: Weight for the baseline-deviation sub-score.
    """
    cpu:        float = 0.25
    ram:        float = 0.25
    disk:       float = 0.15
    network:    float = 0.10
    anomalies:  float = 0.15
    historical: float = 0.10

    def as_dict(self) -> Dict[str, float]:
        """Return the weights as a plain dict (API/DB friendly)."""
        return asdict(self)

    def total(self) -> float:
        """Return the sum of all weights, used for normalization."""
        return sum(self.as_dict().values())


class HealthScoreEngine:
    """Explainable AI Health Score Engine.

    Independent module recalculated every monitoring cycle. It combines
    the current metric snapshot, the active-anomaly list, and the latest
    Root Cause Analysis result into one weighted, human-explainable
    health score — without duplicating the anomaly-detection scoring,
    the Root Cause Analysis logic, or the pre-existing internal
    ``AnomalyDetectionEngine._health_score`` bookkeeping (which continues
    to independently drive existing recommendations/trend penalties,
    untouched).

    Attributes:
        _parent: Read-only back-reference to the owning
            ``AnomalyDetectionEngine``, used to read its rolling windows,
            learned baseline, active anomalies, and Root Cause Analysis
            engine. No state is written back to it.
        _weights: The configurable :class:`HealthScoreWeights` in use.
        _history: Bounded history of ``(timestamp, score)`` pairs, used to
            compute the "vs. last hour" historical comparison.
        _latest: The most recently computed result, or ``None``.
    """

    _STATUS_BANDS: List[Tuple[float, str]] = [
        (90.0, "Excellent"),
        (75.0, "Good"),
        (60.0, "Fair"),
        (40.0, "Poor"),
        (0.0,  "Critical"),
    ]

    def __init__(
        self,
        parent_engine: "AnomalyDetectionEngine",
        weights: Optional[HealthScoreWeights] = None,
    ) -> None:
        self._parent: "AnomalyDetectionEngine" = parent_engine
        self._weights: HealthScoreWeights = weights or HealthScoreWeights()
        # ~1 hour of history at the project's default 5s monitor interval.
        # Approximate if MONITOR_INTERVAL is changed; documented as such.
        self._history: deque = deque(maxlen=720)
        self._latest: Optional[Dict[str, Any]] = None
        self._lock: threading.Lock = threading.Lock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def compute(
        self,
        metric: Dict[str, Any],
        processes: List[Dict[str, Any]],
        prediction: AnomalyPrediction,
    ) -> Dict[str, Any]:
        """Compute and explain the current AI Health Score.

        Intended to be called once per monitoring cycle, regardless of
        whether an anomaly was detected on this cycle.

        Args:
            metric: The raw system metric dict for this cycle.
            processes: The top-process snapshot for this cycle.
            prediction: The :class:`AnomalyPrediction` for this cycle
                (consumed only for its severity/confidence — never
                recomputed).

        Returns:
            A database/API-friendly dict matching the documented Health
            Score output schema (``timestamp``, ``health_score``,
            ``status``, ``confidence``, ``contributing_factors``,
            ``weights``, ``explanation``, ``historical_comparison``).
        """
        cpu = float(metric.get("cpu_percent", 0.0))
        ram = float(metric.get("ram_percent", 0.0))
        disk = float(metric.get("disk_percent", 0.0))
        net = float(metric.get("net_sent_mb", 0.0)) + float(metric.get("net_recv_mb", 0.0))

        cpu_sub = self._metric_subscore(cpu, config.CPU_THRESHOLD, config.CPU_THRESHOLD + 10.0)
        ram_sub = self._metric_subscore(ram, config.RAM_THRESHOLD, config.RAM_THRESHOLD + 10.0)
        disk_sub = self._metric_subscore(disk, 80.0, 90.0)
        net_sub = self._metric_subscore(net, config.NETWORK_THRESHOLD, config.NETWORK_THRESHOLD * 1.5)

        active_anomalies = self._parent.get_active_anomalies()
        anomaly_sub, anomaly_summary = self._anomaly_subscore(active_anomalies)

        deviations = self._parent._compute_deviations(metric)
        historical_sub, avg_abs_deviation = self._historical_subscore(deviations)

        w = self._weights
        total_weight = w.total() or 1.0
        weighted_score = (
            cpu_sub * w.cpu + ram_sub * w.ram + disk_sub * w.disk +
            net_sub * w.network + anomaly_sub * w.anomalies +
            historical_sub * w.historical
        ) / total_weight
        health_score = float(np.clip(weighted_score, 0.0, 100.0))

        status = self._score_to_status(health_score)

        rca_latest = self._parent._rca_engine.get_latest()

        contributing_factors = self._build_contributing_factors(
            cpu, ram, disk, net, anomaly_summary, rca_latest,
        )

        explanation = self._build_explanation(
            cpu, ram, disk, net, anomaly_summary, rca_latest, health_score, status,
        )

        confidence = self._compute_confidence()

        with self._lock:
            past_scores = [s for _, s in self._history]
        historical_comparison = self._historical_comparison_text(health_score, past_scores)

        result: Dict[str, Any] = {
            "timestamp": prediction.timestamp,
            "health_score": round(health_score, 1),
            "status": status,
            "confidence": round(confidence, 1),
            "contributing_factors": contributing_factors,
            "weights": w.as_dict(),
            "explanation": explanation,
            "historical_comparison": historical_comparison,
        }

        with self._lock:
            self._latest = result
            self._history.append((prediction.timestamp, health_score))

        return result

    def get_latest(self) -> Optional[Dict[str, Any]]:
        """Return the most recently computed Health Score result, if any."""
        with self._lock:
            return dict(self._latest) if self._latest else None

    def get_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return past Health Score results, most recent first.

        Note: only the single most recent full result object is retained
        verbatim (``_latest``); ``_history`` stores compact
        ``(timestamp, score)`` pairs for trend/comparison purposes. This
        method reconstructs lightweight entries from that compact history.

        Args:
            limit: Maximum number of results to return.
        """
        with self._lock:
            items = list(self._history)
        items.reverse()
        return [
            {"timestamp": ts, "health_score": round(score, 1), "status": self._score_to_status(score)}
            for ts, score in items[:limit]
        ]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------
    @classmethod
    def _score_to_status(cls, score: float) -> str:
        for threshold, label in cls._STATUS_BANDS:
            if score >= threshold:
                return label
        return "Critical"

    @staticmethod
    def _metric_subscore(value: float, warn_threshold: float, danger_threshold: float) -> float:
        """Map a raw metric value to a 0-100 sub-score using its thresholds.

        Stays at 100 while comfortably below the warn threshold, glides
        down to ~85 as it approaches it, drops steeply between warn and
        danger, and bottoms out near 0 beyond danger.
        """
        if warn_threshold <= 0:
            return 100.0
        safe_zone = warn_threshold * 0.7

        if value <= safe_zone:
            return 100.0
        if value <= warn_threshold:
            frac = (value - safe_zone) / max(warn_threshold - safe_zone, 1e-6)
            return 100.0 - frac * 15.0
        if value <= danger_threshold:
            frac = (value - warn_threshold) / max(danger_threshold - warn_threshold, 1e-6)
            return 85.0 - frac * 45.0
        overshoot = value - danger_threshold
        return max(0.0, 40.0 - overshoot * 1.5)

    @staticmethod
    def _anomaly_subscore(active_anomalies: List[Dict[str, Any]]) -> Tuple[float, Dict[str, int]]:
        """Score based on severity-weighted count of currently active anomalies."""
        recent = active_anomalies[:10]
        counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for a in recent:
            sev = a.get("severity", "LOW")
            if sev in counts:
                counts[sev] += 1

        weighted = counts["CRITICAL"] * 4 + counts["HIGH"] * 2 + counts["MEDIUM"] * 1 + counts["LOW"] * 0.5
        subscore = max(0.0, 100.0 - weighted * 10.0)
        return subscore, counts

    @staticmethod
    def _historical_subscore(deviations: Dict[str, float]) -> Tuple[float, float]:
        """Score based on average absolute deviation from the learned baseline."""
        if not deviations:
            return 100.0, 0.0
        avg_abs_dev = float(np.mean([abs(v) for v in deviations.values()]))
        subscore = max(0.0, 100.0 - avg_abs_dev * 1.2)
        return subscore, avg_abs_dev

    @staticmethod
    def _compute_confidence() -> float:
        """Confidence reflects how much monitoring data backs this score."""
        sample_count = len(config.metrics_data)
        if sample_count < 5:
            return 45.0
        if sample_count < 20:
            return 60.0 + sample_count * 0.8
        return float(min(99.0, 80.0 + sample_count * 0.15))

    def _build_contributing_factors(
        self,
        cpu: float, ram: float, disk: float, net: float,
        anomaly_summary: Dict[str, int],
        rca_latest: Optional[Dict[str, Any]],
    ) -> List[str]:
        factors: List[str] = []

        if cpu > config.CPU_THRESHOLD:
            factors.append("High CPU Usage")
        if ram > config.RAM_THRESHOLD:
            if len(self._parent._rolling_ram) >= 3:
                vals = list(self._parent._rolling_ram)[-3:]
                if all(vals[i] <= vals[i + 1] for i in range(len(vals) - 1)):
                    factors.append("Increasing RAM Usage")
                else:
                    factors.append("High RAM Usage")
            else:
                factors.append("High RAM Usage")
        if disk > 90:
            factors.append("Critical Disk Usage")
        if net > config.NETWORK_THRESHOLD:
            factors.append("Abnormal Network Activity")

        total_anomalies = sum(anomaly_summary.values())
        if total_anomalies == 1:
            factors.append("One Active Anomaly")
        elif total_anomalies > 1:
            factors.append(f"{total_anomalies} Active Anomalies")

        if rca_latest and rca_latest.get("root_cause"):
            factors.append(rca_latest["root_cause"])

        if not factors:
            factors.append("All Metrics Nominal")

        return factors

    def _build_explanation(
        self,
        cpu: float, ram: float, disk: float, net: float,
        anomaly_summary: Dict[str, int],
        rca_latest: Optional[Dict[str, Any]],
        health_score: float,
        status: str,
    ) -> str:
        parts: List[str] = [f"Health Score is {health_score:.0f} ({status})."]

        if cpu > config.CPU_THRESHOLD:
            duration_above = sum(1 for v in self._parent._rolling_cpu if v > config.CPU_THRESHOLD)
            dur_min = (duration_above * config.MONITOR_INTERVAL) / 60.0
            parts.append(
                f"CPU utilization remained above {config.CPU_THRESHOLD:.0f}% for "
                f"approximately {dur_min:.0f} minute(s)."
            )

        if ram > config.RAM_THRESHOLD:
            if len(self._parent._rolling_ram) >= 3:
                vals = list(self._parent._rolling_ram)[-3:]
                if all(vals[i] <= vals[i + 1] for i in range(len(vals) - 1)):
                    increase = vals[-1] - vals[0]
                    parts.append(f"RAM usage increased continuously by {increase:.0f}%.")
                else:
                    parts.append(f"RAM usage is elevated at {ram:.1f}%.")
            else:
                parts.append(f"RAM usage is elevated at {ram:.1f}%.")

        high = anomaly_summary.get("HIGH", 0)
        crit = anomaly_summary.get("CRITICAL", 0)
        if crit > 0:
            parts.append(f"{crit} Critical severity anomaly(ies) are currently active.")
        if high > 0:
            parts.append(f"{high} High severity anomaly(ies) are currently active.")

        if rca_latest:
            proc = rca_latest.get("responsible_process", {}).get("name", "N/A")
            if proc and proc != "N/A":
                parts.append(
                    f"The AI Root Cause Analysis identified '{proc}' as the primary "
                    f"contributor ({rca_latest.get('root_cause', 'unknown cause')})."
                )

        if health_score < 60:
            parts.append(
                "Historical comparison indicates current resource utilization is "
                "significantly above the learned baseline, and overall system "
                "stability has decreased."
            )

        return " ".join(parts)

    def _historical_comparison_text(self, current_score: float, past_scores: List[float]) -> str:
        if not past_scores:
            return "Not enough history yet to compare against the last hour."

        avg_past = float(np.mean(past_scores))
        if avg_past <= 0:
            return "Not enough history yet to compare against the last hour."

        delta_pct = ((current_score - avg_past) / avg_past) * 100.0
        direction = "higher" if delta_pct >= 0 else "lower"
        return (
            f"Current health is {abs(delta_pct):.0f}% {direction} than the average "
            f"health score over the recent monitoring history."
        )


# ---------------------------------------------------------------------------
# NEW: Explainable AI Trend Analysis Engine
# ---------------------------------------------------------------------------
class TrendAnalysisEngine:
    """Explainable AI Trend Analysis Engine.

    Independent module, recalculated every monitoring cycle. Analyzes the
    shared ``config.metrics_data`` history (never re-collects metrics) to
    distinguish sustained long-term behavioural trends from temporary
    spikes, for CPU, RAM, Disk, and Network.

    This is a separate implementation from the pre-existing
    ``AnomalyDetectionEngine.analyze_trends()`` / ``_detect_trend()``
    (which remain untouched and continue to back existing
    recommendations/health penalties) — this engine adds duration in
    minutes, explicit spike-vs-trend classification, historical baseline
    comparison, and full-sentence explanations per your spec.

    Attributes:
        _parent: Read-only back-reference to the owning
            ``AnomalyDetectionEngine``, used only to read its learned
            baseline. No state is written back to it.
        _history: Bounded history of past trend-result bundles.
        _latest: The most recently computed list of trend results.
    """

    _SHORT_WINDOW = 12   # ~1 minute at the default 5s monitor interval
    _LONG_WINDOW = 120   # ~10 minutes at the default 5s monitor interval

    _METRIC_DEFS: List[Tuple[str, str]] = [
        ("cpu_percent", "CPU Usage"),
        ("ram_percent", "RAM Usage"),
        ("disk_percent", "Disk Usage"),
        ("net_throughput_mb", "Network Throughput"),
    ]

    def __init__(self, parent_engine: "AnomalyDetectionEngine") -> None:
        self._parent: "AnomalyDetectionEngine" = parent_engine
        self._history: deque = deque(maxlen=200)
        self._latest: List[Dict[str, Any]] = []
        self._lock: threading.Lock = threading.Lock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def analyze(self) -> List[Dict[str, Any]]:
        """Analyze current trend state for every tracked metric.

        Returns:
            A list of trend-result dicts, one per metric (``metric``,
            ``metric_key``, ``trend_name``, ``classification``,
            ``duration_minutes``, ``rate_of_change_per_min``,
            ``confidence``, ``severity``, ``historical_comparison``,
            ``explanation``, ``current_value``, ``timestamp``).
        """
        with config.data_lock:
            snapshot = list(config.metrics_data)

        timestamp = datetime.now().isoformat()
        results = [
            self._analyze_single(key, display, self._extract_values(snapshot, key), timestamp)
            for key, display in self._METRIC_DEFS
        ]

        with self._lock:
            self._latest = results
            self._history.append({"timestamp": timestamp, "trends": results})

        return results

    def get_latest(self) -> List[Dict[str, Any]]:
        """Return the most recently computed trend results."""
        with self._lock:
            return list(self._latest)

    def get_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return past trend-result bundles, most recent first."""
        with self._lock:
            items = list(self._history)
        items.reverse()
        return items[:limit]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _extract_values(snapshot: List[Dict[str, Any]], key: str) -> List[float]:
        if key == "net_throughput_mb":
            return [
                float(m.get("net_sent_mb", 0.0)) + float(m.get("net_recv_mb", 0.0))
                for m in snapshot
            ]
        return [float(m.get(key, 0.0)) for m in snapshot]

    def _analyze_single(
        self, key: str, display: str, values: List[float], timestamp: str
    ) -> Dict[str, Any]:
        n = len(values)
        if n < 3:
            return {
                "metric": display, "metric_key": key,
                "trend_name": "Insufficient Data", "classification": "insufficient_data",
                "duration_minutes": 0.0, "rate_of_change_per_min": 0.0,
                "confidence": 0.0, "severity": "NORMAL",
                "historical_comparison": "Not enough data collected yet.",
                "explanation": f"Not enough {display.lower()} samples have been collected to analyze a trend.",
                "current_value": round(values[-1], 2) if values else 0.0,
                "timestamp": timestamp,
            }

        short = values[-self._SHORT_WINDOW:] if n >= self._SHORT_WINDOW else values
        long_ = values[-self._LONG_WINDOW:] if n >= self._LONG_WINDOW else values

        short_slope, short_conf = self._linreg_slope(short)
        long_slope, long_conf = self._linreg_slope(long_)

        interval_min = max(config.MONITOR_INTERVAL / 60.0, 1e-6)
        short_rate_per_min = short_slope / interval_min
        long_rate_per_min = long_slope / interval_min

        std_short = float(np.std(short))
        mean_short = float(np.mean(short)) or 1.0
        volatile = std_short > mean_short * 0.3 and mean_short > 5.0

        classification, rate_used, confidence = self._classify(
            short_rate_per_min, long_rate_per_min, short_conf, long_conf, volatile
        )

        duration_minutes = (len(long_) * config.MONITOR_INTERVAL) / 60.0
        current = values[-1]

        baseline = self._parent._baseline.get(key, 0.0)
        if baseline > 0:
            dev_pct = ((current - baseline) / baseline) * 100.0
            historical_comparison = (
                f"{display} is currently {abs(dev_pct):.0f}% "
                f"{'above' if dev_pct >= 0 else 'below'} its learned baseline."
            )
        else:
            historical_comparison = f"{display} baseline has not been learned yet."

        trend_name, severity, explanation = self._build_trend_narrative(
            key, display, classification, rate_used, duration_minutes, current, historical_comparison,
        )

        return {
            "metric": display, "metric_key": key,
            "trend_name": trend_name, "classification": classification,
            "duration_minutes": round(duration_minutes, 1),
            "rate_of_change_per_min": round(rate_used, 3),
            "confidence": round(confidence, 1), "severity": severity,
            "historical_comparison": historical_comparison,
            "explanation": explanation,
            "current_value": round(current, 2),
            "timestamp": timestamp,
        }

    @staticmethod
    def _linreg_slope(values: List[float]) -> Tuple[float, float]:
        """Return (slope-per-sample, confidence%) via simple linear regression."""
        n = len(values)
        if n < 2:
            return 0.0, 0.0
        arr = np.array(values, dtype=float)
        x = np.arange(n, dtype=float)
        slope = float(np.polyfit(x, arr, 1)[0])
        if np.std(arr) > 0:
            corr = float(np.corrcoef(x, arr)[0, 1])
            confidence = min(99.0, abs(corr) * 100.0)
        else:
            confidence = 20.0
        return slope, confidence

    @staticmethod
    def _classify(
        short_rate: float, long_rate: float, short_conf: float, long_conf: float, volatile: bool,
    ) -> Tuple[str, float, float]:
        """Return (classification, rate_used, confidence)."""
        if volatile:
            return "temporary_spike", short_rate, max(short_conf, 40.0)
        if abs(long_rate) < 0.05:
            return "stable", long_rate, long_conf
        if abs(short_rate) > abs(long_rate) * 2.5 and abs(short_rate) > 1.0:
            return "temporary_spike", short_rate, short_conf
        return "long_term_trend", long_rate, long_conf

    @staticmethod
    def _build_trend_narrative(
        key: str, display: str, classification: str, rate: float,
        duration_min: float, current: float, historical_comparison: str,
    ) -> Tuple[str, str, str]:
        """Return (trend_name, severity, explanation)."""
        direction = "increasing" if rate > 0 else "decreasing" if rate < 0 else "stable"

        if classification == "stable":
            return (
                f"{display} Stable", "NORMAL",
                f"{display} has remained stable at approximately {current:.1f}% with no significant trend.",
            )

        if classification == "temporary_spike":
            return (
                f"{display}: Repeated Spikes", "MEDIUM",
                (
                    f"{display} is showing volatile, spike-like behavior rather than a sustained "
                    f"trend. Current value is {current:.1f}%. {historical_comparison}"
                ),
            )

        # long_term_trend
        severity = "LOW"
        if abs(rate) > 2.0:
            severity = "HIGH"
        elif abs(rate) > 0.5:
            severity = "MEDIUM"

        special_name: Optional[str] = None
        if key == "ram_percent" and rate > 0.3:
            special_name = "Possible Memory Leak"
            if severity == "MEDIUM":
                severity = "HIGH"
        elif key == "disk_percent" and rate > 0.2 and current > 70.0:
            special_name = "Possible Resource Exhaustion"

        trend_name = special_name or f"{display} Steadily {'Increasing' if direction == 'increasing' else 'Decreasing'}"

        explanation = (
            f"{display} has been {direction} at approximately {abs(rate):.2f}%/min over the last "
            f"~{duration_min:.0f} minute(s), currently at {current:.1f}%. {historical_comparison}"
        )
        if special_name == "Possible Memory Leak":
            explanation += " This continuous, non-recovering growth pattern is consistent with a memory leak."
        elif special_name == "Possible Resource Exhaustion":
            explanation += " At this rate, available disk capacity may be significantly reduced if the trend continues."

        return trend_name, severity, explanation


# ---------------------------------------------------------------------------
# NEW: Explainable AI Predictive Alert Engine
# ---------------------------------------------------------------------------
class PredictiveAlertEngine:
    """Explainable AI Predictive Alert Engine.

    Independent module, recalculated every monitoring cycle. Forecasts
    likely future threshold breaches by linearly extrapolating each
    metric's already-computed :class:`TrendAnalysisEngine` rate of
    change — it performs no trend computation or anomaly detection of
    its own, and only forecasts off metrics already classified as a
    sustained ``long_term_trend`` (never off spikes or stable readings).

    Attributes:
        _parent: Read-only back-reference to the owning
            ``AnomalyDetectionEngine``, used only to read the latest
            Root Cause Analysis result for root-cause-likelihood context.
        _history: Bounded history of past forecast bundles.
        _latest: The most recently computed list of predictive alerts
            (may be empty if no metric is currently trending toward its
            threshold).
    """

    _HORIZONS_MIN: List[int] = [5, 15, 30, 60]

    # metric_key -> (display label, callable returning current threshold)
    _METRIC_THRESHOLDS: Dict[str, Tuple[str, Any]] = {
        "cpu_percent":        ("CPU",     lambda: config.CPU_THRESHOLD),
        "ram_percent":        ("RAM",     lambda: config.RAM_THRESHOLD),
        "disk_percent":       ("Disk",    lambda: 90.0),
        "net_throughput_mb":  ("Network", lambda: config.NETWORK_THRESHOLD),
    }

    def __init__(self, parent_engine: "AnomalyDetectionEngine") -> None:
        self._parent: "AnomalyDetectionEngine" = parent_engine
        self._history: deque = deque(maxlen=200)
        self._latest: List[Dict[str, Any]] = []
        self._lock: threading.Lock = threading.Lock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def forecast(
        self, trend_results: List[Dict[str, Any]], metric: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Forecast likely future threshold breaches from current trends.

        Args:
            trend_results: This cycle's output from
                :meth:`TrendAnalysisEngine.analyze`. Consumed only —
                never recomputed.
            metric: The raw system metric dict for this cycle (used only
                to timestamp/contextualize the forecast).

        Returns:
            A list of predictive-alert dicts (may be empty). Each has
            ``timestamp``, ``predicted_issue``, ``metric``,
            ``horizon_minutes``, ``probability``, ``confidence``,
            ``predicted_severity``, ``estimated_time_until``,
            ``root_cause_likelihood``, ``explanation``,
            ``recommended_action``.
        """
        timestamp = datetime.now().isoformat()
        trend_by_key = {t["metric_key"]: t for t in trend_results}
        rca_latest = self._parent._rca_engine.get_latest()

        alerts: List[Dict[str, Any]] = []

        for key, (label, threshold_fn) in self._METRIC_THRESHOLDS.items():
            trend = trend_by_key.get(key)
            if not trend or trend.get("classification") != "long_term_trend":
                continue  # only forecast off sustained trends, never spikes/stable/insufficient

            rate_per_min = trend.get("rate_of_change_per_min", 0.0)
            if rate_per_min <= 0:
                continue  # only forecast worsening trends

            current_value = trend.get("current_value", 0.0)
            threshold = threshold_fn()

            if current_value >= threshold:
                continue  # already breached — that's an active anomaly, not a prediction

            alert = self._first_breaching_horizon(
                key, label, current_value, threshold, rate_per_min,
                trend.get("confidence", 0.0), rca_latest, timestamp,
            )
            if alert:
                alerts.append(alert)

        with self._lock:
            self._latest = alerts
            self._history.append({"timestamp": timestamp, "alerts": alerts})

        return alerts

    def get_latest(self) -> List[Dict[str, Any]]:
        """Return the most recently forecast predictive alerts (may be empty)."""
        with self._lock:
            return list(self._latest)

    def get_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return past predictive-alert bundles, most recent first."""
        with self._lock:
            items = list(self._history)
        items.reverse()
        return items[:limit]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------
    def _first_breaching_horizon(
        self,
        key: str, label: str, current_value: float, threshold: float, rate_per_min: float,
        confidence: float, rca_latest: Optional[Dict[str, Any]], timestamp: str,
    ) -> Optional[Dict[str, Any]]:
        """Return a predictive-alert dict for the earliest horizon that
        projects a threshold breach, or ``None`` if no configured horizon
        (5/15/30/60 min) projects one.
        """
        for horizon in self._HORIZONS_MIN:
            projected = current_value + rate_per_min * horizon
            if projected < threshold:
                continue

            minutes_to_breach = (threshold - current_value) / rate_per_min
            probability = self._estimate_probability(confidence, projected, threshold)
            severity = self._severity_for(probability, horizon)
            root_cause_likelihood = self._root_cause_likelihood(key, rca_latest)

            explanation = (
                f"{label} usage is trending upward at {rate_per_min:.2f}%/min based on the current "
                f"growth trend. It is likely to exceed {threshold:.0f}% within the next {horizon} "
                f"minute(s) (projected ~{projected:.0f}%)."
            )

            return {
                "timestamp": timestamp,
                "predicted_issue": self._issue_name(key),
                "metric": label,
                "horizon_minutes": horizon,
                "probability": round(probability, 1),
                "confidence": round(confidence, 1),
                "predicted_severity": severity,
                "estimated_time_until": f"~{minutes_to_breach:.0f} minute(s)",
                "root_cause_likelihood": root_cause_likelihood,
                "explanation": explanation,
                "recommended_action": self._recommended_action(key),
            }

        return None

    @staticmethod
    def _estimate_probability(confidence: float, projected: float, threshold: float) -> float:
        margin = max(0.0, projected - threshold)
        margin_component = min(40.0, margin * 1.5)
        probability = 40.0 + margin_component + (confidence * 0.2)
        return float(np.clip(probability, 0.0, 99.0))

    @staticmethod
    def _severity_for(probability: float, horizon: int) -> str:
        if probability >= 80.0 and horizon <= 15:
            return "CRITICAL"
        if probability >= 65.0:
            return "HIGH"
        if probability >= 45.0:
            return "MEDIUM"
        return "LOW"

    @staticmethod
    def _issue_name(key: str) -> str:
        names = {
            "cpu_percent": "Possible CPU Overload",
            "ram_percent": "Possible Memory Exhaustion",
            "disk_percent": "Disk Capacity Approaching Limit",
            "net_throughput_mb": "Possible Network Congestion",
        }
        return names.get(key, "Possible Resource Issue")

    @staticmethod
    def _recommended_action(key: str) -> str:
        actions = {
            "cpu_percent": "Identify and reduce CPU-intensive workloads before the projected threshold breach.",
            "ram_percent": "Investigate for a memory leak and consider proactively restarting the top memory-consuming process.",
            "disk_percent": "Free up disk space or expand storage capacity before it is exhausted.",
            "net_throughput_mb": "Investigate the rising network activity for possible congestion or data exfiltration.",
        }
        return actions.get(key, "Monitor the affected metric closely.")

    @staticmethod
    def _root_cause_likelihood(key: str, rca_latest: Optional[Dict[str, Any]]) -> str:
        if not rca_latest:
            return "Unknown — no recent Root Cause Analysis available to correlate."

        display_map = {
            "cpu_percent": "CPU Usage", "ram_percent": "RAM Usage",
            "disk_percent": "Disk Usage", "net_throughput_mb": "Network Throughput",
        }
        proc = rca_latest.get("responsible_process", {}).get("name", "N/A")
        if rca_latest.get("primary_metric") == display_map.get(key) and proc and proc != "N/A":
            return f"Likely '{proc}', consistent with the most recent Root Cause Analysis."
        return "No strong process-level correlation identified yet."


# ---------------------------------------------------------------------------
# NEW: Explainable AI Recommendation Engine
# ---------------------------------------------------------------------------
class RecommendationEngine:
    """Explainable AI Recommendation Engine.

    Independent module, recalculated every monitoring cycle. Synthesizes
    across this cycle's anomaly prediction, the latest Root Cause
    Analysis, the latest Trend Analysis, and the latest Health Score into
    prioritized, metric-referenced recommendations — never generic advice.

    This is a separate implementation from the pre-existing
    ``AnomalyDetectionEngine.generate_recommendations()`` (which remains
    untouched and continues to back any existing consumers) — this
    engine adds explicit ``reason``, ``confidence``, and
    ``estimated_urgency`` fields per your spec, and reasons over the
    already-computed downstream engine outputs rather than re-deriving
    everything from raw metrics.

    Attributes:
        _parent: Read-only back-reference to the owning
            ``AnomalyDetectionEngine``, used only to read the latest
            Root Cause Analysis and Health Score results.
        _history: Bounded history of past recommendation bundles.
        _latest: The most recently generated list of recommendations.
    """

    def __init__(self, parent_engine: "AnomalyDetectionEngine") -> None:
        self._parent: "AnomalyDetectionEngine" = parent_engine
        self._history: deque = deque(maxlen=200)
        self._latest: List[Dict[str, Any]] = []
        self._lock: threading.Lock = threading.Lock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def generate(
        self,
        prediction: AnomalyPrediction,
        metric: Dict[str, Any],
        processes: List[Dict[str, Any]],
        trend_results: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Generate prioritized, explainable recommendations for this cycle.

        Args:
            prediction: This cycle's :class:`AnomalyPrediction`.
            metric: The raw system metric dict for this cycle.
            processes: The top-process snapshot for this cycle.
            trend_results: This cycle's output from
                :meth:`TrendAnalysisEngine.analyze`.

        Returns:
            A list of recommendation dicts, sorted by priority, each with
            ``timestamp``, ``priority``, ``recommendation``, ``reason``,
            ``expected_impact``, ``confidence``, ``estimated_urgency``,
            ``category``. Always non-empty (falls back to an explicit
            "all normal" entry).
        """
        timestamp = datetime.now().isoformat()
        rca_latest = self._parent._rca_engine.get_latest()
        health_latest = self._parent._health_score_engine.get_latest()
        trend_by_key = {t["metric_key"]: t for t in trend_results}

        cpu = float(metric.get("cpu_percent", 0.0))
        ram = float(metric.get("ram_percent", 0.0))
        disk = float(metric.get("disk_percent", 0.0))
        net = float(metric.get("net_sent_mb", 0.0)) + float(metric.get("net_recv_mb", 0.0))

        recs: List[Dict[str, Any]] = []

        if prediction.is_anomaly and rca_latest:
            recs.append(self._from_rca(rca_latest))

        cpu_trend = trend_by_key.get("cpu_percent")
        if cpu > config.CPU_THRESHOLD or (cpu_trend and cpu_trend.get("classification") == "long_term_trend" and cpu_trend.get("rate_of_change_per_min", 0) > 0.5):
            recs.append(self._cpu_recommendation(cpu, cpu_trend, processes))

        ram_trend = trend_by_key.get("ram_percent")
        if ram > config.RAM_THRESHOLD or (ram_trend and ram_trend.get("trend_name") == "Possible Memory Leak"):
            recs.append(self._ram_recommendation(ram, ram_trend, processes))

        disk_trend = trend_by_key.get("disk_percent")
        if disk > 85.0 or (disk_trend and disk_trend.get("trend_name") == "Possible Resource Exhaustion"):
            recs.append(self._disk_recommendation(disk, disk_trend))

        net_trend = trend_by_key.get("net_throughput_mb")
        if net > config.NETWORK_THRESHOLD or (net_trend and net_trend.get("classification") == "long_term_trend" and net_trend.get("rate_of_change_per_min", 0) > 0):
            recs.append(self._network_recommendation(net, net_trend))

        if health_latest and health_latest.get("health_score", 100.0) < 50.0:
            recs.append(self._health_recommendation(health_latest))

        if not recs:
            recs.append({
                "priority": "LOW",
                "recommendation": "All systems operating within normal parameters. No action required.",
                "reason": "No active anomalies, adverse trends, or degraded health score were detected this cycle.",
                "expected_impact": "Continued stable operation.",
                "confidence": 90.0,
                "estimated_urgency": "None",
                "category": "status",
            })

        priority_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        recs.sort(key=lambda r: priority_order.get(r.get("priority", "LOW"), 4))

        for r in recs:
            r["timestamp"] = timestamp

        with self._lock:
            self._latest = recs
            self._history.append({"timestamp": timestamp, "recommendations": recs})

        return recs

    def get_latest(self) -> List[Dict[str, Any]]:
        """Return the most recently generated recommendations."""
        with self._lock:
            return list(self._latest)

    def get_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return past recommendation bundles, most recent first."""
        with self._lock:
            items = list(self._history)
        items.reverse()
        return items[:limit]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _from_rca(rca: Dict[str, Any]) -> Dict[str, Any]:
        severity = rca.get("severity", "MEDIUM")
        return {
            "priority": severity,
            "recommendation": rca.get("recommendation", "Investigate the detected anomaly."),
            "reason": (
                f"Root Cause Analysis identified '{rca.get('root_cause', 'an anomaly')}' via "
                f"{rca.get('primary_metric', 'an affected metric')}."
            ),
            "expected_impact": "Directly addresses the detected anomaly's root cause.",
            "confidence": rca.get("confidence", 70.0),
            "estimated_urgency": "Immediate" if severity in ("CRITICAL", "HIGH") else "Within 15 minutes",
            "category": "anomaly",
        }

    @staticmethod
    def _cpu_recommendation(
        cpu: float, trend: Optional[Dict[str, Any]], processes: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        top_proc = processes[0].get("name", "unknown") if processes else "unknown"
        reason = f"CPU usage is at {cpu:.1f}%"
        reason += f", {trend['explanation']}" if trend else "."
        return {
            "priority": "CRITICAL" if cpu > 95 else "HIGH" if cpu > config.CPU_THRESHOLD else "MEDIUM",
            "recommendation": f"Reduce CPU-intensive workloads; consider restarting '{top_proc}' if usage does not recover.",
            "reason": reason,
            "expected_impact": "Could reduce CPU usage by 10-30%.",
            "confidence": trend["confidence"] if trend else 70.0,
            "estimated_urgency": "Immediate" if cpu > 95 else "Within 15 minutes" if cpu > config.CPU_THRESHOLD else "Monitor closely",
            "category": "cpu",
        }

    @staticmethod
    def _ram_recommendation(
        ram: float, trend: Optional[Dict[str, Any]], processes: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        mem_proc = "unknown"
        if processes:
            sorted_p = sorted(processes, key=lambda p: p.get("memory_percent", 0.0), reverse=True)
            if sorted_p:
                mem_proc = sorted_p[0].get("name", "unknown")

        is_leak = bool(trend and trend.get("trend_name") == "Possible Memory Leak")
        reason = f"RAM usage is at {ram:.1f}%"
        reason += f", {trend['explanation']}" if trend else "."

        return {
            "priority": "CRITICAL" if ram > 95 else "HIGH",
            "recommendation": (
                f"Restart '{mem_proc}' and inspect its memory allocation for a leak."
                if is_leak else
                f"Close unused applications and monitor '{mem_proc}' memory consumption."
            ),
            "reason": reason,
            "expected_impact": "May free 15-40% RAM and prevent OOM conditions.",
            "confidence": trend["confidence"] if trend else 70.0,
            "estimated_urgency": "Immediate" if ram > 95 else "Within 15 minutes",
            "category": "ram",
        }

    @staticmethod
    def _disk_recommendation(disk: float, trend: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        reason = f"Disk usage is at {disk:.1f}%"
        reason += f", {trend['explanation']}" if trend else "."
        return {
            "priority": "CRITICAL" if disk > 95 else "HIGH",
            "recommendation": "Clear temporary files/logs and consider expanding storage capacity.",
            "reason": reason,
            "expected_impact": "Prevents disk-full system failure.",
            "confidence": trend["confidence"] if trend else 70.0,
            "estimated_urgency": "Immediate" if disk > 95 else "Within 30 minutes",
            "category": "disk",
        }

    @staticmethod
    def _network_recommendation(net: float, trend: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        reason = f"Network throughput is {net:.3f} MB/cycle"
        reason += f", {trend['explanation']}" if trend else "."
        return {
            "priority": "HIGH",
            "recommendation": "Investigate abnormal network activity for possible data exfiltration or misconfiguration.",
            "reason": reason,
            "expected_impact": "May identify data exfiltration or bandwidth abuse.",
            "confidence": trend["confidence"] if trend else 65.0,
            "estimated_urgency": "Within 15 minutes",
            "category": "network",
        }

    @staticmethod
    def _health_recommendation(health: Dict[str, Any]) -> Dict[str, Any]:
        score = health.get("health_score", 100.0)
        return {
            "priority": "HIGH" if score < 40 else "MEDIUM",
            "recommendation": "Perform a full system review; multiple subsystems are contributing to a degraded health score.",
            "reason": health.get("explanation", f"Health score is {score:.0f}/100."),
            "expected_impact": "Restores overall system health to acceptable levels.",
            "confidence": health.get("confidence", 70.0),
            "estimated_urgency": "Within 15 minutes",
            "category": "health",
        }


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


def get_latest_root_cause_analysis() -> Optional[Dict[str, Any]]:
    """Module-level convenience wrapper for
    :meth:`AnomalyDetectionEngine.get_latest_root_cause_analysis`.

    Intended for a future ``GET /ai/root-cause`` endpoint in api.py —
    see the field list documented on :meth:`RootCauseAnalysisEngine.analyze`.
    """
    return engine.get_latest_root_cause_analysis()


def get_root_cause_analysis_history(limit: int = 20) -> List[Dict[str, Any]]:
    """Module-level convenience wrapper for
    :meth:`AnomalyDetectionEngine.get_root_cause_analysis_history`.

    Intended for a future ``GET /ai/root-cause/history`` endpoint in api.py.
    """
    return engine.get_root_cause_analysis_history(limit=limit)


def get_latest_health_score() -> Optional[Dict[str, Any]]:
    """Module-level convenience wrapper for
    :meth:`AnomalyDetectionEngine.get_latest_health_score`.

    Intended for a future ``GET /ai/health-score`` endpoint in api.py.
    """
    return engine.get_latest_health_score()


def get_health_score_history(limit: int = 50) -> List[Dict[str, Any]]:
    """Module-level convenience wrapper for
    :meth:`AnomalyDetectionEngine.get_health_score_history`.

    Intended for a future ``GET /ai/health-score/history`` endpoint in api.py.
    """
    return engine.get_health_score_history(limit=limit)


def get_latest_trend_analysis() -> List[Dict[str, Any]]:
    """Module-level convenience wrapper for
    :meth:`AnomalyDetectionEngine.get_latest_trend_analysis`.

    Intended for a future ``GET /ai/trend-analysis`` endpoint in api.py.
    """
    return engine.get_latest_trend_analysis()


def get_trend_analysis_history(limit: int = 20) -> List[Dict[str, Any]]:
    """Module-level convenience wrapper for
    :meth:`AnomalyDetectionEngine.get_trend_analysis_history`.

    Intended for a future ``GET /ai/trend-analysis/history`` endpoint in api.py.
    """
    return engine.get_trend_analysis_history(limit=limit)


def get_latest_predictive_alerts() -> List[Dict[str, Any]]:
    """Module-level convenience wrapper for
    :meth:`AnomalyDetectionEngine.get_latest_predictive_alerts`.

    Intended for a future ``GET /ai/predictive-alerts`` endpoint in api.py.
    """
    return engine.get_latest_predictive_alerts()


def get_predictive_alerts_history(limit: int = 20) -> List[Dict[str, Any]]:
    """Module-level convenience wrapper for
    :meth:`AnomalyDetectionEngine.get_predictive_alerts_history`.

    Intended for a future ``GET /ai/predictive-alerts/history`` endpoint in api.py.
    """
    return engine.get_predictive_alerts_history(limit=limit)


def get_latest_smart_recommendations() -> List[Dict[str, Any]]:
    """Module-level convenience wrapper for
    :meth:`AnomalyDetectionEngine.get_latest_smart_recommendations`.

    Intended for a future ``GET /ai/smart-recommendations`` endpoint in api.py.
    """
    return engine.get_latest_smart_recommendations()


def get_smart_recommendations_history(limit: int = 20) -> List[Dict[str, Any]]:
    """Module-level convenience wrapper for
    :meth:`AnomalyDetectionEngine.get_smart_recommendations_history`.

    Intended for a future ``GET /ai/smart-recommendations/history`` endpoint in api.py.
    """
    return engine.get_smart_recommendations_history(limit=limit)