import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts'

// ─── constants ───────────────────────────────────────────────────────────────
const API     = ''
const POLL_MS = 5000
const MAX_HIST = 40

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt  = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d))
const fmtT = iso => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function severityColor(s) {
  const map = { CRITICAL: 'var(--rose-deep)', HIGH: 'var(--coral-deep)', MEDIUM: 'var(--peach-deep)', LOW: 'var(--sage-deep)', NORMAL: 'var(--mint-deep)' }
  return map[s] || 'var(--text-dim)'
}
function severityBg(s) {
  const map = { CRITICAL: 'var(--rose)', HIGH: 'var(--coral)', MEDIUM: 'var(--peach)', LOW: 'var(--sage)', NORMAL: 'var(--mint)' }
  return map[s] || 'var(--border)'
}
function metricColor(val, warn = 70, danger = 85) {
  if (val >= danger) return 'var(--rose-deep)'
  if (val >= warn)   return 'var(--coral-deep)'
  return 'var(--mint-deep)'
}

// ─── Gauge ───────────────────────────────────────────────────────────────────
function Gauge({ label, value, unit = '%', color = 'var(--mint-deep)', warn = 70, danger = 85 }) {
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
    <div style={S.gaugeCard}>
      <svg width="136" height="110" viewBox="0 0 136 110" style={{ display: 'block', margin: '0 auto' }}>
        <path d={arc(1)} fill="none" stroke="var(--border)" strokeWidth="9" strokeLinecap="round"/>
        <path d={arc(frac)} fill="none" stroke={arcCol} strokeWidth="9" strokeLinecap="round"
          style={{ transition: 'all 0.7s ease' }}/>
        <text x="68" y="66" textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, fill: arcCol }}>
          {value == null ? '—' : fmt(value)}
        </text>
        <text x="68" y="82" textAnchor="middle"
          style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }}>
          {unit}
        </text>
      </svg>
      <div style={S.gaugeLabel}>{label}</div>
      {val >= danger && <span style={{ ...S.badge, background: 'var(--rose)', color: 'var(--rose-deep)' }}>ALERT</span>}
      {val >= warn && val < danger && <span style={{ ...S.badge, background: 'var(--peach)', color: 'var(--peach-deep)' }}>WARN</span>}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, dot }) {
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

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return <div style={{ ...S.card, ...style }}>{children}</div>
}

