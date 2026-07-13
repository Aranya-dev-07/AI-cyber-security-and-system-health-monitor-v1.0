import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader, fmt, severityColor, severityBg, ConfidenceBar } from '../../components/ui'

export default function Trends() {
  const { trendAnalysis } = useSystemStatus()
  const list = trendAnalysis || []

  return (
    <Card>
      <SectionHeader title="AI Trend Analysis" subtitle="Explainable AI · sustained trends vs. temporary spikes" dot="var(--peach)"/>

      {list.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>Not enough data collected yet to analyze trends.</div>
        : <div className="grid-2">
            {list.map((t, i) => (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(t.severity)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--peach-deep)' }}>{t.metric}</span>
                  <span style={{ background: severityBg(t.severity), color: severityColor(t.severity), borderRadius: 20, padding: '1px 8px', fontSize: 9, fontWeight: 700 }}>{t.severity}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                    {t.classification === 'temporary_spike' ? 'SPIKE' : t.classification === 'long_term_trend' ? 'TREND' : t.classification === 'stable' ? 'STABLE' : '—'}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t.trend_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 6 }}>{t.explanation}</div>
                <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap', marginBottom: 8 }}>
                  <span>Duration: <b style={{ color: 'var(--text)' }}>{fmt(t.duration_minutes)}m</b></span>
                  <span>Rate: <b style={{ color: 'var(--text)' }}>{fmt(t.rate_of_change_per_min, 2)}%/min</b></span>
                </div>
                <ConfidenceBar value={t.confidence} color={severityColor(t.severity)}/>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}