import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, BarChart, Bar
} from 'recharts'

// ─── constants ───────────────────────────────────────────────────────────────
const API      = ''
const POLL_MS  = 5000
const MAX_HIST = 40

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt  = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d))
const fmtT = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
const fmtDT = iso => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

function severityColor(s) {
  return { CRITICAL: '#FF4444', HIGH: '#E02020', MEDIUM: '#CC1899', LOW: '#6B8E23', NORMAL: '#8FBF2F' }[s] || '#6860A0'
}
function severityBg(s) {
  return { CRITICAL: '#3D1A1A', HIGH: '#3D1A1A', MEDIUM: '#3D1A30', LOW: '#1E2A10', NORMAL: '#1E2A10' }[s] || '#1E1A30'
}
function priorityColor(p) {
  return { CRITICAL: '#FF4444', HIGH: '#E02020', MEDIUM: '#CC1899', LOW: '#6B8E23' }[p] || '#6860A0'
}
function healthScoreColor(score) {
  if (score >= 90) return '#8FBF2F'
  if (score >= 70) return '#9B87C8'
  if (score >= 50) return '#CC1899'
  if (score >= 30) return '#E02020'
  return '#FF4444'
}
function metricColor(val, warn = 70, danger = 85) {
  if (val >= danger) return '#E02020'
  if (val >= warn)   return '#CC1899'
  return '#6B8E23'
}
function trendIcon(dir) {
  return { increasing: '↑', decreasing: '↓', stable: '→', volatile: '⚡' }[dir] || '•'
}
function timelineIcon(type) {
  return { metric: '📊', anomaly: '🚨', alert: '⚠️', health: '💚', trend: '📈', root_cause: '🔍' }[type] || '•'
}
function deviationColor(d) {
  if (d > 30)  return '#FF4444'
  if (d > 15)  return '#E02020'
  if (d > 0)   return '#CC1899'
  if (d < -15) return '#9B87C8'
  return '#8FBF2F'
}

// ─── Gauge (system metrics) ─────────────────────────────────────────────────
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
        <path d={arc(1)} fill="none" stroke="#2A2A4A" strokeWidth="9" strokeLinecap="round"/>
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
      {val >= danger && <span style={{ ...S.badge, background: '#3D1A1A', color: '#FF4444' }}>ALERT</span>}
      {val >= warn && val < danger && <span style={{ ...S.badge, background: '#3D1A30', color: '#CC1899' }}>WARN</span>}
    </div>
  )
}

// ─── Health Score Gauge (AI) ─────────────────────────────────────────────────
function HealthGauge({ score, status, confidence, lastUpdated, reasons }) {
  const R = 62; const CX = 80; const CY = 80
  const GAP = 50; const sweep = 360 - GAP
  const frac = Math.max(0, Math.min(1, (score ?? 0) / 100))
  const r2d = a => (a * Math.PI) / 180
  const startAngle = 90 + GAP / 2
  const col = healthScoreColor(score ?? 0)

  function arc(pct) {
    const a = startAngle + pct * sweep
    const sx = CX + R * Math.cos(r2d(startAngle))
    const sy = CY + R * Math.sin(r2d(startAngle))
    const ex = CX + R * Math.cos(r2d(a))
    const ey = CY + R * Math.sin(r2d(a))
    const large = pct * sweep > 180 ? 1 : 0
    return `M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`
  }

  return (
    <Card style={{ gridColumn: 'span 2' }}>
      <SectionHeader title="AI Health Overview" subtitle="Composite system health assessment" dot={col}/>
      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0 }}>
          <svg width="160" height="140" viewBox="0 0 160 140" style={{ display: 'block' }}>
            <path d={arc(1)} fill="none" stroke="#2A2A4A" strokeWidth="10" strokeLinecap="round"/>
            <path d={arc(frac)} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round"
              style={{ transition: 'all 0.8s ease', filter: `drop-shadow(0 0 6px ${col}60)` }}/>
            <text x="80" y="72" textAnchor="middle" dominantBaseline="middle"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, fill: col }}>
              {score == null ? '—' : Math.round(score)}
            </text>
            <text x="80" y="95" textAnchor="middle"
              style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fill: 'var(--text-muted)', fontWeight: 500 }}>
              / 100
            </text>
          </svg>
          <div style={{ textAlign: 'center', marginTop: 4 }}>
            <span style={{ ...S.badge, background: `${col}20`, color: col, fontSize: 12, padding: '4px 14px' }}>{status || 'Unknown'}</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <MiniStat label="Confidence" value={`${fmt(confidence)}%`} color="#9B87C8"/>
            <MiniStat label="Last Updated" value={fmtT(lastUpdated)} color="#6860A0"/>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
            Assessment Reasons
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(reasons && reasons.length > 0) ? reasons.map((r, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-xs)', borderLeft: `2px solid ${col}` }}>
                {r}
              </div>
            )) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 10px' }}>No data yet.</div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── Mini stat ───────────────────────────────────────────────────────────────
