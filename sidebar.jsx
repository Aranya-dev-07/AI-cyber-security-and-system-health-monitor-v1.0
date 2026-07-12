import { NavLink } from 'react-router-dom'
import { NavIcon } from './icons'
import SidebarFooter from './SidebarFooter'

const NAV_GROUPS = [
  {
    label: 'Monitoring',
    items: [
      { to: '/', label: 'Overview', icon: 'grid', end: true },
      { to: '/processes', label: 'Processes', icon: 'list' },
      { to: '/runs', label: 'Run History', icon: 'clock' },
    ],
  },
  {
    label: 'AI Insights',
    accent: true,
    items: [
      { to: '/ai/anomalies', label: 'Anomaly Detection', icon: 'alert' },
      { to: '/ai/workspace', label: 'AI Workspace', icon: 'layers' },
      { to: '/ai/trends', label: 'Trend Analysis', icon: 'trend' },
      { to: '/ai/predictive', label: 'Predictive Alerts', icon: 'radar' },
    ],
  },
]

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen }) {
  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${mobileOpen ? 'sidebar--mobile-open' : ''}`}>
      <div className="sidebar__brand">
        <div className="sidebar__logo">⬡</div>
        {!collapsed && (
          <div>
            <div className="sidebar__title">System Health Monitor</div>
            <div className="sidebar__subtitle">Cybersecurity Platform</div>
          </div>
        )}
      </div>

      <nav className="sidebar__nav">
        {NAV_GROUPS.map(group => (
          <div className="sidebar__group" key={group.label}>
            {!collapsed && (
              <div className={`sidebar__group-label ${group.accent ? 'sidebar__group-label--accent' : ''}`}>
                {group.label}
              </div>
            )}
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span className="sidebar__link-icon"><NavIcon name={item.icon} /></span>
                {!collapsed && <span className="sidebar__link-label">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <button
        className="sidebar__collapse-btn"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
      >
        <span style={{ display: 'inline-block', transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}>‹</span>
        {!collapsed && <span style={{ marginLeft: 8 }}>Collapse</span>}
      </button>

      <SidebarFooter collapsed={collapsed} />
    </aside>
  )
}