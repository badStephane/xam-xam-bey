import { ACQUIRED_LV, INTERVAL, LEVEL_LABELS, MAX_LV, NEW_PER_DAY, RANKS, XP_BAR_SEGMENTS, XP_HES, XP_PER_LEVEL, XP_SU } from './constants'
import { parseStoredProgress } from './progressMerge'
import type { Card, CardProgress, CardRow, Grade, Progress, Qcm, RawCard, RevisionContent } from './types'

export const EMPTY_PROGRESS: Progress = { cards: {}, sessions: [], xp: 0 }

export const xpFor = (g: Grade): number => (g === 2 ? XP_SU : g === 1 ? XP_HES : 0)

export function validCards(list: unknown, th: number): Card[] {
  if (!Array.isArray(list)) return []
  return (list as RawCard[])
    .filter(c => c && typeof c.id === 'string' && typeof c.q === 'string' && typeof c.a === 'string')
    .map(c => {
      const qcm = validQcm(c.qcm)
      return { id: c.id as string, q: c.q as string, a: c.a as string, src: c.src || '', note: c.note || '', th, ...(qcm ? { qcm } : {}) }
    })
}

/** Un QCM n'est retenu qu'avec une bonne proposition et au moins une mauvaise non vide, différente de la bonne. */
export function validQcm(q: unknown): Qcm | null {
  if (!q || typeof q !== 'object') return null
  const { ok, no } = q as { ok?: unknown; no?: unknown }
  if (typeof ok !== 'string' || !ok.trim() || !Array.isArray(no)) return null
  const wrong = no.filter((x): x is string => typeof x === 'string' && !!x.trim() && x !== ok)
  return wrong.length ? { ok, no: wrong } : null
}

/** Cartes publiées de la table cards, regroupées par zone dans l'ordre de leur position. */
export function cardsByZone(rows: readonly CardRow[]): Record<number, Card[]> {
  const sorted = rows.filter(r => r.status === 'published').slice().sort((a, b) => a.zone - b.zone || a.position - b.position)
  return sorted.reduce<Record<number, Card[]>>((acc, r) => {
    const [card] = validCards([r], r.zone)
    return card ? { ...acc, [r.zone]: [...(acc[r.zone] || []), card] } : acc
  }, {})
}

export function allCards(content: RevisionContent): Card[] {
  return Object.keys(content.cards).map(Number).sort((a, b) => a - b).flatMap(t => content.cards[t])
}

/** Lecture tolérante (QA-9) : mêmes règles que la synchronisation, les entrées invalides sont ignorées. */
export const readProgress = (raw: unknown): Progress => parseStoredProgress(raw)

/** Une carte se révise selon son calendrier si elle est nouvelle ou arrivée à échéance. */
const isScheduled = (p: CardProgress | undefined, today: number): boolean => !p || p[1] <= today

function nextSchedule(p: CardProgress, g: Grade, today: number, scheduled: boolean): readonly [number, number] {
  if (g === 0) return [0, today + 1]
  if (!scheduled) return [p[0], p[1]]
  const lv = g === 2 ? Math.min(MAX_LV, p[0] + 1) : Math.max(1, p[0])
  return [lv, today + INTERVAL[lv]]
}

/**
 * Répétition espacée (D2). À l'échéance ou pour une carte nouvelle : Su monte d'un niveau, Hésitant garde l'intervalle
 * (min. 1). Hors calendrier (entraînement) : vues, réussites et XP comptent, niveau et échéance ne bougent pas.
 * Raté repart toujours à zéro.
 */
export function applyGrade(prog: Progress, cardId: string, g: Grade, today: number): Progress {
  const known = prog.cards[cardId]
  const p: CardProgress = known || [0, today, 0, 0, today]
  const [lv, due] = nextSchedule(p, g, today, isScheduled(known, today))
  const entry: CardProgress = [lv, due, p[2] + 1, p[3] + (g === 2 ? 1 : 0), p[4] || today]
  return { ...prog, cards: { ...prog.cards, [cardId]: entry }, xp: prog.xp + xpFor(g) }
}

export const cardLevel = (prog: Progress, id: string): number => prog.cards[id]?.[0] ?? 0

export const dueCards = (cards: readonly Card[], prog: Progress, today: number): Card[] =>
  cards.filter(c => prog.cards[c.id] && prog.cards[c.id][1] <= today)

export const newToday = (prog: Progress, today: number): number =>
  Object.values(prog.cards).filter(p => p[4] === today).length

export const newCards = (cards: readonly Card[], prog: Progress, curZone: number, limit: number): Card[] =>
  cards.filter(c => !prog.cards[c.id] && c.th <= curZone).slice(0, Math.max(0, limit))

export function dailyCards(cards: readonly Card[], prog: Progress, today: number, curZone: number): { due: Card[]; fresh: Card[] } {
  return { due: dueCards(cards, prog, today), fresh: newCards(cards, prog, curZone, NEW_PER_DAY - newToday(prog, today)) }
}

export const sessionDays = (prog: Progress): Set<number> => new Set(prog.sessions.map(s => s.d))

export function streak(prog: Progress, today: number): number {
  const days = sessionDays(prog)
  let d = days.has(today) ? today : today - 1
  let n = 0
  while (days.has(d)) { n++; d-- }
  return n
}

export function bestStreak(prog: Progress): number {
  const ds = [...sessionDays(prog)].sort((a, b) => a - b)
  return ds.reduce<{ best: number; run: number }>((acc, d, i) => {
    const run = i && d === ds[i - 1] + 1 ? acc.run + 1 : 1
    return { run, best: Math.max(acc.best, run) }
  }, { best: 0, run: 0 }).best
}

export function zoneStats(cards: readonly Card[] | undefined, prog: Progress): { cards: number; acq: number } {
  const list = cards || []
  return { cards: list.length, acq: list.filter(c => cardLevel(prog, c.id) >= ACQUIRED_LV && !!prog.cards[c.id]).length }
}

export interface XpLevel { lv: number; rank: string; xp: number; next: number; fill: number }
export function xpLevel(xp: number): XpLevel {
  const lv = Math.floor(xp / XP_PER_LEVEL) + 1
  const next = lv * XP_PER_LEVEL
  return { lv, rank: RANKS[Math.min(RANKS.length, lv) - 1], xp, next, fill: Math.round(XP_BAR_SEGMENTS * xp / next) }
}

/** Répartition par niveau : indice 0 = jamais vue, puis niveaux 0 à 5. */
export function levelBuckets(cards: readonly Card[], prog: Progress): number[] {
  return cards.reduce((acc, c) => {
    const p = prog.cards[c.id]
    const i = p ? Math.min(MAX_LV, p[0]) + 1 : 0
    return acc.map((v, k) => (k === i ? v + 1 : v))
  }, LEVEL_LABELS.map(() => 0))
}

/** Cartes vues cumulées par jour sur une fenêtre se terminant aujourd'hui. */
export function seenCurve(prog: Progress, today: number, days: number): Array<{ d: number; v: number; on: boolean }> {
  const firsts = Object.values(prog.cards).map(p => p[4])
  const active = sessionDays(prog)
  return Array.from({ length: days }, (_, i) => {
    const d = today - days + 1 + i
    return { d, v: firsts.filter(f => f <= d).length, on: active.has(d) }
  })
}
