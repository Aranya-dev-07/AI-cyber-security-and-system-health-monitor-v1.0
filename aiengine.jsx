import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader } from '../../components/ui'
import { AI_MODEL_DEFAULTS } from '../../components/constants'

export default function SettingsAIEngine() {
  const { aiStats } = useSystemStatus()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <SectionHeader title="AI Engine" subtitle="Live status" dot="var(--peach)"/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: aiStats?.model_trained ? 'var(--mint-deep)' : 'var(--peach-deep)', animation: aiStats?.model_trained ? 'pulse 2s infinite' : 'none' }}/>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{aiStats?.model_trained ? 'Model Trained' : 'Model Not Yet Trained'}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {aiStats?.total_predictions ?? 0} predictions made this session · {aiStats ? `${aiStats.avg_confidence?.toFixed?.(1) ?? '—'}% avg confidence` : 'no data yet'}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Configured Defaults" subtitle="Isolation Forest parameters — read-only reference from ai_engine/core.py" dot="var(--peach)"/>
        {AI_MODEL_DEFAULTS.map(t => (
          <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.value}</span>
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.6 }}>
          Changing these requires editing <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>ModelConfig</code> in
          the backend directly — no API surface exists to tune them remotely, by design.
        </div>
      </Card>
    </div>
  )
}