import { useApp } from '../AppContext'
import { PROGRESS_SCREENS, type Screen } from '../lib/params'

const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const Book = () => <svg {...ICON}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5M8 7h7M8 11h7" /></svg>
const Today = () => <svg {...ICON}><rect x="4" y="5" width="16" height="15" rx="1" /><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4" /></svg>
const Route = () => <svg {...ICON}><path d="M6 19c0-4 4-4 6-7s6-3 6-7" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /></svg>
const Sheet = () => <svg {...ICON}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></svg>
const Chart = () => <svg {...ICON}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>

const ITEMS: Array<[Screen, string, () => JSX.Element]> = [
  ['bibliotheque', 'BIBLIOTHÈQUE', Book], ['revision', 'AUJOURD’HUI', Today], ['plan', 'PLAN', Route], ['fiches', 'FICHES', Sheet], ['progression', 'PROGRÈS', Chart],
]

/** Navigation principale sur téléphone, dans la zone du pouce (masquée en session, en bilan et en aperçu). */
export function BottomNav() {
  const { ui, go } = useApp()
  const active = (s: Screen) => ui.screen === s || (s === 'revision' && ['acces', 'horsligne'].includes(ui.screen))
    || (s === 'progression' && PROGRESS_SCREENS.includes(ui.screen))
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {ITEMS.map(([screen, label, Icon]) => (
        <button key={screen} onClick={() => go(screen, screen === 'revision' ? { session: null } : {})} aria-current={active(screen) ? 'page' : undefined}>
          <Icon />{label}
        </button>
      ))}
    </nav>
  )
}
