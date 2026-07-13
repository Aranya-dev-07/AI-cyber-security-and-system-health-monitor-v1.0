import { Link } from 'react-router-dom'
import { useSystemStatus } from '../context/SystemStatusContext'
import { Card, SectionHeader, fmt, fmtT, severityColor, severityBg } from '../components/ui'
import { NavIcon } from '../components/icons'

// ─────────────────────────────────────────────────────────────────────────
// Dashboard Landing Page (Phase 2)
// Executive overview only — no time-series charts, no data tables.
// Deep detail lives on the dedicated workspace pages this page links out to.
// ─────────────────────────────────────────────────────────────────────────

const RISK_TONE = {
  LOW:      { fg: 'var(--mint-deep)',   bg: 'var(--mint)' },
  MODERATE: { fg: 'var(--peach-deep)',  bg: 'var(--peach)' },
  HIGH:     { fg: 'var(--coral-deep)',  bg: 'var(--coral)' },
  CRITICAL: { fg: 'var(--rose-deep)',   bg: 'var(--rose)' },
  UNKNOWN:  { fg: 'var(--sage-deep)',   bg: 'var(--sage)' },
}

const HEALTH_STATUS_COLOR = {
  Excellent: 'var(--mint-deep)',
  Good:      'var(--olive-deep)',
  Fair:      'var(--peach-deep)',
  Poor:      'var(--coral-deep)',
  Critical:  'var(--rose-deep)',
}

const ACTIVITY_ICON = {
  anomaly:    'alert',
  root_cause: 'search',
  health:     'gauge',
  trend:      'trend',
  alert:      'radar',
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// ─── Welcome ────────────────────────────────────────────────────────────
function WelcomeSection({ healthy, monitoringActive, todayLabel }) {
  return (
    <Card style={{ background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{greeting()}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{todayLabel} · System Health Monitor</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 14px' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: monitoringActive ? 'var(--mint-deep)' : 'var(--sage-deep)', animation: monitoringActive ? 'pulse 2s infinite' : 'none' }}/>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>
            {!healthy ? 'API unreachable' : monitoringActive ? 'Monitoring active' : 'Monitoring idle'}
          </span>
        </div>
      </div>
    </Card>
  )
}

// ─── AI Executive Summary ──────────────────────────────────────────────
function AIExecutiveSummary({ insights }) {
  const risk = insights?.risk_level || 'UNKNOWN'
  const tone = RISK_TONE[risk] || RISK_TONE.UNKNOWN

  return (
    <Card style={{ height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionHeader title="AI Executive Summary" subtitle="Plain-language read of current system state" dot="var(--peach)"/>
        <span style={{ background: tone.bg, color: tone.fg, borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>{risk} RISK</span>
      </div>

      {!insights
        ? <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>No summary available yet — start monitoring to generate AI insights.</div>
        : <>
            <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, marginBottom: 14 }}>{insights.summary}</p>
            {insights.key_findings?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                {insights.key_findings.slice(0, 3).map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: tone.fg, marginTop: 6, flexShrink: 0 }}/>
                    {f}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 10 }}>Updated {fmtT(insights.timestamp)}</div>
          </>
      }
    </Card>
  )
}

// ─── Health Overview (compact KPI, not the full gauge/breakdown) ───────
function HealthOverview({ health }) {
  const color = health ? (HEALTH_STATUS_COLOR[health.status] || 'var(--lavender-deep)') : 'var(--text-muted)'
  return (
    <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SectionHeader title="Health Overview" subtitle="Composite AI health score" dot="var(--peach)"/>
      {!health
        ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No monitoring cycle has run yet.</div>
        : <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 700, color }}>{Math.round(health.health_score)}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{health.status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginTop: 10, flex: 1 }}>{health.historical_comparison}</div>
            <Link to="/ai/workspace/health-score" style={{ fontSize: 12, fontWeight: 600, color: 'var(--lavender-deep)', textDecoration: 'none', marginTop: 12 }}>View full health analysis →</Link>
          </>
      }
    </Card>
  )
}

