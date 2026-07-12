import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useSystemStatus } from '../context/SystemStatusContext'
import { Card, SectionHeader, Gauge, fmt, fmtT } from '../components/ui'

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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      {items.map(({ label, val, color }) => (
        <div key={label} style={{ background: 'var(--surface)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color }}>{val}</div>
        </div>
      ))}
    </div>
  )
}

function AreaChartCard({ title, subtitle, dot, data, lines }) {
  return (
    <Card>
      <SectionHeader title={title} subtitle={subtitle} dot={dot} />
      <ResponsiveContainer width="100%" height={170}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <defs>
            {lines.map(l => (
              <linearGradient key={l.key} id={`grad-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={l.color} stopOpacity={0.25}/>
                <stop offset="95%" stopColor={l.color} stopOpacity={0}/>
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }} interval="preserveStartEnd" tickLine={false} axisLine={false}/>
          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, boxShadow: 'var(--shadow-md)' }} labelStyle={{ color: 'var(--text-muted)' }} itemStyle={{ color: 'var(--text)' }}/>
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-ui)', paddingTop: 8, color: 'var(--text-muted)' }}/>
          {lines.map(l => (
            <Area key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} fill={`url(#grad-${l.key})`} dot={false} isAnimationActive={false}/>
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}

export default function Overview() {
  const { metric, history } = useSystemStatus()

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

      <AreaChartCard
        title="CPU & RAM" subtitle="Usage over time" dot="var(--mint)"
        data={history}
        lines={[
          { key: 'cpu', name: 'CPU %', color: 'var(--mint-deep)' },
          { key: 'ram', name: 'RAM %', color: 'var(--lavender-deep)' },
        ]}
      />

      <div className="grid-2">
        <AreaChartCard title="Disk" subtitle="Usage over time" dot="var(--peach)" data={history} lines={[{ key: 'disk', name: 'Disk %', color: 'var(--peach-deep)' }]}/>
        <AreaChartCard title="Network" subtitle="MB per poll interval" dot="var(--sage)" data={history} lines={[{ key: 'net', name: 'Net MB', color: 'var(--olive-deep)' }]}/>
      </div>
    </div>
  )
}