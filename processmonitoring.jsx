import { useMemo, useState } from 'react'
import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader, SearchInput, fmt, metricColor, tableStyles } from '../../components/ui'

export default function ProcessMonitoring() {
  const { procs } = useSystemStatus()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return procs
    return procs.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      String(p.pid).includes(q) ||
      p.status?.toLowerCase().includes(q)
    )
  }, [procs, query])

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <SectionHeader title="Process Monitoring" subtitle="Top resource-consuming processes, sorted by CPU usage" dot="var(--lavender)"/>
        <div style={{ width: 240 }}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search name, PID, status…"/>
        </div>
      </div>

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
              : filtered.length === 0
                ? <tr><td colSpan={5} style={{ ...tableStyles.td, textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>No processes match "{query}".</td></tr>
                : filtered.map((p, i) => (
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

      {procs.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, fontFamily: 'var(--font-mono)' }}>
          Showing {filtered.length} of {procs.length} processes
        </div>
      )}
    </Card>
  )
}