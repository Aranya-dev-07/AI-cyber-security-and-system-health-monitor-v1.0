import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader, fmt, fmtT, severityColor, severityBg } from '../../components/ui'

export default function Anomalies() {
  const { aiStats: stats, anomalies } = useSystemStatus()

  return (
    <Card>
      <SectionHeader title="AI Anomaly Detection" subtitle="Isolation Forest · real-time inference" dot="var(--peach)"/>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Detected', val: stats?.total_anomalies ?? '—', color: 'var(--lavender-deep)' },
          { label: 'Critical',       val: stats?.critical_count  ?? '—', color: 'var(--rose-deep)' },
          { label: 'High',           val: stats?.high_count      ?? '—', color: 'var(--coral-deep)' },
          { label: 'Avg Confidence', val: stats ? `${fmt(stats.avg_confidence)}%` : '—', color: 'var(--mint-deep)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color }}>{val}</div>
          </div>
        ))}
      </div>

      {anomalies.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 0', fontSize: 13 }}>No anomalies detected yet.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {anomalies.slice(0, 5).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(a.severity)}` }}>
                <span style={{ background: severityBg(a.severity), color: severityColor(a.severity), borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, flexShrink: 0, marginTop: 1 }}>{a.severity}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 3 }}>{a.reason}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                    score {fmt(a.anomaly_score, 4)} · {fmt(a.confidence)}% confidence · {fmtT(a.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
      }

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: stats?.model_trained ? 'var(--mint-deep)' : 'var(--peach-deep)', animation: stats?.model_trained ? 'pulse 2s infinite' : 'none' }}/>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {stats?.model_trained ? `Model trained · ${stats?.total_predictions ?? 0} predictions made` : 'Model not yet trained'}
        </span>
      </div>
    </Card>
  )
}