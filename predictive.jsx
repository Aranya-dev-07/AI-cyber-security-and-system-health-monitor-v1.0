import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader, fmt, severityColor, severityBg } from '../../components/ui'

export default function Predictive() {
  const { predictiveAlerts } = useSystemStatus()
  const list = predictiveAlerts || []

  return (
    <Card>
      <SectionHeader title="AI Predictive Alerts" subtitle="Explainable AI · forecasted issues, not yet occurred" dot="var(--peach)"/>

      {list.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>No metric is currently trending toward a threshold breach.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((a, i) => (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(a.predicted_severity)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ background: severityBg(a.predicted_severity), color: severityColor(a.predicted_severity), borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>{a.predicted_severity}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--peach-deep)' }}>{a.predicted_issue}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>ETA {a.estimated_time_until}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6 }}>{a.explanation}</div>
                <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap', marginBottom: 6 }}>
                  <span>Horizon: <b style={{ color: 'var(--text)' }}>{a.horizon_minutes}m</b></span>
                  <span>Probability: <b style={{ color: 'var(--text)' }}>{fmt(a.probability)}%</b></span>
                  <span>Confidence: <b style={{ color: 'var(--text)' }}>{fmt(a.confidence)}%</b></span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Likely cause: {a.root_cause_likelihood}</div>
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 12, color: 'var(--text)', borderLeft: '3px solid var(--peach-deep)' }}>{a.recommended_action}</div>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}