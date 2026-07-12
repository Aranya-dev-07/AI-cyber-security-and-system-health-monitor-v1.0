import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader, fmt, severityColor, severityBg } from '../../components/ui'

export default function Recommendations() {
  const { smartRecs } = useSystemStatus()
  const list = smartRecs || []

  return (
    <Card>
      <SectionHeader title="AI Recommendations" subtitle="Explainable AI · prioritized, metric-referenced advice" dot="var(--peach)"/>

      {list.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>No recommendations available yet.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((r, i) => (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(r.priority)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ background: severityBg(r.priority), color: severityColor(r.priority), borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>{r.priority}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{r.category}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--olive-deep)', fontWeight: 600 }}>{r.estimated_urgency}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6 }}>{r.recommendation}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 6 }}>{r.reason}</div>
                <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <span>Impact: <b style={{ color: 'var(--text)' }}>{r.expected_impact}</b></span>
                  <span>Confidence: <b style={{ color: 'var(--text)' }}>{fmt(r.confidence)}%</b></span>
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}