// ─── Stat strip ───────────────────────────────────────────────────────────────
function StatStrip({ metric }) {
  if (!metric) return null
  const items = [
    { label: 'CPU',      val: `${fmt(metric.cpu_percent)} %`,          color: 'var(--mint-deep)' },
    { label: 'RAM',      val: `${fmt(metric.ram_percent)} %`,          color: 'var(--lavender-deep)' },
    { label: 'Disk',     val: `${fmt(metric.disk_percent)} %`,         color: 'var(--peach-deep)' },
    { label: 'Sent',     val: `${fmt(metric.net_sent_mb, 3)} MB`,      color: 'var(--sage-deep)' },
    { label: 'Received', val: `${fmt(metric.net_recv_mb, 3)} MB`,      color: 'var(--olive-deep)' },
    { label: 'Time',     val: fmtT(metric.timestamp),                  color: 'var(--text-dim)' },
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
      <SectionHeader title="Top 5 Processes" subtitle="Sorted by CPU usage" dot="var(--olive)"/>
      <div style={{ overflowX: 'auto' }}>
        <table style={S.table}>
          <thead>
            <tr>{['PID', 'Process Name', 'CPU %', 'Memory %', 'Status'].map(h => (
              <th key={h} style={S.th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>No process data yet — start monitoring first.</td></tr>
              : rows.map((p, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{p.pid}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--olive-deep)' }}>{p.name}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: metricColor(p.cpu_percent) }}>{fmt(p.cpu_percent)}%</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: metricColor(p.memory_percent) }}>{fmt(p.memory_percent)}%</td>
                  <td style={S.td}>
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

// ─── Run history ──────────────────────────────────────────────────────────────
function RunHistory({ runs }) {
  return (
    <Card>
      <SectionHeader title="Run History" subtitle="Past monitoring sessions" dot="var(--lavender)"/>
      <div style={{ overflowX: 'auto' }}>
        <table style={S.table}>
          <thead>
            <tr>{['Run ID', 'Started', 'Ended', 'Duration (s)', 'Alerts'].map(h => (
              <th key={h} style={S.th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {runs.length === 0
              ? <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>No runs recorded yet.</td></tr>
              : runs.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: 'var(--lavender-deep)', fontWeight: 600 }}>#{r.id}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtT(r.start_time)}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    {r.end_time ? fmtT(r.end_time) : <span style={{ color: 'var(--mint-deep)', fontWeight: 500 }}>In progress</span>}
                  </td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)' }}>{r.duration_seconds != null ? fmt(r.duration_seconds, 1) : '—'}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: r.alert_count > 0 ? 'var(--rose-deep)' : 'var(--text-muted)', fontWeight: r.alert_count > 0 ? 600 : 400 }}>{r.alert_count}</td>
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
      <SectionHeader title="AI Anomaly Detection" subtitle="Isolation Forest · real-time inference" dot="var(--peach)"/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Detected', val: stats?.total_anomalies ?? '—', color: 'var(--lavender-deep)' },
          { label: 'Critical',       val: stats?.critical_count  ?? '—', color: 'var(--rose-deep)' },
          { label: 'High',           val: stats?.high_count      ?? '—', color: 'var(--coral-deep)' },
          { label: 'Avg Confidence', val: stats ? `${fmt(stats.avg_confidence)}%` : '—', color: 'var(--mint-deep)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color }}>{val}</div>
          </div>
        ))}
      </div>

      {anomalies.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 0', fontSize: 13 }}>No anomalies detected yet.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {anomalies.slice(0, 5).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(a.severity)}` }}>
                <span style={{ background: severityBg(a.severity), color: severityColor(a.severity), borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, flexShrink: 0, marginTop: 1 }}>{a.severity}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 3 }}>{a.reason}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                    score {fmt(a.anomaly_score, 4)} · {fmt(a.confidence)}% confidence · {fmtT(a.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
      }

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: stats?.model_trained ? 'var(--mint-deep)' : 'var(--peach-deep)', animation: stats?.model_trained ? 'pulse 2s infinite' : 'none' }}/>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {stats?.model_trained ? `Model trained · ${stats?.total_predictions ?? 0} predictions made` : 'Model not yet trained'}
        </span>
      </div>
    </Card>
  )
}

// ─── AI Root Cause Analysis card ──────────────────────────────────────────────
function RootCauseAnalysisCard({ rca }) {
  return (
    <Card>
      <SectionHeader title="AI Root Cause Analysis" subtitle="Explainable AI · why the anomaly happened" dot="var(--peach)"/>

      {!rca
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>
            No anomaly has been analyzed yet.
          </div>
        : <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ background: severityBg(rca.severity), color: severityColor(rca.severity), borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700 }}>
                {rca.severity}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--peach-deep)' }}>
                {rca.root_cause}
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {fmtT(rca.timestamp)}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Primary Metric</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--lavender-deep)' }}>{rca.primary_metric}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Confidence</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--mint-deep)' }}>{fmt(rca.confidence)}%</div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Responsible Process</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--coral-deep)' }}>
                  {rca.responsible_process?.name ?? 'N/A'}
                  {rca.responsible_process?.pid >= 0 &&
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · pid {rca.responsible_process.pid}</span>}
                </div>
              </div>
            </div>

            {rca.responsible_process && rca.responsible_process.name !== 'N/A' && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                <span>CPU: <b style={{ color: 'var(--text)' }}>{fmt(rca.responsible_process.cpu)}%</b></span>
                <span>Memory: <b style={{ color: 'var(--text)' }}>{fmt(rca.responsible_process.memory)}%</b></span>
                <span>Status: <b style={{ color: 'var(--text)' }}>{rca.responsible_process.status}</b></span>
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>AI Explanation</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{rca.explanation}</div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>Historical Comparison</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{rca.historical_comparison}</div>
            </div>

            <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', borderLeft: '3px solid var(--peach-deep)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--peach-deep)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>Recommendation</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{rca.recommendation}</div>
            </div>
          </>
      }
    </Card>
  )
}

