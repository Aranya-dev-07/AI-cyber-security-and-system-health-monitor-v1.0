import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import axios from 'axios'

// ─────────────────────────────────────────────────────────────────────────
// SystemStatusContext
// ─────────────────────────────────────────────────────────────────────────
// Single centralized polling loop for the whole app. Every page (Overview,
// Processes, Runs, the six AI pages) and the sidebar footer all read from
// this one context instead of each making their own axios calls — this
// avoids duplicate polling per route and gives the sidebar footer's status
// indicators (API / Database / Monitoring / AI Engine / AI Model) a single
// source of truth that updates live from backend responses.
//
// No backend endpoints were added or changed. Each status indicator is
// derived purely from the success/shape of the *existing* endpoints:
//   API        -> GET /health succeeds
//   Database   -> GET /processes + GET /runs succeed (both read from SQLite
//                 / in-memory state populated by the DB-backed pipeline)
//   Monitoring -> GET /metrics succeeds (200) vs 404s (monitoring not started)
//   AI Engine  -> GET /ai/statistics succeeds
//   AI Model   -> /ai/statistics.model_trained
// Version / Build are static app metadata (no backend endpoint exists for
// these), matching the version already declared in api.py's FastAPI app.
// ─────────────────────────────────────────────────────────────────────────

const API = ''
const POLL_MS = 5000
const MAX_HIST = 40

const fmtT = iso => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const SystemStatusContext = createContext(null)

export function SystemStatusProvider({ children }) {
  const [metric, setMetric] = useState(null)
  const [procs, setProcs] = useState([])
  const [runs, setRuns] = useState([])
  const [history, setHistory] = useState([])
  const [healthy, setHealthy] = useState(false)
  const [lastPoll, setLastPoll] = useState(null)
  const [error, setError] = useState(null)

  const [aiStats, setAiStats] = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const [rca, setRca] = useState(null)
  const [health, setHealth] = useState(null)
  const [trendAnalysis, setTrendAnalysis] = useState([])
  const [predictiveAlerts, setPredictiveAlerts] = useState([])
  const [smartRecs, setSmartRecs] = useState([])
  const [insights, setInsights] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [summary, setSummary] = useState(null)

  // null = unknown (not polled yet), otherwise boolean
  const [dbOnline, setDbOnline] = useState(null)
  const [monitoringActive, setMonitoringActive] = useState(null)
  const [aiEngineOnline, setAiEngineOnline] = useState(null)

  const histRef = useRef([])

  const poll = useCallback(async () => {
    try {
      await axios.get(`${API}/health`)
      setHealthy(true)
      setError(null)
    } catch {
      setHealthy(false)
      setDbOnline(false)
      setAiEngineOnline(false)
      setMonitoringActive(false)
      setError('Cannot reach the API — is main.py running?')
      return
    }

    // Live metrics — 404 means monitoring simply hasn't been started yet,
    // which is expected and not a connectivity problem.
    try {
      const mRes = await axios.get(`${API}/metrics`)
      const m = mRes.data
      setMetric(m)
      const point = {
        t: fmtT(m.timestamp),
        cpu: m.cpu_percent,
        ram: m.ram_percent,
        disk: m.disk_percent,
        net: parseFloat((m.net_sent_mb + m.net_recv_mb).toFixed(3)),
      }
      histRef.current = [...histRef.current.slice(-(MAX_HIST - 1)), point]
      setHistory([...histRef.current])
      setMonitoringActive(true)
      setError(null)
    } catch (e) {
      setMonitoringActive(false)
      if (e.response?.status === 404) {
        setError('Monitoring not started yet — type  start  in the terminal.')
      }
    }

    // Processes + run history — both backed by the SQLite/in-memory layer.
    try {
      const [pRes, rRes] = await Promise.all([
        axios.get(`${API}/processes`),
        axios.get(`${API}/runs?limit=10`),
      ])
      setProcs(pRes.data)
      setRuns(rRes.data)
      setDbOnline(true)
    } catch {
      setDbOnline(false)
    }

    // Core AI engine (Isolation Forest anomaly detection).
    try {
      const [sRes, aRes] = await Promise.all([
        axios.get(`${API}/ai/statistics`),
        axios.get(`${API}/ai/latest?limit=5`),
      ])
      setAiStats(sRes.data)
      setAnomalies(aRes.data)
      setAiEngineOnline(true)
    } catch {
      setAiEngineOnline(false)
    }

    // Explainable AI sub-engines — each soft-fails independently since
    // most return 404 until enough data/an anomaly has occurred.
    try { setRca((await axios.get(`${API}/ai/rca`)).data) } catch { /* no anomaly analyzed yet */ }
    try { setHealth((await axios.get(`${API}/ai/health-score`)).data) } catch { /* no cycle yet */ }
    try { setTrendAnalysis((await axios.get(`${API}/ai/trend-analysis`)).data) } catch { /* not enough data yet */ }
    try { setPredictiveAlerts((await axios.get(`${API}/ai/predictive-alerts`)).data) } catch { /* not available yet */ }
    try { setSmartRecs((await axios.get(`${API}/ai/smart-recommendations`)).data) } catch { /* not available yet */ }

    // AI Executive Summary (natural-language) + system event timeline —
    // both already existed as endpoints in api.py, just not previously
    // consumed by any page. Used by the Overview landing page (phase 2).
    try { setInsights((await axios.get(`${API}/ai/insights`)).data) } catch { /* not available yet */ }
    try { setTimeline((await axios.get(`${API}/ai/timeline?limit=20`)).data) } catch { /* not available yet */ }

    // Run summary — used by the Monitoring Workspace's Controls tab.
    // Existing /summary endpoint (config.generate_run_summary), 404s until
    // a run has produced at least one metric.
    try { setSummary((await axios.get(`${API}/summary`)).data) } catch { setSummary(null) }

    setLastPoll(new Date())
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  const status = {
    api: healthy ? 'online' : 'offline',
    database: dbOnline === null ? 'unknown' : dbOnline ? 'connected' : 'unreachable',
    monitoring: monitoringActive === null ? 'unknown' : monitoringActive ? 'active' : 'idle',
    aiEngine: aiEngineOnline === null ? 'unknown' : aiEngineOnline ? 'online' : 'offline',
    aiModel: aiStats?.model_trained ? 'trained' : aiStats ? 'training' : 'unknown',
  }

  const value = {
    metric, procs, runs, history, healthy, lastPoll, error,
    aiStats, anomalies, rca, health, trendAnalysis, predictiveAlerts, smartRecs,
    insights, timeline, summary,
    status,
  }

  return <SystemStatusContext.Provider value={value}>{children}</SystemStatusContext.Provider>
}

export function useSystemStatus() {
  const ctx = useContext(SystemStatusContext)
  if (!ctx) throw new Error('useSystemStatus must be used within a SystemStatusProvider')
  return ctx
}