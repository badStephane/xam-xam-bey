import { useApp } from '../../AppContext'
import type { Screen } from '../../lib/params'

const CHIPS: ReadonlyArray<readonly [Screen, string]> = [['progression', 'PROGRESSION'], ['ligue', 'LIGUE'], ['badges', 'BADGES']]

/** Puces du groupe PROGRÈS (16-design §1), en tête de Progression, Ligue et Badges. Chaque changement crée une entrée d'historique. */
export function ProgressChips() {
  const { ui, go } = useApp()
  return (
    <nav className="chips progress-chips" aria-label="Progrès">
      {CHIPS.map(([s, label]) => (
        <button key={s} className="chip" onClick={() => go(s)} aria-current={ui.screen === s ? 'page' : undefined}>{label}</button>
      ))}
    </nav>
  )
}
