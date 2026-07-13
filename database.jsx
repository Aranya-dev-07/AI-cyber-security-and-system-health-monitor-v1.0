import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader } from '../../components/ui'
import { DATABASE_INFO } from '../../components/constants'

export default function SettingsDatabase() {
  const { status, runs, procs } = useSystemStatus()
  const connected = status.database === 'connected'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <SectionHeader title="Database" subtitle="Storage engine" dot="var(--lavender)"/>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: connected ? 'var(--mint)' : 'var(--rose)', color: connected ? 'var(--mint-deep)' : 'var(--rose-deep)', borderRadius: 20, padding: '6px 14px', marginBottom: 16 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', animation: connected ? 'pulse 2s infinite' : 'none' }}/>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{connected ? 'CONNECTED' : 'UNREACHABLE'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Engine</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{DATABASE_INFO.engine}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Database File</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{DATABASE_INFO.file}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Runs Loaded This Session</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{runs.length}{runs.length === 10 ? ' (most recent, limit 10)' : ''}</span>
        </div>
      </Card>

      <Card>
        <SectionHeader title="Schema" subtitle="Tables tracked by database.py" dot="var(--lavender)"/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DATABASE_INFO.tables.map(t => (
            <div key={t.name} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--lavender-deep)', width: 130, flexShrink: 0 }}>{t.name}</code>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.desc}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}