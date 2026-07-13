import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader, fmt, fmtT, severityColor, severityBg } from '../../components/ui'

const RISK_TONE = {
  LOW:      { fg: 'var(--mint-deep)',  bg: 'var(--mint)' },
  MODERATE: { fg: 'var(--peach-deep)', bg: 'var(--peach)' },
  HIGH:     { fg: 'var(--coral-deep)', bg: 'var(--coral)' },
  CRITICAL: { fg: 'var(--rose-deep)',  bg: 'var(--rose)' },
  UNKNOWN:  { fg: 'var(--sage-deep)',  bg: 'var(--sage)' },
}

export default function AIReports() {
  const { insights, aiStats, health, anomalies } = useSystemStatus()
  const risk = insights?.risk_level || 'UNKNOWN'
  const tone = RISK_TONE[risk] || RISK_TONE.UNKNOWN

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <SectionHeader title="AI Report" subtitle={insights ? `Generated ${fmtT(insights.timestamp)}` : 'Executive-style AI digest'} dot="var(--peach)"/>
          <span style={{ background: tone.bg, color: tone.fg, borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700 }}>{risk} RISK</span>
        </div>
        {!insights
          ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No report available yet — start monitoring to generate one.</div>
          : <>
              <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, marginBottom: 12 }}>{insights.summary}</p>
              {insights.key_findings?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {insights.key_findings.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: tone.fg, marginTop: 6, flexShrink: 0 }}/>{f}
                    </div>
                  ))}
                </div>
              )}
            </>
        }
      </Card>

      <div className="grid-2">
        <Card>
          <SectionHeader title="Detection Statistics" subtitle="Isolation Forest, this session" dot="var(--peach)"/>
          <div className="grid-2">
            {[
              { label: 'Total Detected', val: aiStats?.total_anomalies ?? '—', color: 'var(--lavender-deep)' },
              { label: 'Critical',       val: aiStats?.critical_count  ?? '—', color: 'var(--rose-deep)' },
              { label: 'High',           val: aiStats?.high_count      ?? '—', color: 'var(--coral-deep)' },
              { label: 'Avg Confidence', val: aiStats ? `${fmt(aiStats.avg_confidence)}%` : '—', color: 'var(--mint-deep)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color }}>{val}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Health Assessment" subtitle="Composite AI health score" dot="var(--peach)"/>
          {!health
            ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No monitoring cycle has run yet.</div>
            : <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 700, color: 'var(--lavender-deep)' }}>{Math.round(health.health_score)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{health.status}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{health.historical_comparison}</div>
              </>
          }
        </Card>
      </div>

      <Card>
        <SectionHeader title="Top Anomalies This Session" subtitle="Most recent detections" dot="var(--peach)"/>
        {anomalies.length === 0
          ? <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>No anomalies recorded this session.</div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Severity', 'Reason', 'Confidence', 'Time'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {anomalies.slice(0, 8).map((a, i) => (
                    <tr key={i}>
                      <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ background: severityBg(a.severity), color: severityColor(a.severity), borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>{a.severity}</span>
                      </td>
                      <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason}</td>
                      <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{fmt(a.confidence)}%</td>
                      <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{fmtT(a.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </Card>
    </div>
  )
}