function MiniStat({ label, value, color = 'var(--text)' }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color }}>{value}</div>
    </div>
  )
}

// ─── Section header ──────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      {dot && <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0, boxShadow: `0 0 8px ${dot}60` }}/>}
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

// ─── Card ────────────────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return <div style={{ ...S.card, ...style }}>{children}</div>
}

// ─── Confidence Bar ──────────────────────────────────────────────────────────
function ConfidenceBar({ value, height = 6 }) {
  const col = value >= 80 ? '#8FBF2F' : value >= 60 ? '#9B87C8' : value >= 40 ? '#CC1899' : '#E02020'
  return (
    <div style={{ width: '100%', height, background: '#2A2A4A', borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: col, borderRadius: height / 2, transition: 'width 0.6s ease', boxShadow: `0 0 6px ${col}40` }}/>
    </div>
  )
}

// ─── Stat strip ──────────────────────────────────────────────────────────────
function StatStrip({ metric }) {
  if (!metric) return null
  const items = [
    { label: 'CPU',      val: `${fmt(metric.cpu_percent)} %`,     color: '#6B8E23' },
    { label: 'RAM',      val: `${fmt(metric.ram_percent)} %`,     color: '#9B87C8' },
    { label: 'Disk',     val: `${fmt(metric.disk_percent)} %`,    color: '#CC1899' },
    { label: 'Sent',     val: `${fmt(metric.net_sent_mb, 3)} MB`, color: '#8FBF2F' },
    { label: 'Received', val: `${fmt(metric.net_recv_mb, 3)} MB`, color: '#B8A8E0' },
    { label: 'Time',     val: fmtT(metric.timestamp),             color: '#6860A0' },
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

// ─── Area chart card ─────────────────────────────────────────────────────────
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
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2A4A" vertical={false}/>
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#6860A0', fontFamily: 'var(--font-mono)' }} interval="preserveStartEnd" tickLine={false} axisLine={false}/>
          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#6860A0', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={{ background: '#14142A', border: '1px solid #2A2A4A', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, boxShadow: 'var(--shadow-md)', color: '#E8E6F0' }} labelStyle={{ color: '#6860A0' }}/>
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

// ─── Process table ───────────────────────────────────────────────────────────
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
              ? <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#6860A0', padding: '28px 0' }}>No process data yet — start monitoring first.</td></tr>
              : rows.map((p, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: '#6860A0' }}>{p.pid}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontWeight: 500, color: '#8FBF2F' }}>{p.name}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: metricColor(p.cpu_percent) }}>{fmt(p.cpu_percent)}%</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: metricColor(p.memory_percent) }}>{fmt(p.memory_percent)}%</td>
                  <td style={S.td}>
                    <span style={{ background: p.status === 'running' ? '#1E2A10' : '#1E1A30', color: p.status === 'running' ? '#8FBF2F' : '#6860A0', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
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

// ─── Run history ─────────────────────────────────────────────────────────────
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
              ? <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#6860A0', padding: '28px 0' }}>No runs recorded yet.</td></tr>
              : runs.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: '#B8A8E0', fontWeight: 600 }}>#{r.id}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtT(r.start_time)}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#6860A0' }}>
                    {r.end_time ? fmtT(r.end_time) : <span style={{ color: '#8FBF2F', fontWeight: 500 }}>In progress</span>}
                  </td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)' }}>{r.duration_seconds != null ? fmt(r.duration_seconds, 1) : '—'}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: r.alert_count > 0 ? '#E02020' : '#6860A0', fontWeight: r.alert_count > 0 ? 600 : 400 }}>{r.alert_count}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI TAB PANELS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Root Cause Analysis Panel ───────────────────────────────────────────────
