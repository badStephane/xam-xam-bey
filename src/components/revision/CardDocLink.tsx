import type { MouseEvent } from 'react'
import { useApp } from '../../AppContext'
import type { Card } from '../../lib/types'

/**
 * Lien vers le document de la bibliothèque relié à une carte (E4). Rien si la carte n'a pas de document
 * ou si ce document n'est pas (ou plus) dans le catalogue. La séance n'est jamais perdue : RETOUR y ramène.
 */
export function CardDocLink({ card }: { card: Card }) {
  const { docById, openCardDoc } = useApp()
  const d = card.doc ? docById(card.doc) : null
  if (!d) return null
  const open = (e: MouseEvent) => { e.preventDefault(); openCardDoc(d.id) }
  return (
    <a className="ink-line" href={`#apercu/${d.id}`} onClick={open} aria-label={`Ouvrir le document : ${d.title}`} style={{ alignSelf: 'flex-start' }}>
      Ouvrir le document
    </a>
  )
}
