import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Card, SectionHeader } from './ui'

// ─── AreaChartCard ─────────────────────────────────────────────────────────
// Shared interactive time-series chart card (hover tooltips, legend).
// Used by the Monitoring Workspace's Graphs tab.
export function AreaChartCard({ title, subtitle, dot, data, lines, height = 200 }) {
  return (
    <Card>
      <SectionHeader title={title} subtitle={subtitle} dot={dot} />
      <ResponsiveContainer width="100%" height={height}>
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