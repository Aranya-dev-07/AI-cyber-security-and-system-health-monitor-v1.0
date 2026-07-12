import { useSystemStatus } from '../context/SystemStatusContext'
import { Card, SectionHeader, fmt, fmtT, tableStyles } from '../components/ui'

export default function Runs() {
  const { runs } = useSystemStatus()

  return (
    <Card>
      <SectionHeader title="Run History" subtitle="Past monitoring sessions" dot="var(--lavender)"/>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyles.table}>
          <thead>
            <tr>{['Run ID', 'Started', 'Ended', 'Duration (s)', 'Alerts'].map(h => (
              <th key={h} style={tableStyles.th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {runs.length === 0
              ? <tr><td colSpan={5} style={{ ...tableStyles.td, textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>No runs recorded yet.</td></tr>
              : runs.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                  <td style={{ ...tableStyles.td, fontFamily: 'var(--font-mono)', color: 'var(--lavender-deep)', fontWeight: 600 }}>#{r.id}</td>
                  <td style={{ ...tableStyles.td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtT(r.start_time)}</td>
                  <td style={{ ...tableStyles.td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    {r.end_time ? fmtT(r.end_time) : <span style={{ color: 'var(--mint-deep)', fontWeight: 500 }}>In progress</span>}
                  </td>
                  <td style={{ ...tableStyles.td, fontFamily: 'var(--font-mono)' }}>{r.duration_seconds != null ? fmt(r.duration_seconds, 1) : '—'}</td>
                  <td style={{ ...tableStyles.td, fontFamily: 'var(--font-mono)', color: r.alert_count > 0 ? 'var(--rose-deep)' : 'var(--text-muted)', fontWeight: r.alert_count > 0 ? 600 : 400 }}>{r.alert_count}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </Card>
  )
}