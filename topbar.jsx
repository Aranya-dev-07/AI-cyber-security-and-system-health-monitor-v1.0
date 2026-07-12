import { useLocation } from 'react-router-dom'
import { useSystemStatus } from '../context/SystemStatusContext'
import { StatusPill, LiveClock } from './ui'

const PAGE_TITLES = {
  '/': ['Overview', 'Executive summary of system status'],
  '/processes': ['Processes', 'Top resource-consuming processes'],
  '/runs': ['Run History', 'Past monitoring sessions'],
  '/ai/anomalies': ['Anomaly Detection', 'Isolation Forest · real-time inference'],
  '/ai/root-cause': ['Root Cause Analysis', 'Explainable AI · why the anomaly happened'],
  '/ai/health-score': ['Health Score', 'Explainable AI · weighted composite score'],
  '/ai/recommendations': ['Recommendations', 'Explainable AI · prioritized advice'],
  '/ai/trends': ['Trend Analysis', 'Sustained trends vs. temporary spikes'],
  '/ai/predictive': ['Predictive Alerts', 'Forecasted issues, not yet occurred'],
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