import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'

// ─── constants ───────────────────────────────────────────────────────────────
const API     = ''
const POLL_MS = 5000
const MAX_HIST = 40

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt  = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d))
const fmtT = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

function severityColor(s) {
  return { CRITICAL: '#B01010', HIGH: '#E02020', MEDIUM: '#A01278', LOW: '#4A6318', NORMAL: '#6B8E23' }[s] || '#9890B8'
}
function severityBg(s) {
  return { CRITICAL: '#FDEAEA', HIGH: '#FDE0E0', MEDIUM: '#FDE6F6', LOW: '#EBF0DC', NORMAL: '#EBF0DC' }[s] || '#EDE9F8'
}
function metricColor(val, warn = 70, danger = 85) {
  if (val >= danger) return '#E02020'
  if (val >= warn)   return '#CC1899'
  return '#4A6318'
}

// ─── Gauge ───────────────────────────────────────────────────────────────────
function Gauge({ label, value, unit = '%', arcCol = '#9B87C8', warn = 70, danger = 85 }) {
  const R = 52; const CX = 68; const CY = 68
  const GAP = 50; const sweep = 360 - GAP
  const frac = Math.max(0, Math.min(1, (value ?? 0) / 100))
  const r2d = a => (a * Math.PI) / 180
  const startAngle = 90 + GAP / 2

  function arc(pct) {
    const a = startAngle + pct * sweep
    const sx = CX + R * Math.cos(r2d(startAngle))
    const sy = CY + R * Math.sin(r2d(startAngle))
    const ex = CX + R * Math.cos(r2d(a))
    const ey = CY + R * Math.sin(r2d(a))
    const large = pct * sweep > 180 ? 1 : 0
    return `M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`
  }

  const val = value ?? 0
  const col = val >= danger ? '#E02020' : val >= warn ? '#CC1899' : arcCol

  return (
    <div style={S.gaugeCard}>
      <svg width="136" height="110" viewBox="0 0 136 110" style={{ display: 'block', margin: '0 auto' }}>
        <path d={arc(1)} fill="none" stroke="#D4C8EE" strokeWidth="9" strokeLinecap="round"/>
        <path d={arc(frac)} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round"
          style={{ transition: 'all 0.7s ease' }}/>
        <text x="68" y="66" textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, fill: col }}>
          {value == null ? '—' : fmt(value)}
        </text>
        <text x="68" y="82" textAnchor="middle"
          style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }}>
          {unit}
        </text>
      </svg>
      <div style={S.gaugeLabel}>{label}</div>
      {val >= danger && <span style={{ ...S.badge, background: '#FDEAEA', color: '#B01010' }}>ALERT</span>}
      {val >= warn && val < danger && <span style={{ ...S.badge, background: '#FDE6F6', color: '#A01278' }}>WARN</span>}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      {dot && <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0 }}/>}
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return <div style={{ ...S.card, ...style }}>{children}</div>
}

