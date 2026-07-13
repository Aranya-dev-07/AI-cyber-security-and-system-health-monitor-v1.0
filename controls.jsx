import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader, fmt, fmtT } from '../../components/ui'
import { MONITORING_THRESHOLDS } from '../../components/constants'

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

export default function Controls() {
  const { status, summary } = useSystemStatus()
  const active = status.monitoring === 'active'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="grid-2">
        {/* Run status + how control actually works */}
        <Card>
          <SectionHeader title="Run Status" subtitle="Monitoring is controlled from the backend terminal" dot="var(--lavender)"/>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: active ? 'var(--mint)' : 'var(--sage)', color: active ? 'var(--mint-deep)' : 'var(--sage-deep)', borderRadius: 20, padding: '6px 14px', marginBottom: 16 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', animation: active ? 'pulse 2s infinite' : 'none' }}/>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4 }}>{active ? 'MONITORING ACTIVE' : 'MONITORING IDLE'}</span>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
            This platform's API is intentionally read-only — starting and stopping a run is done from the terminal running <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>main.py</code>:
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', color: 'var(--mint-deep)' }}>start</code>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', color: 'var(--rose-deep)' }}>stop</code>
          </div>
        </Card>

        {/* Configured thresholds — static reference, no live endpoint exists */}
        <Card>
          <SectionHeader title="Configured Thresholds" subtitle="Reference values from config.py" dot="var(--lavender)"/>
          {MONITORING_THRESHOLDS.map(t => (
            <div key={t.label} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.value}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{t.note}</div>
            </div>
          ))}
        </Card>
      </div>

      {/* Current run summary — from the existing /summary endpoint */}
      <Card>
        <SectionHeader title="Current Run Summary" subtitle="Aggregate statistics for the active or most recent run" dot="var(--lavender)"/>
        {!summary
          ? <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>No run summary available yet — start monitoring to generate one.</div>
          : <>
              <div className="grid-4" style={{ marginBottom: 4 }}>
                <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Avg CPU</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--mint-deep)' }}>{fmt(summary.avg_cpu)}%</div>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Avg RAM</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--lavender-deep)' }}>{fmt(summary.avg_ram)}%</div>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Avg Disk</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--peach-deep)' }}>{fmt(summary.avg_disk)}%</div>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Total Alerts</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: summary.total_alerts > 0 ? 'var(--rose-deep)' : 'var(--text)' }}>{summary.total_alerts}</div>
                </div>
              </div>
              <InfoRow label="Run ID" value={`#${summary.run_id}`}/>
              <InfoRow label="Started" value={fmtT(summary.start_time)}/>
              <InfoRow label="Ended / As of" value={fmtT(summary.end_time)}/>
              <InfoRow label="Duration" value={`${fmt(summary.duration_sec, 1)} s`}/>
            </>
        }
      </Card>
    </div>
  )
}