import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'

const COLLAPSE_KEY = 'shm_sidebar_collapsed'

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  // Close the mobile drawer automatically whenever the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className={`shell ${collapsed ? 'shell--collapsed' : ''}`}>
      {mobileOpen && <div className="shell__scrim" onClick={() => setMobileOpen(false)} />}

      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
        mobileOpen={mobileOpen}
      />

      <div className="shell__body">
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <main className="shell__workspace">
          {/* key={pathname} restarts the fade-in animation on every route change */}
          <div key={location.pathname} className="workspace-fade">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}