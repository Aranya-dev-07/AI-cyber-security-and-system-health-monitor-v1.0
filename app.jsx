import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './layouts/AppShell'
import AIWorkspace from './layouts/AIWorkspace'
import MonitoringWorkspace from './layouts/MonitoringWorkspace'
import Overview from './pages/Overview'
import Runs from './pages/Runs'
import Anomalies from './pages/ai/Anomalies'
import RootCause from './pages/ai/RootCause'
import HealthScore from './pages/ai/HealthScore'
import Recommendations from './pages/ai/Recommendations'
import Trends from './pages/ai/Trends'
import Predictive from './pages/ai/Predictive'
import LiveMetrics from './pages/monitoring/LiveMetrics'
import ProcessMonitoring from './pages/monitoring/ProcessMonitoring'
import Graphs from './pages/monitoring/Graphs'
import Controls from './pages/monitoring/Controls'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="runs" element={<Runs />} />
        <Route path="ai/anomalies" element={<Anomalies />} />

        {/* Monitoring Workspace (Phase 4) — Live Metrics, Process Monitoring,
            Graphs, Controls, sharing one local nav. Replaces the old flat
            /processes route. */}
        <Route path="monitoring" element={<MonitoringWorkspace />}>
          <Route index element={<Navigate to="live-metrics" replace />} />
          <Route path="live-metrics" element={<LiveMetrics />} />
          <Route path="processes" element={<ProcessMonitoring />} />
          <Route path="graphs" element={<Graphs />} />
          <Route path="controls" element={<Controls />} />
        </Route>

        {/* Trinetra AI Workspace (Phase 3) — Health Score, Root Cause,
            Recommendations, sharing one local nav. Defaults to Health Score. */}
        <Route path="ai/workspace" element={<AIWorkspace />}>
          <Route index element={<Navigate to="health-score" replace />} />
          <Route path="health-score" element={<HealthScore />} />
          <Route path="root-cause" element={<RootCause />} />
          <Route path="recommendations" element={<Recommendations />} />
        </Route>

        <Route path="ai/trends" element={<Trends />} />
        <Route path="ai/predictive" element={<Predictive />} />
      </Route>
    </Routes>
  )
}