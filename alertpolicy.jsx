import { Card, SectionHeader } from '../../components/ui'
import { SEVERITY_BANDS, ALERT_RULES } from '../../components/constants'

export default function AlertPolicy() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <SectionHeader title="Threshold Alerts" subtitle="How config.py's alert engine decides to fire" dot="var(--lavender)"/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ALERT_RULES.map(r => (
            <div key={r.metric} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${r.color}` }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: r.color, width: 70, flexShrink: 0 }}>{r.metric}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.rule}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader title="AI Severity Bands" subtitle="How the Isolation Forest anomaly score maps to severity" dot="var(--peach)"/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SEVERITY_BANDS.map(b => (
            <div key={b.severity} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${b.color}` }}>
              <span style={{ background: `color-mix(in srgb, ${b.color} 20%, transparent)`, color: b.color, borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, width: 76, textAlign: 'center', flexShrink: 0 }}>{b.severity}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{b.rule}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.6 }}>
          Reference only, mirrored from <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>AnomalyDetectionEngine._compute_severity</code>.
          The AI computation itself is untouched by this dashboard.
        </div>
      </Card>
    </div>
  )
}