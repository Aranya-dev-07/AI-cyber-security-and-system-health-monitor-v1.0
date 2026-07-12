import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader, fmt, fmtT } from '../../components/ui'

function HealthScoreGauge({ score, status }) {
  const R = 62; const CX = 76; const CY = 76
  const GAP = 50; const sweep = 360 - GAP
  const frac = Math.max(0, Math.min(1, (score ?? 0) / 100))
  const r2d = a => (a * Math.PI) / 180
  const startAngle = 90 + GAP / 2

  function arc(pct) {
    const a = startAngle + pct * sweep
    const sx = CX + R * Math.cos(r2d(startAngle))
    const sy = CY + R * Math.sin(r2d(startAngle))
    const ex = CX + R * Math.cos(r2d(a))
    const ey = CY + R * Math.sin(r2d(a))
    const large = pct * sweep > 180 ? 1 : 0
    return `M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`
  }

  const statusColors = {
    Excellent: 'var(--mint-deep)',
    Good:      'var(--olive-deep)',
    Fair:      'var(--peach-deep)',
    Poor:      'var(--coral-deep)',
    Critical:  'var(--rose-deep)',
  }
  const color = statusColors[status] || 'var(--lavender-deep)'

  return (
    <svg width="152" height="122" viewBox="0 0 152 122" style={{ display: 'block', margin: '0 auto' }}>
      <path d={arc(1)} fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round"/>
      <path d={arc(frac)} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" style={{ transition: 'all 0.7s ease' }}/>
      <text x={CX} y={CY - 4} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, fill: color }}>
        {score == null ? '—' : Math.round(score)}
      </text>
      <text x={CX} y={CY + 18} textAnchor="middle" style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fill: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {status || '—'}
      </text>
    </svg>
  )
}

export default function HealthScore() {
  const { health } = useSystemStatus()

  return (
    <Card>
      <SectionHeader title="AI Health Score" subtitle="Explainable AI · weighted composite score" dot="var(--peach)"/>

      {!health
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>No monitoring cycle has run yet.</div>
        : <div className="health-score-layout">
            <div>
              <HealthScoreGauge score={health.health_score} status={health.status}/>
              <div style={{ textAlign: 'center', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>Confidence {fmt(health.confidence)}%</div>
              <div style={{ textAlign: 'center', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>Updated {fmtT(health.timestamp)}</div>
            </div>

            <div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Contributing Factors</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(health.contributing_factors || []).map((f, i) => (
                    <span key={i} style={{ background: 'var(--surface-2)', color: 'var(--lavender-deep)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 500, border: '1px solid var(--border)' }}>{f}</span>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>AI Explanation</div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{health.explanation}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>Historical Comparison</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{health.historical_comparison}</div>
              </div>
            </div>
          </div>
      }
    </Card>
  )
}