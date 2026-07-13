import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NavIcon } from '../components/icons'

// ─────────────────────────────────────────────────────────────────────────
// Trinetra AI Workspace (Phase 3, extended in Phase 5)
// A self-contained workspace with its own local navigation panel for all
// six explainable-AI features. Switching between them happens entirely
// through the tab strip below — the global sidebar (Sidebar.jsx) only ever
// shows a single "AI Workspace" entry and is never re-highlighted as the
// user moves between tabs.
//
// Reuses the existing Anomalies / RootCause / HealthScore / Trends /
// Predictive / Recommendations page components as-is (rendered via nested
// routes below) — no AI logic here or in those pages, presentation only.
//
// Tab order follows the natural investigation flow: detect → explain →
// score impact → see the pattern over time → forecast what's next → act.
// ─────────────────────────────────────────────────────────────────────────

const TABS = [
  { to: 'anomalies',       label: 'Anomaly Detection',    desc: 'Isolation Forest · real-time',     icon: 'alert' },
  { to: 'root-cause',      label: 'Root Cause Analysis',  desc: 'Why the anomaly happened',         icon: 'search' },
  { to: 'health-score',    label: 'AI Health Score',      desc: 'Weighted composite score',         icon: 'gauge' },
  { to: 'trends',          label: 'Trend Analysis',       desc: 'Sustained trends vs. spikes',      icon: 'trend' },
  { to: 'predictive',      label: 'Predictive Alerts',    desc: 'Forecasted, not yet occurred',     icon: 'radar' },
  { to: 'recommendations', label: 'AI Recommendations',   desc: 'Prioritized, explainable advice',  icon: 'bulb' },
]

export default function AIWorkspace() {
  const location = useLocation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="ai-workspace-header">
        <div className="ai-workspace-header__icon"><NavIcon name="layers" /></div>
        <div>
          <div className="ai-workspace-header__eyebrow">Trinetra AI Workspace</div>
          <div className="ai-workspace-header__desc">
            Explainable AI · detection, root cause, health scoring, trends, predictions & recommendations
          </div>
        </div>
      </div>

      <nav className="ai-workspace-tabs" aria-label="AI workspace sections">
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => `ai-workspace-tab ${isActive ? 'ai-workspace-tab--active' : ''}`}
          >
            <span className="ai-workspace-tab__icon"><NavIcon name={t.icon} /></span>
            <span>
              <div className="ai-workspace-tab__label">{t.label}</div>
              <div className="ai-workspace-tab__desc">{t.desc}</div>
            </span>
          </NavLink>
        ))}
      </nav>

      {/* key restarts the fade-in whenever the active tab changes */}
      <div key={location.pathname} className="workspace-fade">
        <Outlet />
      </div>
    </div>
  )
}