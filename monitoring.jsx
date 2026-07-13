import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader } from '../../components/ui'
import { MONITORING_THRESHOLDS } from '../../components/constants'

export default function SettingsMonitoring() {
  const { status } = useSystemStatus()
  const active = status.monitoring === 'active'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <SectionHeader title="Monitoring" subtitle="Collection thresholds & interval — read-only reference from config.py" dot="var(--lavender)"/>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: active ? 'var(--mint)' : 'var(--sage)', color: active ? 'var(--mint-deep)' : 'var(--sage-deep)', borderRadius: 20, padding: '6px 14px', marginBottom: 16 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', animation: active ? 'pulse 2s infinite' : 'none' }}/>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{active ? 'MONITORING ACTIVE' : 'MONITORING IDLE'}</span>
        </div>
        {MONITORING_THRESHOLDS.map(t => (
          <div key={t.label} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.value}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{t.note}</div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.6 }}>
          These values are fixed in <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>config.py</code>.
          No endpoint currently exposes them as editable, so they're shown here as reference only.
        </div>
      </Card>
    </div>
  )
}