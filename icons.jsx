// Small, dependency-free stroke icon set for the sidebar nav.
// Deliberately minimal (no icon library added) to avoid introducing new
// npm dependencies beyond react-router-dom, which routing requires.
const PATHS = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </>
  ),
  list: (
    <>
      <line x1="4" y1="6" x2="20" y2="6"/>
      <line x1="4" y1="12" x2="20" y2="12"/>
      <line x1="4" y1="18" x2="20" y2="18"/>
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5"/>
      <path d="M12 7.5v5l3.5 2"/>
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21 19.5H3Z"/>
      <line x1="12" y1="9.5" x2="12" y2="14"/>
      <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none"/>
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5"/>
      <line x1="15.5" y1="15.5" x2="20.5" y2="20.5"/>
    </>
  ),
  gauge: (
    <>
      <path d="M4 15a8 8 0 1 1 16 0"/>
      <line x1="12" y1="15" x2="15.5" y2="10.5"/>
      <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/>
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4"/>
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 .9 1 1.6h5c0-.7.4-1.15 1-1.6A6 6 0 0 0 12 3Z"/>
    </>
  ),
  trend: (
    <>
      <polyline points="4,17 10,11 14,15 20,7"/>
      <polyline points="14,7 20,7 20,13"/>
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="5"/>
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
      <line x1="12" y1="12" x2="18" y2="7"/>
    </>
  ),
  layers: (
    <>
      <polygon points="12,3 21,8 12,13 3,8"/>
      <polyline points="3,13 12,18 21,13"/>
      <polyline points="3,17.5 12,22.5 21,17.5"/>
    </>
  ),
}

export function NavIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name] || PATHS.grid}
    </svg>
  )
}