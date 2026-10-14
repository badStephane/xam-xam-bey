import type { Card, Doc } from './types'

/**
 * Documents cités par les cartes d'une zone (lot 4, F2) : cartes publiées reliées à un document,
 * sans doublon, documents absents du catalogue ignorés, triés par titre (ordre français, sans tenir compte de la casse).
 */
export function citedDocs(cards: readonly Card[], docById: (id: number) => Doc | null): Doc[] {
  const ids = [...new Set(cards.map(c => c.doc).filter((id): id is number => typeof id === 'number'))]
  const docs = ids.map(docById).filter((d): d is Doc => d !== null)
  return [...docs].sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }) || a.id - b.id)
}
