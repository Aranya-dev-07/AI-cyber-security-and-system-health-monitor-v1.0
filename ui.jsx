import { useEffect, useState } from 'react'

// ─── formatting helpers ─────────────────────────────────────────────────
export const fmt = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d))
export const fmtT = iso => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── severity / metric color helpers ───────────────────────────────────
export function severityColor(s) {
  const map = { CRITICAL: 'var(--rose-deep)', HIGH: 'var(--coral-deep)', MEDIUM: 'var(--peach-deep)', LOW: 'var(--sage-deep)', NORMAL: 'var(--mint-deep)' }
  return map[s] || 'var(--text-dim)'
}
export function severityBg(s) {
  const map = { CRITICAL: 'var(--rose)', HIGH: 'var(--coral)', MEDIUM: 'var(--peach)', LOW: 'var(--sage)', NORMAL: 'var(--mint)' }
  return map[s] || 'var(--border)'
}
export function metricColor(val, warn = 70, danger = 85) {
  if (val >= danger) return 'var(--rose-deep)'
  if (val >= warn)   return 'var(--coral-deep)'
  return 'var(--mint-deep)'
}

// ─── shared table styles ────────────────────────────────────────────────
export const tableStyles = {
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' },
  td: { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--text)' },
}

// ─── Card ────────────────────────────────────────────────────────────────
export function Card({ children, style = {} }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '20px 22px', boxShadow: 'var(--shadow)', border: '1px solid var(--border)', ...style }}>
      {children}
    </div>
  )
}

// ─── SectionHeader ───────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      {dot && <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0 }}/>}
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.3, color: 'var(--text)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

// ─── Gauge ───────────────────────────────────────────────────────────────
export function Gauge({ label, value, unit = '%', color = 'var(--mint-deep)', warn = 70, danger = 85 }) {
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
  const arcCol = val >= danger ? 'var(--rose-deep)' : val >= warn ? 'var(--peach-deep)' : color

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, boxShadow: 'var(--shadow)', border: '1px solid var(--border)' }}>
      <svg width="136" height="110" viewBox="0 0 136 110" style={{ display: 'block', margin: '0 auto' }}>
        <path d={arc(1)} fill="none" stroke="var(--border)" strokeWidth="9" strokeLinecap="round"/>
        <path d={arc(frac)} fill="none" stroke={arcCol} strokeWidth="9" strokeLinecap="round" style={{ transition: 'all 0.7s ease' }}/>
        <text x="68" y="66" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, fill: arcCol }}>
          {value == null ? '—' : fmt(value)}
        </text>
        <text x="68" y="82" textAnchor="middle" style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }}>
          {unit}
        </text>
      </svg>
      <div style={{ fontWeight: 600, fontSize: 12, letterSpacing: 0.8, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{label}</div>
      {val >= danger && <span style={{ borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, background: 'var(--rose)', color: 'var(--rose-deep)' }}>ALERT</span>}
      {val >= warn && val < danger && <span style={{ borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, background: 'var(--peach)', color: 'var(--peach-deep)' }}>WARN</span>}
    </div>
  )
}

// ─── ConfidenceBar ───────────────────────────────────────────────────────
export function ConfidenceBar({ value, color = 'var(--lavender-deep)' }) {
  const v = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.6s ease' }}/>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color, flexShrink: 0 }}>{fmt(value)}%</span>
    </div>
  )
}

// ─── StatusPill ──────────────────────────────────────────────────────────
export function StatusPill({ healthy }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: healthy ? 'var(--mint)' : 'var(--rose)', color: healthy ? 'var(--mint-deep)' : 'var(--rose-deep)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: healthy ? 'pulse 2s infinite' : 'none', display: 'inline-block' }}/>
      {healthy ? 'LIVE' : 'OFFLINE'}
    </div>
  )
}

// ─── LiveClock ───────────────────────────────────────────────────────────
export function LiveClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id) }, [])
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{t.toLocaleTimeString()}</span>
}