// ─── Stat strip ───────────────────────────────────────────────────────────────
function StatStrip({ metric }) {
  if (!metric) return null
  const items = [
    { label: 'CPU',      val: `${fmt(metric.cpu_percent)} %`,     color: '#6B8E23' },
    { label: 'RAM',      val: `${fmt(metric.ram_percent)} %`,     color: '#9B87C8' },
    { label: 'Disk',     val: `${fmt(metric.disk_percent)} %`,    color: '#CC1899' },
    { label: 'Sent',     val: `${fmt(metric.net_sent_mb, 3)} MB`, color: '#4A6318' },
    { label: 'Received', val: `${fmt(metric.net_recv_mb, 3)} MB`, color: '#6B58A8' },
    { label: 'Time',     val: fmtT(metric.timestamp),             color: '#5A5278' },
  ]
  return (
    <div style={S.strip}>
      {items.map(({ label, val, color }) => (
        <div key={label} style={S.stripItem}>
          <div style={S.stripLabel}>{label}</div>
          <div style={{ ...S.stripVal, color }}>{val}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Area chart card ──────────────────────────────────────────────────────────
function AreaChartCard({ title, subtitle, dot, data, lines }) {
  return (
    <Card>
      <SectionHeader title={title} subtitle={subtitle} dot={dot}/>
      <ResponsiveContainer width="100%" height={170}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <defs>
            {lines.map(l => (
              <linearGradient key={l.key} id={`grad-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={l.color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={l.color} stopOpacity={0}/>
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#D4C8EE" vertical={false}/>
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#9890B8', fontFamily: 'var(--font-mono)' }} interval="preserveStartEnd" tickLine={false} axisLine={false}/>
          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9890B8', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #D4C8EE', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, boxShadow: 'var(--shadow-md)' }} labelStyle={{ color: '#9890B8' }}/>
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-ui)', paddingTop: 8 }}/>
          {lines.map(l => (
            <Area key={l.key} type="monotone" dataKey={l.key} name={l.name}
              stroke={l.color} strokeWidth={2} fill={`url(#grad-${l.key})`}
              dot={false} isAnimationActive={false}/>
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ─── Process table ────────────────────────────────────────────────────────────
function ProcessTable({ rows }) {
  return (
    <Card>
      <SectionHeader title="Top 5 Processes" subtitle="Sorted by CPU usage" dot="#6B8E23"/>
      <div style={{ overflowX: 'auto' }}>
        <table style={S.table}>
          <thead>
            <tr>{['PID', 'Process Name', 'CPU %', 'Memory %', 'Status'].map(h => (
              <th key={h} style={S.th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#9890B8', padding: '28px 0' }}>No process data yet — start monitoring first.</td></tr>
              : rows.map((p, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#EBF0DC' }}>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: '#9890B8' }}>{p.pid}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontWeight: 500, color: '#4A6318' }}>{p.name}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: metricColor(p.cpu_percent) }}>{fmt(p.cpu_percent)}%</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: metricColor(p.memory_percent) }}>{fmt(p.memory_percent)}%</td>
                  <td style={S.td}>
                    <span style={{ background: p.status === 'running' ? '#EBF0DC' : '#EDE9F8', color: p.status === 'running' ? '#4A6318' : '#9890B8', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
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

// ─── Run history ──────────────────────────────────────────────────────────────
function RunHistory({ runs }) {
  return (
    <Card>
      <SectionHeader title="Run History" subtitle="Past monitoring sessions" dot="#9B87C8"/>
      <div style={{ overflowX: 'auto' }}>
        <table style={S.table}>
          <thead>
            <tr>{['Run ID', 'Started', 'Ended', 'Duration (s)', 'Alerts'].map(h => (
              <th key={h} style={S.th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {runs.length === 0
              ? <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#9890B8', padding: '28px 0' }}>No runs recorded yet.</td></tr>
              : runs.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#EDE9F8' }}>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: '#6B58A8', fontWeight: 600 }}>#{r.id}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtT(r.start_time)}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#9890B8' }}>
                    {r.end_time ? fmtT(r.end_time) : <span style={{ color: '#4A6318', fontWeight: 500 }}>In progress</span>}
                  </td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)' }}>{r.duration_seconds != null ? fmt(r.duration_seconds, 1) : '—'}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: r.alert_count > 0 ? '#E02020' : '#9890B8', fontWeight: r.alert_count > 0 ? 600 : 400 }}>{r.alert_count}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── AI panel ─────────────────────────────────────────────────────────────────
function AIPanel({ stats, anomalies }) {
  return (
    <Card>
      <SectionHeader title="AI Anomaly Detection" subtitle="Isolation Forest · real-time inference" dot="#CC1899"/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Detected', val: stats?.total_anomalies ?? '—', color: '#6B58A8' },
          { label: 'Critical',       val: stats?.critical_count  ?? '—', color: '#B01010' },
          { label: 'High',           val: stats?.high_count      ?? '—', color: '#E02020' },
          { label: 'Avg Confidence', val: stats ? `${fmt(stats.avg_confidence)}%` : '—', color: '#4A6318' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: '#FFFFFF', borderRadius: 'var(--radius-sm)', padding: '12px 14px', border: '1px solid #D4C8EE' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9890B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color }}>{val}</div>
          </div>
        ))}
      </div>

      {anomalies.length === 0
        ? <div style={{ textAlign: 'center', color: '#9890B8', padding: '16px 0', fontSize: 13 }}>No anomalies detected yet.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {anomalies.slice(0, 5).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: '#FFFFFF', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(a.severity)}` }}>
                <span style={{ background: severityBg(a.severity), color: severityColor(a.severity), borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, flexShrink: 0, marginTop: 1 }}>{a.severity}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 3 }}>{a.reason}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#9890B8' }}>
                    score {fmt(a.anomaly_score, 4)} · {fmt(a.confidence)}% confidence · {fmtT(a.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
      }

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: stats?.model_trained ? '#6B8E23' : '#CC1899', animation: 'pulse 2s infinite' }}/>
        <span style={{ fontSize: 11, color: '#9890B8', fontFamily: 'var(--font-mono)' }}>
          {stats?.model_trained ? `Model trained · ${stats?.total_predictions ?? 0} predictions made` : 'Model not yet trained'}
        </span>
      </div>
    </Card>
  )
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ healthy }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: healthy ? '#EBF0DC' : '#FDEAEA', color: healthy ? '#4A6318' : '#B01010', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: 'pulse 2s infinite', display: 'inline-block' }}/>
      {healthy ? 'LIVE' : 'OFFLINE'}
    </div>
  )
}

// ─── Clock ────────────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id) }, [])
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#9890B8' }}>{t.toLocaleTimeString()}</span>
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [metric,    setMetric]    = useState(null)
  const [procs,     setProcs]     = useState([])
  const [runs,      setRuns]      = useState([])
  const [history,   setHistory]   = useState([])
  const [healthy,   setHealthy]   = useState(false)
  const [lastPoll,  setLastPoll]  = useState(null)
  const [error,     setError]     = useState(null)
  const [aiStats,   setAiStats]   = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const histRef = useRef([])

  const poll = useCallback(async () => {
    try {
      await axios.get(`${API}/health`)
      setHealthy(true); setError(null)

      const mRes = await axios.get(`${API}/metrics`)
      const m = mRes.data
      setMetric(m)

      const point = { t: fmtT(m.timestamp), cpu: m.cpu_percent, ram: m.ram_percent, disk: m.disk_percent, net: parseFloat((m.net_sent_mb + m.net_recv_mb).toFixed(3)) }
      histRef.current = [...histRef.current.slice(-(MAX_HIST - 1)), point]
      setHistory([...histRef.current])

      const [pRes, rRes] = await Promise.all([axios.get(`${API}/processes`), axios.get(`${API}/runs?limit=10`)])
      setProcs(pRes.data)
      setRuns(rRes.data)

      try {
        const [sRes, aRes] = await Promise.all([axios.get(`${API}/ai/statistics`), axios.get(`${API}/ai/latest?limit=5`)])
        setAiStats(sRes.data)
        setAnomalies(aRes.data)
      } catch { /* AI not ready yet */ }

      setLastPoll(new Date())
    } catch (e) {
      if (e.response?.status === 404) {
        setHealthy(true)
        setError('Monitoring not started yet — type  start  in the terminal.')
      } else {
        setHealthy(false)
        setError('Cannot reach the API — is main.py running?')
      }
    }
  }, [])

  useEffect(() => { poll(); const id = setInterval(poll, POLL_MS); return () => clearInterval(id) }, [poll])

  return (
    <div style={S.root}>
      {/* HEADER */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={S.logoMark}>⬡</div>
          <div>
            <div style={S.headerTitle}>System Health Monitor</div>
            <div style={{ fontSize: 11, color: '#9890B8' }}>Cybersecurity Monitoring Platform</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <StatusPill healthy={healthy}/>
          <LiveClock/>
          {lastPoll && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#9890B8' }}>updated {lastPoll.toLocaleTimeString()}</span>}
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && <div style={S.errorBanner}>⚠  {error}</div>}

      <main style={S.main}>

        {/* GAUGES */}
        <div style={S.gaugeRow}>
          <Gauge label="CPU"     value={metric?.cpu_percent}  arcCol="#6B8E23" warn={70} danger={85}/>
          <Gauge label="RAM"     value={metric?.ram_percent}  arcCol="#9B87C8" warn={70} danger={85}/>
          <Gauge label="Disk"    value={metric?.disk_percent} arcCol="#CC1899" warn={80} danger={90}/>
          <Gauge label="Network" value={metric ? Math.min(100,((metric.net_sent_mb+metric.net_recv_mb)/100)*100) : null}
            arcCol="#6B58A8" unit="MB/poll" warn={50} danger={90}/>
        </div>

        {/* STAT STRIP */}
        <StatStrip metric={metric}/>

        {/* CPU + RAM chart */}
        <AreaChartCard title="CPU & RAM" subtitle="Usage over time" dot="#9B87C8" data={history}
          lines={[
            { key: 'cpu', name: 'CPU %', color: '#6B8E23' },
            { key: 'ram', name: 'RAM %', color: '#9B87C8' },
          ]}
        />

        {/* Disk + Network */}
        <div style={S.chartRow}>
          <AreaChartCard title="Disk" subtitle="Usage over time" dot="#CC1899" data={history}
            lines={[{ key: 'disk', name: 'Disk %', color: '#CC1899' }]}
          />
          <AreaChartCard title="Network" subtitle="MB per poll interval" dot="#6B8E23" data={history}
            lines={[{ key: 'net', name: 'Net MB', color: '#E02020' }]}
          />
        </div>

        {/* Processes + Run history */}
        <div style={S.chartRow}>
          <ProcessTable rows={procs}/>
          <RunHistory runs={runs}/>
        </div>

        {/* AI Panel */}
        <AIPanel stats={aiStats} anomalies={anomalies}/>

      </main>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.3s ease' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', background: 'linear-gradient(90deg, #DDD6F0 0%, #D4E4B0 100%)', borderBottom: '1px solid #D4C8EE', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 4px rgba(155,135,200,0.15)' },
  headerTitle: { fontWeight: 700, fontSize: 15, color: '#1E1A30' },
  logoMark: { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #9B87C8 0%, #6B8E23 100%)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 },
  main: { padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1400, width: '100%', margin: '0 auto' },
  errorBanner: { background: '#FDEAEA', borderBottom: '1px solid #E02020', color: '#B01010', padding: '10px 28px', fontSize: 13, fontFamily: 'var(--font-mono)' },
  gaugeRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 },
  gaugeCard: { background: 'linear-gradient(145deg, #FFFFFF 40%, #EDE9F8 100%)', borderRadius: 'var(--radius)', padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, boxShadow: '0 1px 4px rgba(155,135,200,0.15), 0 4px 14px rgba(107,142,35,0.08)', border: '1px solid #D4C8EE' },
  gaugeLabel: { fontWeight: 600, fontSize: 12, letterSpacing: 0.8, color: '#5A5278', textTransform: 'uppercase' },
  badge: { borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },
  strip: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1, background: '#D4C8EE', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(155,135,200,0.15)' },
  stripItem: { background: 'linear-gradient(160deg, #FFFFFF 0%, #EBF0DC 100%)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  stripLabel: { fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: '#9890B8', textTransform: 'uppercase' },
  stripVal: { fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 },
  chartRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  card: { background: 'linear-gradient(150deg, #FFFFFF 30%, #EDE9F8 100%)', borderRadius: 'var(--radius)', padding: '20px 22px', boxShadow: '0 1px 4px rgba(155,135,200,0.15), 0 4px 14px rgba(107,142,35,0.08)', border: '1px solid #D4C8EE' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: '#9890B8', textTransform: 'uppercase', borderBottom: '1px solid #D4C8EE' },
  td: { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #D4C8EE', color: '#1E1A30' },
}