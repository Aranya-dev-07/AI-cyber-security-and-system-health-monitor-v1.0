import { Routes, Route } from 'react-router-dom'
import AppShell from './layouts/AppShell'
import Overview from './pages/Overview'
import Processes from './pages/Processes'
import Runs from './pages/Runs'
import Anomalies from './pages/ai/Anomalies'
import RootCause from './pages/ai/RootCause'
import HealthScore from './pages/ai/HealthScore'
import Recommendations from './pages/ai/Recommendations'
import Trends from './pages/ai/Trends'
import Predictive from './pages/ai/Predictive'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="processes" element={<Processes />} />
        <Route path="runs" element={<Runs />} />
        <Route path="ai/anomalies" element={<Anomalies />} />
        <Route path="ai/root-cause" element={<RootCause />} />
        <Route path="ai/health-score" element={<HealthScore />} />
        <Route path="ai/recommendations" element={<Recommendations />} />
        <Route path="ai/trends" element={<Trends />} />
        <Route path="ai/predictive" element={<Predictive />} />
      </Route>
    </Routes>
  )
}