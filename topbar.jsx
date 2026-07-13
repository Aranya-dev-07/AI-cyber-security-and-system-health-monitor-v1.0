import { useLocation } from 'react-router-dom'
import { useSystemStatus } from '../context/SystemStatusContext'
import { StatusPill, LiveClock } from './ui'

const PAGE_TITLES = {
  '/': ['Overview', 'Executive summary of system status'],
  '/monitoring/live-metrics': ['Monitoring Workspace', 'Live Metrics'],
  '/monitoring/processes': ['Monitoring Workspace', 'Process Monitoring'],
  '/monitoring/graphs': ['Monitoring Workspace', 'Graphs'],
  '/monitoring/controls': ['Monitoring Workspace', 'Controls'],
  '/runs': ['Run History', 'Past monitoring sessions'],
  '/ai/workspace/anomalies': ['Trinetra AI Workspace', 'Anomaly Detection'],
  '/ai/workspace/root-cause': ['Trinetra AI Workspace', 'Root Cause Analysis'],
  '/ai/workspace/health-score': ['Trinetra AI Workspace', 'AI Health Score'],
  '/ai/workspace/trends': ['Trinetra AI Workspace', 'Trend Analysis'],
  '/ai/workspace/predictive': ['Trinetra AI Workspace', 'Predictive Alerts'],
  '/ai/workspace/recommendations': ['Trinetra AI Workspace', 'AI Recommendations'],
}

export default function Topbar({ onOpenMobile }) {
  const location = useLocation()
  const { healthy, lastPoll } = useSystemStatus()
  const [title, subtitle] = PAGE_TITLES[location.pathname] || ['Dashboard', '']

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button className="topbar__menu-btn" onClick={onOpenMobile} aria-label="Open navigation">☰</button>
        <div>
          <div className="topbar__title">{title}</div>
          {subtitle && <div className="topbar__subtitle">{subtitle}</div>}
        </div>
      </div>
      <div className="topbar__right">
        <StatusPill healthy={healthy} />
        <LiveClock />
        {lastPoll && <span className="topbar__updated">updated {lastPoll.toLocaleTimeString()}</span>}
      </div>
    </header>
  )
}