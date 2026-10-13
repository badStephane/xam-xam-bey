import { memo } from 'react'
import { TYPE_COLOR } from '../../lib/constants'
import { mo } from '../../lib/format'
import { openMode } from '../../lib/openMode'
import type { Doc } from '../../lib/types'

export interface DocCardProps {
  d: Doc
  seen: boolean
  selected: boolean
  mobile: boolean
  /** Réseau coupé (navigateur hors ligne, ou base injoignable constatée). */
  offline: boolean
  /** PDF gardé sur l'appareil par le service worker. */
  kept: boolean
  onOpen(id: number): void
  /** Ouverture dans le lecteur du téléphone : marque la pièce consultée et, si possible, la fait garder hors ligne. */
  onNative(d: Doc): void
}

/**
 * Fiche d'une pièce. Mémoïsée et sans contexte (audit 23) : une frappe dans la recherche ne redessine que les fiches
 * dont les propriétés changent, et non les 170.
 */
export const DocCard = memo(function DocCard({ d, seen, selected, mobile, offline, kept, onOpen, onNative }: DocCardProps) {
  const mode = openMode({ mobile, offline, kept })
  // Hors réseau, « consultée » ne veut pas dire « gardée » (FE-6, D5) : aucune pièce n'est grisée selon cet indicateur.
  const cls = ['sheet', 'punch', 'doc', selected && !mobile ? 'sel' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <div className="doc-top">
        <span className="cote">{d.cote}</span>
        <span className="row" style={{ gap: 6 }}>
          {d.ess && <span className="tag-ess">★ ESSENTIEL</span>}
          {d.scan && <span className="tag-scan" title="PDF numérisé, texte non sélectionnable">SCAN</span>}
          {kept && <span className="tag-off" title="Gardé sur cet appareil : lisible sans réseau">HORS LIGNE</span>}
          {seen && <span className="tag-ess" style={{ color: 'var(--green)' }} title="Déjà consultée">✓</span>}
        </span>
      </div>
      <span className="d-title">{d.title}</span>
      <div className="doc-bot">
        <span className="d-meta"><b style={{ color: TYPE_COLOR[d.ty] }}>{d.ty}</b> · {d.pages ? `${d.pages} P. · ` : ''}{mo(d.size)} MO · {d.folder.toUpperCase()}</span>
        {mode === 'native' && (
          // Téléphone en ligne : le lecteur PDF du téléphone (nouvel onglet), choix de l'utilisateur (commit 40da947).
          <a className="ink-btn" href={d.file} target="_blank" rel="noopener" onClick={() => onNative(d)} aria-label={`Ouvrir ${d.title} dans un nouvel onglet`}>Ouvrir ↗</a>
        )}
        {mode === 'inApp' && <button className="ink-btn" onClick={() => onOpen(d.id)} aria-label={`Ouvrir ${d.title}`}>Ouvrir</button>}
        {mode === 'unavailable' && <span className="doc-off">Hors réseau : pas encore ouvert sur cet appareil</span>}
      </div>
    </div>
  )
})
