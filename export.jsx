import { useState } from 'react'
import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader } from '../../components/ui'
import { NavIcon } from '../../components/icons'
import { downloadCSV, downloadJSON, timestampSlug } from '../../utils/export'

// Exports operate on data this dashboard already has in memory from its
// normal polling of existing endpoints — no new backend routes are added,
// and this does not export the server-side CSV history files. That's
// called out explicitly in the UI below so it's never mistaken for a
// full historical export.

function ExportRow({ icon, label, desc, count, onExport, disabled }) {
  const [done, setDone] = useState(false)
  const handleClick = () => {
    const ok = onExport()
    if (ok) { setDone(true); setTimeout(() => setDone(false), 1800) }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
      <span className="quick-action-tile__icon" style={{ background: 'var(--lavender)', color: 'var(--lavender-deep)' }}><NavIcon name={icon} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
      <button
        onClick={handleClick}
        disabled={disabled}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
          padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          background: disabled ? 'var(--surface)' : done ? 'var(--mint)' : 'var(--surface)',
          color: disabled ? 'var(--text-muted)' : done ? 'var(--mint-deep)' : 'var(--lavender-deep)',
          cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.15s ease',
          whiteSpace: 'nowrap',
        }}
      >
        {done ? 'Downloaded ✓' : disabled ? `No data (${count})` : `Download (${count})`}
      </button>
    </div>
  )
}

export default function Export() {
  const { history, procs, runs, anomalies, insights } = useSystemStatus()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          These exports cover <b style={{ color: 'var(--text)' }}>the data currently loaded in this dashboard session</b> —
          the metrics history chart buffer, the latest process snapshot, the loaded run list, and detected anomalies.
          They are generated entirely in your browser. This is not the full server-side CSV history
          (<code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 6px', borderRadius: 4 }}>system_metrics.csv</code> etc.),
          which the API does not currently serve for download.
        </div>
      </Card>

      <Card>
        <SectionHeader title="Export" subtitle="Download current session data as CSV or JSON" dot="var(--lavender)"/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ExportRow
            icon="trend" label="Metrics History" desc="CPU / RAM / Disk / Network readings buffered for the charts"
            count={history.length} disabled={history.length === 0}
            onExport={() => downloadCSV(history, `metrics-history-${timestampSlug()}.csv`)}
          />
          <ExportRow
            icon="list" label="Process Snapshot" desc="Latest top-process reading"
            count={procs.length} disabled={procs.length === 0}
            onExport={() => downloadCSV(procs, `process-snapshot-${timestampSlug()}.csv`)}
          />
          <ExportRow
            icon="clock" label="Run History" desc="Loaded test runs (most recent)"
            count={runs.length} disabled={runs.length === 0}
            onExport={() => downloadCSV(runs, `run-history-${timestampSlug()}.csv`)}
          />
          <ExportRow
            icon="alert" label="Anomalies" desc="Detected anomalies this session"
            count={anomalies.length} disabled={anomalies.length === 0}
            onExport={() => downloadCSV(anomalies, `anomalies-${timestampSlug()}.csv`)}
          />
          <ExportRow
            icon="file" label="AI Insights (JSON)" desc="Latest executive summary, risk level & key findings"
            count={insights ? 1 : 0} disabled={!insights}
            onExport={() => downloadJSON(insights, `ai-insights-${timestampSlug()}.json`)}
          />
        </div>
      </Card>
    </div>
  )
}