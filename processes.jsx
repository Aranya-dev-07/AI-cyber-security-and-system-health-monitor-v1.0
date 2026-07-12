import { useSystemStatus } from '../context/SystemStatusContext'
import { Card, SectionHeader, fmt, metricColor, tableStyles } from '../components/ui'

export default function Processes() {
  const { procs } = useSystemStatus()

  return (
    <Card>
      <SectionHeader title="Top 5 Processes" subtitle="Sorted by CPU usage" dot="var(--olive)"/>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyles.table}>
          <thead>
            <tr>{['PID', 'Process Name', 'CPU %', 'Memory %', 'Status'].map(h => (
              <th key={h} style={tableStyles.th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {procs.length === 0
              ? <tr><td colSpan={5} style={{ ...tableStyles.td, textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>No process data yet — start monitoring first.</td></tr>
              : procs.map((p, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                  <td style={{ ...tableStyles.td, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{p.pid}</td>
                  <td style={{ ...tableStyles.td, fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--olive-deep)' }}>{p.name}</td>
                  <td style={{ ...tableStyles.td, fontFamily: 'var(--font-mono)', color: metricColor(p.cpu_percent) }}>{fmt(p.cpu_percent)}%</td>
                  <td style={{ ...tableStyles.td, fontFamily: 'var(--font-mono)', color: metricColor(p.memory_percent) }}>{fmt(p.memory_percent)}%</td>
                  <td style={tableStyles.td}>
                    <span style={{ background: p.status === 'running' ? 'var(--mint)' : 'var(--border)', color: p.status === 'running' ? 'var(--mint-deep)' : 'var(--text-muted)', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </Card>
  )
}