function RootCausePanel({ rootCauses }) {
  return (
    <Card>
      <SectionHeader title="Root Cause Analysis" subtitle="AI-attributed metric responsibility" dot="#CC1899"/>
      {(!rootCauses || rootCauses.length === 0)
        ? <div style={S.emptyState}>No root cause data available yet.</div>
        : rootCauses.map((rc, i) => (
          <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: i < rootCauses.length - 1 ? 10 : 0, border: '1px solid var(--border)', borderLeft: `3px solid ${severityColor(rc.severity)}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={S.rcLabel}>Primary Metric</div>
                <div style={{ ...S.rcValue, color: '#CC1899' }}>{rc.primary_metric}</div>
              </div>
              <div>
                <div style={S.rcLabel}>Responsible Process</div>
                <div style={{ ...S.rcValue, color: '#9B87C8' }}>{rc.responsible_process}</div>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={S.rcLabel}>Root Cause</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>{rc.root_cause}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={S.rcLabel}>Severity</div>
                <span style={{ ...S.badge, background: severityBg(rc.severity), color: severityColor(rc.severity) }}>{rc.severity}</span>
              </div>
              <div>
                <div style={S.rcLabel}>Confidence</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#8FBF2F', fontWeight: 600 }}>{fmt(rc.confidence)}%</div>
                <ConfidenceBar value={rc.confidence}/>
              </div>
              <div>
                <div style={S.rcLabel}>Deviation</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: deviationColor(rc.deviation_percent), fontWeight: 600 }}>
                  {rc.deviation_percent > 0 ? '+' : ''}{fmt(rc.deviation_percent)}%
                </div>
              </div>
            </div>
            <div style={{ background: '#1E2A10', borderRadius: 'var(--radius-xs)', padding: '10px 12px', border: '1px solid #2A3A1A' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6B8E23', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Recommended Action</div>
              <div style={{ fontSize: 12, color: '#8FBF2F', lineHeight: 1.5 }}>{rc.recommendation}</div>
            </div>
          </div>
        ))
      }
    </Card>
  )
}

// ─── Trend Analysis Panel ────────────────────────────────────────────────────
function TrendPanel({ trends }) {
  return (
    <Card>
      <SectionHeader title="AI Trend Analysis" subtitle="Rolling metric trend detection" dot="#9B87C8"/>
      {(!trends || trends.length === 0)
        ? <div style={S.emptyState}>Collecting data for trend analysis...</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {trends.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 20, width: 32, textAlign: 'center', color: severityColor(t.severity) }}>{trendIcon(t.direction)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{t.metric}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.trend}</div>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Current</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{fmt(t.current_value)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Confidence</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: '#9B87C8' }}>{fmt(t.confidence)}%</div>
                  </div>
                  <span style={{ ...S.badge, background: severityBg(t.severity), color: severityColor(t.severity) }}>{t.severity}</span>
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}

// ─── Active Anomalies Panel ──────────────────────────────────────────────────
function AnomaliesPanel({ anomalies }) {
  return (
    <Card>
      <SectionHeader title="Active AI Anomalies" subtitle="Detected anomalies in chronological order" dot="#E02020"/>
      {(!anomalies || anomalies.length === 0)
        ? <div style={S.emptyState}>No anomalies detected. System operating normally.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
            {anomalies.map((a, i) => (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(a.severity)}`, border: '1px solid var(--border)', animation: 'slideIn 0.3s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...S.badge, background: severityBg(a.severity), color: severityColor(a.severity) }}>{a.severity}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{fmtT(a.timestamp)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Confidence</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#9B87C8' }}>{fmt(a.confidence)}%</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Affected Metric</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#CC1899', fontWeight: 600 }}>{a.affected_metric}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Process</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#9B87C8', fontWeight: 600 }}>{a.responsible_process}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{a.reason}</div>
                <div style={{ marginTop: 6 }}><ConfidenceBar value={a.confidence}/></div>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}

// ─── Recommendations Panel ───────────────────────────────────────────────────
function RecommendationsPanel({ recommendations }) {
  return (
    <Card>
      <SectionHeader title="AI Recommendations" subtitle="Prioritized actionable advice" dot="#6B8E23"/>
      {(!recommendations || recommendations.length === 0)
        ? <div style={S.emptyState}>No recommendations at this time.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recommendations.map((r, i) => (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${priorityColor(r.priority)}`, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ ...S.badge, background: `${priorityColor(r.priority)}20`, color: priorityColor(r.priority), fontWeight: 700 }}>{r.priority}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{r.category}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, marginBottom: 6 }}>{r.recommendation}</div>
                <div style={{ fontSize: 11, color: '#6B8E23', fontStyle: 'italic' }}>Impact: {r.estimated_impact}</div>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}

// ─── Timeline Panel ──────────────────────────────────────────────────────────
function TimelinePanel({ events }) {
  return (
    <Card>
      <SectionHeader title="System Health Timeline" subtitle="Chronological event log" dot="#B8A8E0"/>
      {(!events || events.length === 0)
        ? <div style={S.emptyState}>No events recorded yet.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 400, overflowY: 'auto', position: 'relative' }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: 15, top: 10, bottom: 10, width: 2, background: 'var(--border)', zIndex: 0 }}/>
            {events.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', position: 'relative', zIndex: 1, animation: 'slideIn 0.3s ease' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-2)', border: `2px solid ${severityColor(e.severity)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, boxShadow: `0 0 8px ${severityColor(e.severity)}30` }}>
                  {timelineIcon(e.event_type)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>{e.title}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{fmtT(e.timestamp)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>{e.description}</div>
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}

// ─── Insights Panel ──────────────────────────────────────────────────────────
function InsightsPanel({ insights }) {
  if (!insights) return (
    <Card>
      <SectionHeader title="AI Insights" subtitle="Natural-language system assessment" dot="#8FBF2F"/>
      <div style={S.emptyState}>Waiting for monitoring data...</div>
    </Card>
  )

  const riskCol = { LOW: '#8FBF2F', MODERATE: '#CC1899', HIGH: '#E02020', CRITICAL: '#FF4444', UNKNOWN: '#6860A0' }[insights.risk_level] || '#6860A0'

  return (
    <Card style={{ gridColumn: 'span 2' }}>
      <SectionHeader title="AI Insights" subtitle="Natural-language system assessment" dot="#8FBF2F"/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Risk Level</span>
        <span style={{ ...S.badge, background: `${riskCol}20`, color: riskCol, fontSize: 12, padding: '4px 14px', fontWeight: 700 }}>{insights.risk_level}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.8, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontStyle: 'italic', marginBottom: 14 }}>
        "{insights.summary}"
      </div>
      {insights.key_findings && insights.key_findings.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Key Findings</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {insights.key_findings.map((f, i) => (
              <span key={i} style={{ background: '#3D1A30', color: '#CC1899', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{f}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Historical Comparison Panel ─────────────────────────────────────────────
function BaselinePanel({ comparison }) {
  const metrics = comparison?.metrics || []
  return (
    <Card>
      <SectionHeader title="Historical Comparison" subtitle="Current vs baseline deviation" dot="#B8A8E0"/>
      {metrics.length === 0
        ? <div style={S.emptyState}>{comparison?.baseline_computed ? 'No data yet.' : 'Baseline will be computed after model training.'}</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {metrics.map((m, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 80px 90px', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>{m.metric}</div>
                <div style={{ position: 'relative', height: 8, background: '#2A2A4A', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, m.current)}%`, background: deviationColor(m.deviation_percent), borderRadius: 4, transition: 'width 0.6s ease' }}/>
                  {m.baseline > 0 && (
                    <div style={{ position: 'absolute', left: `${Math.min(100, m.baseline)}%`, top: -2, width: 2, height: 12, background: '#6860A0', borderRadius: 1 }}/>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Current</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmt(m.current)}%</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Baseline</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#6860A0' }}>{fmt(m.baseline)}%</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Deviation</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: deviationColor(m.deviation_percent) }}>
                    {m.deviation_percent > 0 ? '+' : ''}{fmt(m.deviation_percent)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}

// ─── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ healthy }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: healthy ? '#1E2A10' : '#3D1A1A', color: healthy ? '#8FBF2F' : '#FF4444', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: 'pulse 2s infinite', display: 'inline-block' }}/>
      {healthy ? 'LIVE' : 'OFFLINE'}
    </div>
  )
}

// ─── Clock ───────────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id) }, [])
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#6860A0' }}>{t.toLocaleTimeString()}</span>
}

// ─── Tab button ──────────────────────────────────────────────────────────────
function TabButton({ label, active, onClick, icon }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'var(--surface-2)' : 'transparent',
      color: active ? 'var(--text)' : 'var(--text-muted)',
      border: active ? '1px solid var(--border-light)' : '1px solid transparent',
      borderBottom: active ? '2px solid #9B87C8' : '2px solid transparent',
      borderRadius: '8px 8px 0 0',
      padding: '10px 20px',
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      fontFamily: 'var(--font-ui)',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}>
      {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
      {label}
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [activeTab, setActiveTab] = useState('system')
  const [metric,    setMetric]    = useState(null)
  const [procs,     setProcs]     = useState([])
  const [runs,      setRuns]      = useState([])
  const [history,   setHistory]   = useState([])
  const [healthy,   setHealthy]   = useState(false)
  const [lastPoll,  setLastPoll]  = useState(null)
  const [error,     setError]     = useState(null)
  const [aiData,    setAiData]    = useState(null)
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

      // Fetch AI dashboard bundle in one request
      try {
        const aiRes = await axios.get(`${API}/ai/dashboard`)
        setAiData(aiRes.data)
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

  const health       = aiData?.health || {}
  const rootCauses   = aiData?.root_causes || []
  const trends       = aiData?.trends || []
  const anomalies    = aiData?.active_anomalies || []
  const recs         = aiData?.recommendations || []
  const timeline     = aiData?.timeline || []
  const insights     = aiData?.insights || null
  const baseline     = aiData?.baseline_comparison || {}

  return (
    <div style={S.root}>
      {/* HEADER */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={S.logoMark}>⬡</div>
          <div>
            <div style={S.headerTitle}>System Health Monitor</div>
            <div style={{ fontSize: 11, color: '#6860A0' }}>Cybersecurity Monitoring Platform</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <StatusPill healthy={healthy}/>
          {aiData && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: healthScoreColor(health.score || 0), fontWeight: 600 }}>
            Health: {health.score != null ? Math.round(health.score) : '—'}
          </span>}
          <LiveClock/>
          {lastPoll && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6860A0' }}>updated {lastPoll.toLocaleTimeString()}</span>}
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && <div style={S.errorBanner}>⚠  {error}</div>}

      {/* TABS */}
      <div style={S.tabBar}>
        <TabButton label="System Metrics" active={activeTab === 'system'} onClick={() => setActiveTab('system')} icon="📊"/>
        <TabButton label="AI Intelligence" active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon="🤖"/>
      </div>

      <main style={S.main}>

        {/* ═══ TAB 1: System Metrics ═══ */}
        {activeTab === 'system' && (
          <>
            {/* GAUGES */}
            <div style={S.gaugeRow}>
              <Gauge label="CPU"     value={metric?.cpu_percent}  arcCol="#6B8E23" warn={70} danger={85}/>
              <Gauge label="RAM"     value={metric?.ram_percent}  arcCol="#9B87C8" warn={70} danger={85}/>
              <Gauge label="Disk"    value={metric?.disk_percent} arcCol="#CC1899" warn={80} danger={90}/>
              <Gauge label="Network" value={metric ? Math.min(100,((metric.net_sent_mb+metric.net_recv_mb)/100)*100) : null}
                arcCol="#B8A8E0" unit="MB/poll" warn={50} danger={90}/>
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
          </>
        )}

        {/* ═══ TAB 2: AI Intelligence ═══ */}
        {activeTab === 'ai' && (
          <>
            {/* Row 1: Health Gauge + Insights */}
            <div style={S.chartRow}>
              <HealthGauge
                score={health.score}
                status={health.status}
                confidence={health.confidence}
                lastUpdated={health.last_updated}
                reasons={health.reasons}
              />
              <InsightsPanel insights={insights}/>
            </div>

            {/* Row 2: Root Cause + Trends */}
            <div style={S.chartRow}>
              <RootCausePanel rootCauses={rootCauses}/>
              <TrendPanel trends={trends}/>
            </div>

            {/* Row 3: Anomalies + Recommendations */}
            <div style={S.chartRow}>
              <AnomaliesPanel anomalies={anomalies}/>
              <RecommendationsPanel recommendations={recs}/>
            </div>

            {/* Row 4: Timeline + Baseline Comparison */}
            <div style={S.chartRow}>
              <TimelinePanel events={timeline}/>
              <BaselinePanel comparison={baseline}/>
            </div>
          </>
        )}

      </main>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.3s ease' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', background: 'linear-gradient(90deg, #14142A 0%, #1A1A36 100%)', borderBottom: '1px solid #2A2A4A', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.4)' },
  headerTitle: { fontWeight: 700, fontSize: 15, color: '#E8E6F0' },
  logoMark: { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #9B87C8 0%, #6B8E23 100%)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 },
  tabBar: { display: 'flex', gap: 4, padding: '0 28px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' },
  main: { padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1400, width: '100%', margin: '0 auto' },
  errorBanner: { background: '#3D1A1A', borderBottom: '1px solid #E02020', color: '#FF4444', padding: '10px 28px', fontSize: 13, fontFamily: 'var(--font-mono)' },
  gaugeRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 },
  gaugeCard: { background: 'linear-gradient(145deg, #14142A 40%, #1A1A36 100%)', borderRadius: 'var(--radius)', padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, boxShadow: 'var(--shadow)', border: '1px solid #2A2A4A' },
  gaugeLabel: { fontWeight: 600, fontSize: 12, letterSpacing: 0.8, color: '#A8A0C0', textTransform: 'uppercase' },
  badge: { borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },
  strip: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1, background: '#2A2A4A', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' },
  stripItem: { background: 'var(--surface)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  stripLabel: { fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: '#6860A0', textTransform: 'uppercase' },
  stripVal: { fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 },
  chartRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  card: { background: 'linear-gradient(150deg, #14142A 30%, #1A1A36 100%)', borderRadius: 'var(--radius)', padding: '20px 22px', boxShadow: 'var(--shadow)', border: '1px solid #2A2A4A' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: '#6860A0', textTransform: 'uppercase', borderBottom: '1px solid #2A2A4A' },
  td: { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #2A2A4A', color: '#E8E6F0' },
  emptyState: { textAlign: 'center', color: '#6860A0', padding: '28px 0', fontSize: 13, fontStyle: 'italic' },
  rcLabel: { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  rcValue: { fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600 },
}