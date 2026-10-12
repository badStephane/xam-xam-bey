import { useApp } from '../../AppContext'
import { YEAR0, ZONES } from '../../lib/constants'
import { p2, plural, zoneColor } from '../../lib/format'

export function ZoneRoute({ counts }: { counts: Record<number, number> }) {
  const { ui, mobile, cur, patch } = useApp()
  return (
    <div className="col g8">
      <span className="lbl" style={{ letterSpacing: '.1em' }}>ITINÉRAIRE {YEAR0} · {YEAR0 + 1} · TOUCHEZ UNE ZONE POUR FILTRER</span>
      <div className={`route${mobile ? ' m' : ''}`} role="group" aria-label="Zones mensuelles">
        {ZONES.map(([abbr, month, theme], i) => {
          const n = i + 1
          const c = counts[n] || 0
          return (
            <button key={n} className={`stop${n === cur ? ' cur' : ''}`} onClick={() => patch({ month: ui.month === n ? null : n })}
              aria-pressed={ui.month === n} aria-label={`Zone ${n}, ${month}, ${theme}, ${plural(c, 'pièce', 'pièces')}`}>
              <span className="pin"><i style={{ background: zoneColor(n) }} /></span>
              <span className="k">{p2(n)} {abbr.toUpperCase()}<br /><small>{c ? `${c} p.` : 'aucune'}</small></span>
              {!mobile && <span className="nm">{theme}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