// ─── AI Health Score card (circular gauge + explanation) ─────────────────────
function HealthScoreGauge({ score, status }) {
  const R = 62; const CX = 76; const CY = 76
  const GAP = 50; const sweep = 360 - GAP
  const frac = Math.max(0, Math.min(1, (score ?? 0) / 100))
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

  const statusColors = {
    Excellent: 'var(--mint-deep)',
    Good:      'var(--olive-deep)',
    Fair:      'var(--peach-deep)',
    Poor:      'var(--coral-deep)',
    Critical:  'var(--rose-deep)',
  }
  const color = statusColors[status] || 'var(--lavender-deep)'

  return (
    <svg width="152" height="122" viewBox="0 0 152 122" style={{ display: 'block', margin: '0 auto' }}>
      <path d={arc(1)} fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round"/>
      <path d={arc(frac)} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" style={{ transition: 'all 0.7s ease' }}/>
      <text x={CX} y={CY - 4} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, fill: color }}>
        {score == null ? '—' : Math.round(score)}
      </text>
      <text x={CX} y={CY + 18} textAnchor="middle" style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fill: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {status || '—'}
      </text>
    </svg>
  )
}

function HealthScoreCard({ health }) {
  return (
    <Card>
      <SectionHeader title="AI Health Score" subtitle="Explainable AI · weighted composite score" dot="var(--peach)"/>

      {!health
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>
            No monitoring cycle has run yet.
          </div>
        : <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 20, alignItems: 'start' }}>
            <div>
              <HealthScoreGauge score={health.health_score} status={health.status}/>
              <div style={{ textAlign: 'center', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                Confidence {fmt(health.confidence)}%
              </div>
              <div style={{ textAlign: 'center', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                Updated {fmtT(health.timestamp)}
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Contributing Factors</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(health.contributing_factors || []).map((f, i) => (
                    <span key={i} style={{ background: 'var(--surface-2)', color: 'var(--lavender-deep)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 500, border: '1px solid var(--border)' }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>AI Explanation</div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{health.explanation}</div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>Historical Comparison</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{health.historical_comparison}</div>
              </div>
            </div>
          </div>
      }
    </Card>
  )
}

// ─── AI Recommendations card ──────────────────────────────────────────────────
function SmartRecommendationsCard({ recommendations }) {
  const list = recommendations || []
  return (
    <Card>
      <SectionHeader title="AI Recommendations" subtitle="Explainable AI · prioritized, metric-referenced advice" dot="var(--peach)"/>

      {list.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>
            No recommendations available yet.
          </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((r, i) => (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(r.priority)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ background: severityBg(r.priority), color: severityColor(r.priority), borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>
                    {r.priority}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{r.category}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--olive-deep)', fontWeight: 600 }}>
                    {r.estimated_urgency}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6 }}>{r.recommendation}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 6 }}>{r.reason}</div>
                <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <span>Impact: <b style={{ color: 'var(--text)' }}>{r.expected_impact}</b></span>
                  <span>Confidence: <b style={{ color: 'var(--text)' }}>{fmt(r.confidence)}%</b></span>
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}

// ─── AI Trend Analysis card ───────────────────────────────────────────────────
function TrendAnalysisCard({ trends }) {
  const list = trends || []
  return (
    <Card>
      <SectionHeader title="AI Trend Analysis" subtitle="Explainable AI · sustained trends vs. temporary spikes" dot="var(--peach)"/>

      {list.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>
            Not enough data collected yet to analyze trends.
          </div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {list.map((t, i) => (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(t.severity)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--peach-deep)' }}>{t.metric}</span>
                  <span style={{ background: severityBg(t.severity), color: severityColor(t.severity), borderRadius: 20, padding: '1px 8px', fontSize: 9, fontWeight: 700 }}>
                    {t.severity}
                  </span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                    {t.classification === 'temporary_spike' ? 'SPIKE' : t.classification === 'long_term_trend' ? 'TREND' : t.classification === 'stable' ? 'STABLE' : '—'}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t.trend_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 6 }}>{t.explanation}</div>
                <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <span>Duration: <b style={{ color: 'var(--text)' }}>{fmt(t.duration_minutes)}m</b></span>
                  <span>Rate: <b style={{ color: 'var(--text)' }}>{fmt(t.rate_of_change_per_min, 2)}%/min</b></span>
                  <span>Confidence: <b style={{ color: 'var(--text)' }}>{fmt(t.confidence)}%</b></span>
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}

// ─── AI Predictive Alerts card ────────────────────────────────────────────────
function PredictiveAlertsCard({ alerts }) {
  const list = alerts || []
  return (
    <Card>
      <SectionHeader title="AI Predictive Alerts" subtitle="Explainable AI · forecasted issues, not yet occurred" dot="var(--peach)"/>

      {list.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>
            No metric is currently trending toward a threshold breach.
          </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((a, i) => (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(a.predicted_severity)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ background: severityBg(a.predicted_severity), color: severityColor(a.predicted_severity), borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>
                    {a.predicted_severity}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--peach-deep)' }}>{a.predicted_issue}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    ETA {a.estimated_time_until}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6 }}>{a.explanation}</div>
                <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap', marginBottom: 6 }}>
                  <span>Horizon: <b style={{ color: 'var(--text)' }}>{a.horizon_minutes}m</b></span>
                  <span>Probability: <b style={{ color: 'var(--text)' }}>{fmt(a.probability)}%</b></span>
                  <span>Confidence: <b style={{ color: 'var(--text)' }}>{fmt(a.confidence)}%</b></span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Likely cause: {a.root_cause_likelihood}</div>
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 12, color: 'var(--text)', borderLeft: '3px solid var(--peach-deep)' }}>
                  {a.recommended_action}
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ healthy }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: healthy ? 'var(--mint)' : 'var(--rose)', color: healthy ? 'var(--mint-deep)' : 'var(--rose-deep)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: healthy ? 'pulse 2s infinite' : 'none', display: 'inline-block' }}/>
      {healthy ? 'LIVE' : 'OFFLINE'}
    </div>
  )
}

// ─── Clock ────────────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id) }, [])
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{t.toLocaleTimeString()}</span>
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [metric,   setMetric]   = useState(null)
  const [procs,    setProcs]    = useState([])
  const [runs,     setRuns]     = useState([])
  const [history,  setHistory]  = useState([])
  const [healthy,  setHealthy]  = useState(false)
  const [lastPoll, setLastPoll] = useState(null)
  const [error,    setError]    = useState(null)
  const [aiStats,  setAiStats]  = useState(null)
  const [anomalies,setAnomalies]= useState([])
  const [rca,      setRca]      = useState(null)
  const [health,   setHealth]   = useState(null)
  const [trendAnalysis, setTrendAnalysis] = useState([])
  const [predictiveAlerts, setPredictiveAlerts] = useState([])
  const [smartRecs, setSmartRecs] = useState([])

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

      // AI data — graceful fallback if not available
      try {
        const [sRes, aRes] = await Promise.all([axios.get(`${API}/ai/statistics`), axios.get(`${API}/ai/latest?limit=5`)])
        setAiStats(sRes.data)
        setAnomalies(aRes.data)
      } catch { /* AI data not available yet */ }

      // AI Root Cause Analysis — graceful fallback (404 until first anomaly)
      try {
        const rcaRes = await axios.get(`${API}/ai/rca`)
        setRca(rcaRes.data)
      } catch { /* no anomaly analyzed yet */ }

      // AI Health Score — graceful fallback (404 until first monitoring cycle)
      try {
        const healthRes = await axios.get(`${API}/ai/health-score`)
        setHealth(healthRes.data)
      } catch { /* no monitoring cycle yet */ }

      // AI Trend Analysis — graceful fallback (empty list until enough samples)
      try {
        const trendRes = await axios.get(`${API}/ai/trend-analysis`)
        setTrendAnalysis(trendRes.data)
      } catch { /* not enough data yet */ }

      // AI Predictive Alerts — graceful fallback (empty list if nothing trending)
      try {
        const predRes = await axios.get(`${API}/ai/predictive-alerts`)
        setPredictiveAlerts(predRes.data)
      } catch { /* not available yet */ }

      // AI Recommendations (explainable engine) — graceful fallback
      try {
        const recRes = await axios.get(`${API}/ai/smart-recommendations`)
        setSmartRecs(recRes.data)
      } catch { /* not available yet */ }

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
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cybersecurity Monitoring Platform</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <StatusPill healthy={healthy}/>
          <LiveClock/>
          {lastPoll && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>updated {lastPoll.toLocaleTimeString()}</span>}
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && <div style={S.errorBanner}>⚠  {error}</div>}

      <main style={S.main}>

        {/* GAUGES */}
        <div style={S.gaugeRow}>
          <Gauge label="CPU"     value={metric?.cpu_percent}  color="var(--mint-deep)"    warn={70} danger={85}/>
          <Gauge label="RAM"     value={metric?.ram_percent}  color="var(--lavender-deep)" warn={70} danger={85}/>
          <Gauge label="Disk"    value={metric?.disk_percent} color="var(--peach-deep)"   warn={80} danger={90}/>
          <Gauge label="Network" value={metric ? Math.min(100,((metric.net_sent_mb+metric.net_recv_mb)/100)*100) : null}
            color="var(--sage-deep)" unit="MB/poll" warn={50} danger={90}/>
        </div>

        {/* STAT STRIP */}
        <StatStrip metric={metric}/>

        {/* CHARTS — CPU + RAM */}
        <AreaChartCard
          title="CPU & RAM" subtitle="Usage over time" dot="var(--mint)"
          data={history}
          lines={[
            { key: 'cpu', name: 'CPU %',  color: 'var(--mint-deep)' },
            { key: 'ram', name: 'RAM %',  color: 'var(--lavender-deep)' },
          ]}
        />

        {/* CHARTS — Disk + Network side by side */}
        <div style={S.chartRow}>
          <AreaChartCard
            title="Disk" subtitle="Usage over time" dot="var(--peach)"
            data={history}
            lines={[{ key: 'disk', name: 'Disk %', color: 'var(--peach-deep)' }]}
          />
          <AreaChartCard
            title="Network" subtitle="MB per poll interval" dot="var(--sage)"
            data={history}
            lines={[{ key: 'net', name: 'Net MB', color: 'var(--olive-deep)' }]}
          />
        </div>

        {/* PROCESSES + RUN HISTORY side by side */}
        <div style={S.chartRow}>
          <ProcessTable rows={procs}/>
          <RunHistory runs={runs}/>
        </div>

        {/* AI PANEL */}
        <AIPanel stats={aiStats} anomalies={anomalies}/>

        {/* AI ROOT CAUSE ANALYSIS */}
        <RootCauseAnalysisCard rca={rca}/>

        {/* AI HEALTH SCORE */}
        <HealthScoreCard health={health}/>

        {/* AI RECOMMENDATIONS */}
        <SmartRecommendationsCard recommendations={smartRecs}/>

        {/* AI TREND ANALYSIS */}
        <TrendAnalysisCard trends={trendAnalysis}/>

        {/* AI PREDICTIVE ALERTS */}
        <PredictiveAlertsCard alerts={predictiveAlerts}/>

      </main>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.3s ease' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10, boxShadow: 'var(--shadow)' },
  headerTitle: { fontWeight: 700, fontSize: 15, color: 'var(--text)' },
  logoMark: { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--lavender-deep) 0%, var(--peach-deep) 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, boxShadow: 'var(--shadow-brand)' },
  main: { padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1400, width: '100%', margin: '0 auto' },
  errorBanner: { background: 'var(--rose)', borderBottom: '1px solid var(--rose-deep)', color: 'var(--rose-deep)', padding: '10px 28px', fontSize: 13, fontFamily: 'var(--font-mono)' },
  gaugeRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 },
  gaugeCard: { background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, boxShadow: 'var(--shadow)', border: '1px solid var(--border)' },
  gaugeLabel: { fontWeight: 600, fontSize: 12, letterSpacing: 0.8, color: 'var(--text-dim)', textTransform: 'uppercase' },
  badge: { borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },
  strip: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' },
  stripItem: { background: 'var(--surface)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  stripLabel: { fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-muted)', textTransform: 'uppercase' },
  stripVal: { fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 },
  chartRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  card: { background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '20px 22px', boxShadow: 'var(--shadow)', border: '1px solid var(--border)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' },
  td: { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--text)' },
}