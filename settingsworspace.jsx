import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NavIcon } from '../components/icons'

// ─────────────────────────────────────────────────────────────────────────
// Settings Workspace (Phase 6)
// Same shell pattern as the other workspaces. Four of the five tabs are
// deliberately READ-ONLY reference/status panels: this backend's API is
// documented as read-only (see api.py) and none of its config is exposed
// through a live, writable endpoint, so nothing here fakes an interactive
// control that doesn't actually do anything server-side. The one genuinely
// interactive tab is "Workspace" — pure frontend UI preferences stored in
// the browser (localStorage), which never touches the backend at all.
// ─────────────────────────────────────────────────────────────────────────

const TABS = [
  { to: 'monitoring',   label: 'Monitoring',   desc: 'Collection thresholds & interval', icon: 'activity' },
  { to: 'ai-engine',    label: 'AI Engine',     desc: 'Isolation Forest configuration',   icon: 'gauge' },
  { to: 'alert-policy', label: 'Alert Policy',  desc: 'How alerts & severity are decided', icon: 'alert' },
  { to: 'workspace',    label: 'Workspace',     desc: 'Local UI preferences',             icon: 'layers' },
  { to: 'database',     label: 'Database',      desc: 'Storage engine & schema',           icon: 'list' },
]

export default function SettingsWorkspace() {
  const location = useLocation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="ai-workspace-header">
        <div className="ai-workspace-header__icon" style={{ background: 'var(--lavender)', color: 'var(--lavender-deep)' }}>
          <NavIcon name="gear" />
        </div>
        <div>
          <div className="ai-workspace-header__eyebrow">Settings Workspace</div>
          <div className="ai-workspace-header__desc">System configuration reference &amp; local workspace preferences</div>
        </div>
      </div>

      <nav className="ai-workspace-tabs" aria-label="Settings workspace sections">
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