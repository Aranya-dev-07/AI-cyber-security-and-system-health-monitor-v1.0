import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NavIcon } from '../components/icons'

// ─────────────────────────────────────────────────────────────────────────
// Reports Workspace (Phase 6)
// Same shell pattern as AIWorkspace / MonitoringWorkspace: one parent
// route + a local tab strip. Test Runs replaces the old standalone
// /runs route. AI Reports and Export are new, and consume only data
// already available from existing endpoints / already polled into
// SystemStatusContext — no backend changes.
// ─────────────────────────────────────────────────────────────────────────

const TABS = [
  { to: 'test-runs', label: 'Test Runs',  desc: 'Past monitoring sessions',      icon: 'clock' },
  { to: 'ai-reports', label: 'AI Reports', desc: 'Executive-style AI digest',     icon: 'file' },
  { to: 'export',     label: 'Export',     desc: 'Download current session data', icon: 'trend' },
]

export default function ReportsWorkspace() {
  const location = useLocation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="ai-workspace-header">
        <div className="ai-workspace-header__icon" style={{ background: 'var(--lavender)', color: 'var(--lavender-deep)' }}>
          <NavIcon name="file" />
        </div>
        <div>
          <div className="ai-workspace-header__eyebrow">Reports Workspace</div>
          <div className="ai-workspace-header__desc">Run history, AI-generated reports, and data export in one place</div>
        </div>
      </div>

      <nav className="ai-workspace-tabs" aria-label="Reports workspace sections">
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