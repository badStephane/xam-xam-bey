import type { Card, Grade, QuizMode, Session } from './types'
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

export interface AnswerResult {
  session: Session
  /** Carte à noter dans la progression (première réponse en mode « Je réponds »). */
  graded: { card: Card; grade: Grade } | null
  finished: boolean
}

/** Enregistre une réponse. Une carte ratée revient une fois en fin de file (deuxième chance). */
export function answerCard(s: Session, g: Grade): AnswerResult | null {
  if (s.done || !s.rev || s.i >= s.queue.length) return null
  const card = s.queue[s.i].c
  const first = !(card.id in s.res)
  // Les cartes « à retravailler » ont déjà été notées aujourd'hui : on s'entraîne sans renoter.
  const self = s.mode === 'self' && s.kind !== REDO
  const queue = first && self && g === 0 ? [...s.queue, { c: card, second: true, ch: s.queue[s.i].ch }] : s.queue
  const next: Session = {
    ...s, queue, i: s.i + 1, rev: s.mode === 'ask', hist: [...s.hist, g], picked: null,
    res: first ? { ...s.res, [card.id]: g } : s.res,
    xp: s.xp + (first && self ? xpFor(g) : 0),
  }
  return { session: next, graded: first && self ? { card, grade: g } : null, finished: next.i >= queue.length }
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
