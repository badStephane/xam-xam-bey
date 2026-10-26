import { ACQUIRED_LV } from './constants'
import { shuffle } from './format'
import type { Card, CardProgress, Progress } from './types'

/** Zone choisie pour l'entraînement : 1 à 12, ou 0 pour toutes les zones. */
export const ALL_ZONES = 0

export type Scope = 'all' | 'gaps' | 'new'
export const SCOPES: ReadonlyArray<readonly [Scope, string]> = [['all', 'TOUT'], ['gaps', 'MES LACUNES'], ['new', 'JAMAIS VUES']]

/** Niveau au-delà duquel une carte n'est plus une lacune, même si elle a déjà été ratée (D3). */
export const GAP_MAX_LEVEL = 1

const rate = (p: CardProgress): number => (p[2] ? p[3] / p[2] : 0)

/** Une lacune (D3) : au moins une réponse non réussie (vues > réussites) et un niveau encore bas. */
export function isGap(p: CardProgress | undefined): boolean {
  return !!p && p[2] > p[3] && p[0] <= GAP_MAX_LEVEL
}

/** Lacunes triées de la plus faible à la moins faible (niveau, puis taux de réussite). */
export function gapCards(cards: readonly Card[], prog: Progress): Card[] {
  return cards
    .filter(c => isGap(prog.cards[c.id]))
    .sort((a, b) => {
      const pa = prog.cards[a.id]
      const pb = prog.cards[b.id]
      return pa[0] - pb[0] || rate(pa) - rate(pb)
    })
}

export const inZone = (cards: readonly Card[], zone: number): Card[] => (zone === ALL_ZONES ? cards.slice() : cards.filter(c => c.th === zone))

/** Cartes d'un entraînement : zone (ou toutes), type (tout, lacunes, jamais vues), nombre maximal. */
export function selectCards(cards: readonly Card[], prog: Progress, zone: number, scope: Scope, count: number, rand: () => number = Math.random): Card[] {
  const pool = inZone(cards, zone)
  if (scope === 'gaps') return shuffle(gapCards(pool, prog).slice(0, count), rand)
  if (scope === 'new') return shuffle(pool.filter(c => !prog.cards[c.id]), rand).slice(0, count)
  return shuffle(pool, rand).slice(0, count)
}

export interface ZoneReport { zone: number; cards: number; seen: number; acquired: number; gaps: number; rate: number | null }

/** Bilan par zone : cartes vues, acquises (niveau ACQUIRED_LV ou plus), lacunes, taux de réussite sur l'ensemble des réponses. */
export function zoneReport(cards: readonly Card[], prog: Progress, zone: number): ZoneReport {
  const list = inZone(cards, zone)
  const seenList = list.map(c => prog.cards[c.id]).filter((p): p is CardProgress => !!p && p[2] > 0)
  const answers = seenList.reduce((a, p) => a + p[2], 0)
  const ok = seenList.reduce((a, p) => a + p[3], 0)
  const acquired = seenList.filter(p => p[0] >= ACQUIRED_LV).length
  return { zone, cards: list.length, seen: seenList.length, acquired, gaps: seenList.filter(p => isGap(p)).length, rate: answers ? ok / answers : null }
}
