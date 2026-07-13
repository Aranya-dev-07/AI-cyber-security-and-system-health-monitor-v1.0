import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './layouts/AppShell'
import AIWorkspace from './layouts/AIWorkspace'
import MonitoringWorkspace from './layouts/MonitoringWorkspace'
import ReportsWorkspace from './layouts/ReportsWorkspace'
import SettingsWorkspace from './layouts/SettingsWorkspace'
import Overview from './pages/Overview'
import Anomalies from './pages/ai/Anomalies'
import RootCause from './pages/ai/RootCause'
import HealthScore from './pages/ai/HealthScore'
import Trends from './pages/ai/Trends'
import Predictive from './pages/ai/Predictive'
import Recommendations from './pages/ai/Recommendations'
import LiveMetrics from './pages/monitoring/LiveMetrics'
import ProcessMonitoring from './pages/monitoring/ProcessMonitoring'
import Graphs from './pages/monitoring/Graphs'
import Controls from './pages/monitoring/Controls'
import TestRuns from './pages/reports/TestRuns'
import AIReports from './pages/reports/AIReports'
import Export from './pages/reports/Export'
import SettingsMonitoring from './pages/settings/Monitoring'
import SettingsAIEngine from './pages/settings/AIEngine'
import AlertPolicy from './pages/settings/AlertPolicy'
import SettingsWorkspacePrefs from './pages/settings/Workspace'
import SettingsDatabase from './pages/settings/Database'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />

        {/* Monitoring Workspace (Phase 4) */}
        <Route path="monitoring" element={<MonitoringWorkspace />}>
          <Route index element={<Navigate to="live-metrics" replace />} />
          <Route path="live-metrics" element={<LiveMetrics />} />
          <Route path="processes" element={<ProcessMonitoring />} />
          <Route path="graphs" element={<Graphs />} />
          <Route path="controls" element={<Controls />} />
        </Route>

        {/* Trinetra AI Workspace (Phase 3, extended in Phase 5) */}
        <Route path="ai/workspace" element={<AIWorkspace />}>
          <Route index element={<Navigate to="anomalies" replace />} />
          <Route path="anomalies" element={<Anomalies />} />
          <Route path="root-cause" element={<RootCause />} />
          <Route path="health-score" element={<HealthScore />} />
          <Route path="trends" element={<Trends />} />
          <Route path="predictive" element={<Predictive />} />
          <Route path="recommendations" element={<Recommendations />} />
        </Route>

        {/* Reports Workspace (Phase 6) — replaces the old flat /runs route */}
        <Route path="reports" element={<ReportsWorkspace />}>
          <Route index element={<Navigate to="test-runs" replace />} />
          <Route path="test-runs" element={<TestRuns />} />
          <Route path="ai-reports" element={<AIReports />} />
          <Route path="export" element={<Export />} />
        </Route>

        {/* Settings Workspace (Phase 6) */}
        <Route path="settings" element={<SettingsWorkspace />}>
          <Route index element={<Navigate to="monitoring" replace />} />
          <Route path="monitoring" element={<SettingsMonitoring />} />
          <Route path="ai-engine" element={<SettingsAIEngine />} />
          <Route path="alert-policy" element={<AlertPolicy />} />
          <Route path="workspace" element={<SettingsWorkspacePrefs />} />
          <Route path="database" element={<SettingsDatabase />} />
        </Route>
      </Route>
    </Routes>
  )
}