// ─────────────────────────────────────────────────────────────────────────
// Static reference constants mirrored from the backend's own source files.
// None of these are fetched live — no endpoint exposes them — so they are
// presented everywhere as "configured reference" values, never as live
// data. Kept in one place so Controls, Settings, and Alert Policy pages
// stay consistent instead of duplicating the same numbers.
//
// Sources: config.py (thresholds, intervals), ai_engine/core.py ModelConfig
// (Isolation Forest defaults), ai_engine/core.py _compute_severity
// (severity band logic), database.py (schema).
// ─────────────────────────────────────────────────────────────────────────

export const MONITORING_THRESHOLDS = [
  { label: 'CPU Threshold',     value: '85 %',   note: 'Alert above this usage' },
  { label: 'RAM Threshold',     value: '85 %',   note: 'Alert above this usage' },
  { label: 'Network Threshold', value: '100 MB', note: 'Per collection interval' },
  { label: 'Poll Interval',     value: '5 s',    note: 'Time between collection cycles' },
  { label: 'Top Processes Tracked', value: '5',  note: 'Per collection cycle' },
]

export const AI_MODEL_DEFAULTS = [
  { label: 'Algorithm',          value: 'Isolation Forest' },
  { label: 'Estimators',         value: '100 trees' },
  { label: 'Contamination',      value: 'auto' },
  { label: 'Max Samples',        value: 'auto' },
  { label: 'Random State',       value: '42' },
  { label: 'Rolling Window',     value: '20 samples' },
  { label: 'Min Train Samples',  value: '10' },
  { label: 'Retrain Interval',   value: 'every 100 samples' },
]

export const SEVERITY_BANDS = [
  { severity: 'CRITICAL', rule: 'Anomaly score ≥ 0.35, or 3+ metrics abnormal at once', color: 'var(--rose-deep)' },
  { severity: 'HIGH',     rule: 'Anomaly score ≥ 0.25, or 2 metrics abnormal at once',  color: 'var(--coral-deep)' },
  { severity: 'MEDIUM',   rule: 'Anomaly score ≥ 0.15, or 1 metric abnormal',            color: 'var(--peach-deep)' },
  { severity: 'LOW',      rule: 'Any negative anomaly score below the above bands',      color: 'var(--sage-deep)' },
]

export const ALERT_RULES = [
  { metric: 'CPU',     rule: 'Fires when usage exceeds the CPU threshold', color: 'var(--mint-deep)' },
  { metric: 'RAM',     rule: 'Fires when usage exceeds the RAM threshold', color: 'var(--lavender-deep)' },
  { metric: 'Network', rule: 'Fires when sent + received exceeds the network threshold per cycle', color: 'var(--peach-deep)' },
]

export const DATABASE_INFO = {
  engine: 'SQLite',
  file: 'system_monitor.db',
  tables: [
    { name: 'test_run',          desc: 'One row per monitoring run' },
    { name: 'system_metrics',    desc: 'CPU/RAM/Disk/Network snapshots, linked to a run' },
    { name: 'system_processes',  desc: 'Top-process snapshots, linked to a run' },
    { name: 'anomalies',         desc: 'Stored AI anomaly predictions, linked to a run' },
  ],
}