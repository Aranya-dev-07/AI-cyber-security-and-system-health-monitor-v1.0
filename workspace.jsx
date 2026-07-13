import { useEffect, useState } from 'react'
import { Card, SectionHeader, Toggle } from '../../components/ui'
import { COLLAPSE_EVENT } from '../../layouts/AppShell'

const COLLAPSE_KEY = 'shm_sidebar_collapsed'
const MOTION_KEY = 'shm_reduce_motion'

// The only genuinely interactive settings page — everything here is a
// browser-local UI preference (localStorage), never sent to the backend.

export default function SettingsWorkspacePrefs() {
  const [collapsed, setCollapsedLocal] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem(MOTION_KEY) === '1')
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    document.body.classList.toggle('reduce-motion', reduceMotion)
  }, [reduceMotion])

  function flashSaved() {
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1200)
  }

  function toggleCollapsed(next) {
    setCollapsedLocal(next)
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    window.dispatchEvent(new CustomEvent(COLLAPSE_EVENT, { detail: next }))
    flashSaved()
  }

  function toggleMotion(next) {
    setReduceMotion(next)
    localStorage.setItem(MOTION_KEY, next ? '1' : '0')
    flashSaved()
  }

  function resetAll() {
    localStorage.removeItem(COLLAPSE_KEY)
    localStorage.removeItem(MOTION_KEY)
    toggleCollapsed(false)
    toggleMotion(false)
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <SectionHeader title="Workspace" subtitle="Local UI preferences, stored in this browser only" dot="var(--lavender)"/>
        {savedFlash && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mint-deep)' }}>Saved ✓</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Toggle
          checked={collapsed}
          onChange={toggleCollapsed}
          label="Sidebar starts collapsed"
          desc="Applies immediately — try the sidebar on the left"
        />
        <div style={{ borderTop: '1px solid var(--border)' }}/>
        <Toggle
          checked={reduceMotion}
          onChange={toggleMotion}
          label="Reduce motion"
          desc="Disables fade-ins, pulses, and hover transitions across the dashboard"
        />
      </div>

      <button
        onClick={resetAll}
        style={{
          marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
          padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          background: 'var(--surface-2)', color: 'var(--rose-deep)', cursor: 'pointer',
        }}
      >
        Reset to defaults
      </button>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.6 }}>
        These preferences live only in this browser's local storage — they don't touch the backend
        and won't follow you to a different browser or device.
      </div>
    </Card>
  )
}