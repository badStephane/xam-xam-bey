import type { Card, Grade, QuizMode, Session } from './types'
import { XP_REDO } from './constants'
import { xpFor } from './srs'

export const REDO = 'redo'

/** Une session compte dans l'historique si c'est « Je réponds », hors reprise, avec au moins une réponse. */
export const isLogged = (s: Session): boolean => s.mode === 'self' && s.kind !== REDO && Object.keys(s.res).length > 0

export function mkSession(mode: QuizMode, kind: string, label: string, cards: readonly Card[], name = '', extra: Partial<Session> = {}): Session {
  return {
    mode, kind, label, name, queue: cards.map(c => ({ c, second: false })), i: 0, rev: mode === 'ask',
    res: {}, hist: [], xp: 0, done: false, picked: null, ...extra,
  }
}

/**
 * Réponse comptée (E1) : `hist` reçoit une note par position de la file, au moment où la correction s'affiche.
 * Position courante notée : hist.length === i + 1 ; pas encore notée : hist.length === i.
 */
export const isScored = (s: Session): boolean => s.hist.length > s.i

export interface ScoreResult {
  session: Session
  /** Carte à noter dans la progression (première réponse en mode « Je réponds », hors reprise). */
  graded: { card: Card; grade: Grade } | null
  /** XP perso sans note (carte sue en reprise), à ajouter à la progression ; 0 sinon. */
  bonus: number
}

/** XP gagnée par une réponse : note du jour (première réponse, « Je réponds »), bonus de reprise, ou rien. */
function answerXp(s: Session, g: Grade, first: boolean): number {
  if (!first || s.mode !== 'self') return 0
  if (s.kind === REDO) return g === 2 ? XP_REDO : 0
  return xpFor(g)
}

/**
 * Compte la réponse de la carte affichée, sans changer de carte (E1). Une carte ratée revient une fois en fin de file
 * (deuxième chance). Renvoie null si la carte n'est pas retournée ou déjà notée : jamais deux notes pour une position.
 */
export function scoreCurrent(s: Session, g: Grade): ScoreResult | null {
  if (s.done || !s.rev || s.i >= s.queue.length || isScored(s)) return null
  const item = s.queue[s.i]
  const card = item.c
  const first = !(card.id in s.res)
  // Les cartes « à retravailler » ont déjà été notées aujourd'hui : on s'entraîne sans renoter.
  const self = s.mode === 'self' && s.kind !== REDO
  const queue = first && self && g === 0 ? [...s.queue, { c: card, second: true, ch: item.ch }] : s.queue
  const gain = answerXp(s, g, first)
  const session: Session = {
    ...s, queue, hist: [...s.hist, g],
    res: first ? { ...s.res, [card.id]: g } : s.res,
    xp: s.xp + gain,
  }
  return { session, graded: first && self ? { card, grade: g } : null, bonus: self ? 0 : gain }
}

/** XP gagnée par la réponse affichée (verdict du QCM) ; 0 si elle n'est pas encore notée ou en deuxième chance. */
export function positionXp(s: Session): number {
  const item = s.queue[s.i]
  if (!isScored(s) || !item || item.second) return 0
  return answerXp(s, s.hist[s.i], true)
}

/** Passe à la carte suivante, une fois la carte affichée notée. « Suivant » ne note rien (E1). */
export function advance(s: Session): { session: Session; finished: boolean } | null {
  if (s.done || s.i >= s.queue.length || !isScored(s)) return null
  const session: Session = { ...s, i: s.i + 1, rev: s.mode === 'ask', picked: null }
  return { session, finished: session.i >= session.queue.length }
}

export interface AnswerResult extends ScoreResult {
  finished: boolean
}

/** Note la carte affichée si ce n'est pas déjà fait, puis passe à la suivante (interrogation, auto-évaluation). */
export function answerCard(s: Session, g: Grade): AnswerResult | null {
  const scored = isScored(s) ? { session: s, graded: null, bonus: 0 } : scoreCurrent(s, g)
  const moved = scored && advance(scored.session)
  if (!scored || !moved) return null
  return { session: moved.session, graded: scored.graded, bonus: scored.bonus, finished: moved.finished }
}

export function gradeCounts(res: Record<string, Grade>): [number, number, number] {
  return Object.values(res).reduce<[number, number, number]>((c, g) => {
    const out: [number, number, number] = [c[0], c[1], c[2]]
    out[g]++
    return out
  }, [0, 0, 0])
}

export const missedCards = (s: Session): Card[] =>
  s.queue.filter(q => !q.second && s.res[q.c.id] !== undefined && s.res[q.c.id] !== 2).map(q => q.c)

export function combo(s: Session): number {
  let n = 0
  for (let i = s.hist.length - 1; i >= 0 && s.hist[i] === 2; i--) n++
  return n
}

export const replayCount = (s: Session): number => s.queue.filter((q, k) => q.second && k >= s.i).length

export function suggestedGrade(points: number, checked: number): Grade | null {
  if (!points) return null
  return checked === points ? 2 : checked === 0 ? 0 : 1
}
