// ─────────────────────────────────────────────────────────────────────────
// Pure client-side export helpers. Everything here operates on data the
// dashboard already has in memory (from its normal polling of existing
// FastAPI endpoints) — no new backend routes, no server-side file access.
// This intentionally exports "what's currently visible in this session",
// not the full server-side CSV history (system_metrics.csv etc.), which
// isn't served over HTTP by the backend.
// ─────────────────────────────────────────────────────────────────────────

function toCSV(rows) {
  if (!rows || rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = v => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','))
  return lines.join('\n')
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadCSV(rows, filename) {
  if (!rows || rows.length === 0) return false
  download(toCSV(rows), filename, 'text/csv;charset=utf-8;')
  return true
}

export function downloadJSON(data, filename) {
  if (!data) return false
  download(JSON.stringify(data, null, 2), filename, 'application/json;charset=utf-8;')
  return true
}

export function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}