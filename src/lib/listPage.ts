/** Longues listes admin (665 questions possibles) : affichage par pages de 50, sans recharger. */
export const LIST_PAGE_SIZE = 50

export const nextLimit = (limit: number, total: number, size: number = LIST_PAGE_SIZE): number => Math.min(total, limit + size)

/** Libellé du bouton « Afficher plus », vide quand tout est affiché. */
export function moreLabel(limit: number, total: number, size: number = LIST_PAGE_SIZE): string {
  const left = total - limit
  if (left <= 0) return ''
  if (left === 1) return 'Afficher la dernière'
  if (left <= size) return `Afficher les ${left} dernières`
  return `Afficher ${size} de plus (${left} restantes)`
}
