import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NavIcon } from '../components/icons'

// ─────────────────────────────────────────────────────────────────────────
// Monitoring Workspace (Phase 4)
// Same pattern as AIWorkspace.jsx: one parent route + a local tab strip
// for four independent sections. Switching tabs never touches the global
// sidebar, which shows a single "Monitoring Workspace" entry.
// Presentation only — every tab consumes existing FastAPI endpoints
// (/metrics, /processes, /summary) exactly as they already work.
// ─────────────────────────────────────────────────────────────────────────

const TABS = [
  { to: 'live-metrics', label: 'Live Metrics',       desc: 'Real-time gauges & readings',    icon: 'activity' },
  { to: 'processes',    label: 'Process Monitoring',  desc: 'Searchable top-process table',   icon: 'list' },
  { to: 'graphs',       label: 'Graphs',              desc: 'CPU · RAM · Disk · Network',     icon: 'trend' },
  { to: 'controls',     label: 'Controls',            desc: 'Run status & configuration',     icon: 'sliders' },
]

export default function MonitoringWorkspace() {
  const location = useLocation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="ai-workspace-header">
        <div className="ai-workspace-header__icon" style={{ background: 'var(--lavender)', color: 'var(--lavender-deep)' }}>
          <NavIcon name="grid" />
        </div>
        <div>
          <div className="ai-workspace-header__eyebrow">Monitoring Workspace</div>
          <div className="ai-workspace-header__desc">
            Live metrics, process monitoring, graphs, and run controls in one place
          </div>
        </div>
      </div>

      <nav className="ai-workspace-tabs" aria-label="Monitoring workspace sections">
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => `ai-workspace-tab ai-workspace-tab--lavender ${isActive ? 'ai-workspace-tab--active' : ''}`}
          >
            <span className="ai-workspace-tab__icon"><NavIcon name={t.icon} /></span>
            <span>
              <div className="ai-workspace-tab__label">{t.label}</div>
              <div className="ai-workspace-tab__desc">{t.desc}</div>
            </span>
          </NavLink>
        ))}
      </nav>

      <div key={location.pathname} className="workspace-fade">
        <Outlet />
      </div>
    </div>
  )
}