// ─── Quick Actions ───────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { to: '/monitoring/processes',        label: 'Processes',            desc: 'Top resource consumers', icon: 'list' },
  { to: '/reports/test-runs',           label: 'Run History',          desc: 'Past monitoring sessions', icon: 'clock' },
  { to: '/ai/workspace/anomalies',      label: 'Anomaly Detection',    desc: 'Isolation Forest inference', icon: 'alert' },
  { to: '/ai/workspace/root-cause',     label: 'Root Cause Analysis',  desc: 'Why anomalies happened', icon: 'search' },
  { to: '/ai/workspace/recommendations',label: 'Recommendations',      desc: 'Prioritized AI advice', icon: 'bulb' },
  { to: '/ai/workspace/trends',         label: 'Trend Analysis',       desc: 'Sustained trends vs spikes', icon: 'trend' },
]

function QuickActions() {
  return (
    <Card>
      <SectionHeader title="Quick Actions" subtitle="Jump into a dedicated workspace" dot="var(--lavender)"/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {QUICK_ACTIONS.map(a => (
          <Link key={a.to} to={a.to} className="quick-action-tile">
            <span className="quick-action-tile__icon"><NavIcon name={a.icon} /></span>
            <span>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{a.desc}</div>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

// ─── Recent Activity ──────────────────────────────────────────────────────
function RecentActivity({ timeline }) {
  const items = (timeline || []).filter(e => e.event_type !== 'metric').slice(0, 6)
  return (
    <Card style={{ height: '100%' }}>
      <SectionHeader title="Recent Activity" subtitle="Latest AI-observed system events" dot="var(--lavender)"/>
      {items.length === 0
        ? <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>No activity recorded yet.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${severityColor(e.severity)}` }}>
                <span style={{ color: severityColor(e.severity), flexShrink: 0, marginTop: 1, width: 16, height: 16 }}>
                  <NavIcon name={ACTIVITY_ICON[e.event_type] || 'radar'} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{e.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtT(e.timestamp)}</span>
              </div>
            ))}
          </div>
      }
    </Card>
  )
}

// ─── AI Overview Card ──────────────────────────────────────────────────────
function AIOverviewCard({ aiStats }) {
  const items = [
    { label: 'Total Detected', val: aiStats?.total_anomalies ?? '—', color: 'var(--lavender-deep)' },
    { label: 'Critical',       val: aiStats?.critical_count  ?? '—', color: 'var(--rose-deep)' },
    { label: 'High',           val: aiStats?.high_count      ?? '—', color: 'var(--coral-deep)' },
    { label: 'Avg Confidence', val: aiStats ? `${fmt(aiStats.avg_confidence)}%` : '—', color: 'var(--mint-deep)' },
  ]
  return (
    <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SectionHeader title="AI Overview" subtitle="Isolation Forest engine at a glance" dot="var(--peach)"/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
        {items.map(({ label, val, color }) => (
          <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600, color }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: aiStats?.model_trained ? 'var(--mint-deep)' : 'var(--peach-deep)', animation: aiStats?.model_trained ? 'pulse 2s infinite' : 'none' }}/>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {aiStats?.model_trained ? `Trained · ${aiStats?.total_predictions ?? 0} predictions` : 'Model not yet trained'}
        </span>
      </div>
      <Link to="/ai/workspace/anomalies" style={{ fontSize: 12, fontWeight: 600, color: 'var(--lavender-deep)', textDecoration: 'none', marginTop: 'auto' }}>Open Anomaly Detection →</Link>
    </Card>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────
export default function Overview() {
  const { healthy, status, insights, health, aiStats, timeline } = useSystemStatus()

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <WelcomeSection healthy={healthy} monitoringActive={status.monitoring === 'active'} todayLabel={todayLabel}/>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }} className="responsive-2fr-1fr">
        <AIExecutiveSummary insights={insights}/>
        <HealthOverview health={health}/>
      </div>

      <QuickActions/>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }} className="responsive-2fr-1fr">
        <RecentActivity timeline={timeline}/>
        <AIOverviewCard aiStats={aiStats}/>
      </div>
    </div>
  )
}