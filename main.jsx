import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { SystemStatusProvider } from './context/SystemStatusContext'
import './index.css'

// NOTE: HashRouter is used deliberately (not BrowserRouter). The FastAPI
// side (dashboard.py) only serves index.html at the exact paths
// "/dashboard" and "/dashboard/" — it has no catch-all route for
// sub-paths like "/dashboard/processes". HashRouter keeps every route
// after a "#" (e.g. /dashboard/#/processes), which never leaves the
// browser, so client-side routing, deep links, and page refreshes all
// work correctly without any backend changes.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <SystemStatusProvider>
        <App />
      </SystemStatusProvider>
    </HashRouter>
  </React.StrictMode>
)