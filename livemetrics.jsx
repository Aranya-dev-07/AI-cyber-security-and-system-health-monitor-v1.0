import { useSystemStatus } from '../../context/SystemStatusContext'
import { Gauge, fmt, fmtT } from '../../components/ui'

function StatStrip({ metric }) {
  if (!metric) return null
  const items = [
    { label: 'CPU',      val: `${fmt(metric.cpu_percent)} %`,     color: 'var(--mint-deep)' },
    { label: 'RAM',      val: `${fmt(metric.ram_percent)} %`,     color: 'var(--lavender-deep)' },
    { label: 'Disk',     val: `${fmt(metric.disk_percent)} %`,    color: 'var(--peach-deep)' },
    { label: 'Sent',     val: `${fmt(metric.net_sent_mb, 3)} MB`, color: 'var(--sage-deep)' },
    { label: 'Received', val: `${fmt(metric.net_recv_mb, 3)} MB`, color: 'var(--olive-deep)' },
    { label: 'Time',     val: fmtT(metric.timestamp),             color: 'var(--text-dim)' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }} className="stat-strip">
      {items.map(({ label, val, color }) => (
        <div key={label} style={{ background: 'var(--surface)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color }}>{val}</div>
        </div>
      ))}
    </div>
  )
}

export default function LiveMetrics() {
  const { metric } = useSystemStatus()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="grid-4">
        <Gauge label="CPU"     value={metric?.cpu_percent}  color="var(--mint-deep)"     warn={70} danger={85}/>
        <Gauge label="RAM"     value={metric?.ram_percent}  color="var(--lavender-deep)" warn={70} danger={85}/>
        <Gauge label="Disk"    value={metric?.disk_percent} color="var(--peach-deep)"    warn={80} danger={90}/>
        <Gauge label="Network" value={metric ? Math.min(100, ((metric.net_sent_mb + metric.net_recv_mb) / 100) * 100) : null}
          color="var(--sage-deep)" unit="MB/poll" warn={50} danger={90}/>
      </div>
      <StatStrip metric={metric}/>
      {!metric && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
          No live reading yet — start monitoring in the terminal to populate these gauges.
        </div>
      )}
    </div>
  )
}