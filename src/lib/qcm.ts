import { norm, plain, shuffle } from './format'
import type { Card, Choices, Grade, Session } from './types'

export const QCM_SIZE = 4
const MAX_OPTION_LENGTH = 110

/** Réponse courte tirée d'une réponse rédigée : première phrase, tronquée si trop longue. */
export function shortAnswer(a: string): string {
  const first = plain(a).split(/(?<=[.!?])\s+/)[0].trim().replace(/\.$/, '')
  return first.length > MAX_OPTION_LENGTH ? `${first.slice(0, MAX_OPTION_LENGTH - 1).trimEnd()}…` : first
}

const answerOf = (c: Card): string => c.qcm?.ok || shortAnswer(c.a)

/** Leurres distincts de la bonne réponse et entre eux (sans accents ni casse), au plus QCM_SIZE - 1. */
function distinctWrong(ok: string, candidates: readonly string[]): string[] {
  return candidates.reduce<{ seen: ReadonlySet<string>; out: string[] }>((acc, w) => {
    const k = norm(w)
    if (!w.trim() || acc.seen.has(k) || acc.out.length >= QCM_SIZE - 1) return acc
    return { seen: new Set([...acc.seen, k]), out: [...acc.out, w] }
  }, { seen: new Set([norm(ok)]), out: [] }).out
}

/** Propositions vides : aucun leurre disponible, la carte se révise en auto-évaluation (IM-6). */
export const SELF_CHECK: Choices = { options: [], correct: -1 }
export const isSelfCheck = (ch: Choices): boolean => ch.options.length < 2

/**
 * Propositions d'une carte : le QCM rédigé s'il en reste au moins un leurre distinct, sinon les réponses d'autres cartes
 * de la même zone, complétées par celles d'autres zones s'il en manque (IM-6). Jamais de QCM à une seule proposition :
 * sans aucun leurre, la carte passe en auto-évaluation (SELF_CHECK).
 */
export function buildChoices(card: Card, pool: readonly Card[], rand: () => number = Math.random): Choices {
  const ok = answerOf(card)
  const written = card.qcm ? distinctWrong(ok, card.qcm.no) : []
  const answers = (sameZone: boolean) => shuffle(pool.filter(c => c.id !== card.id && (c.th === card.th) === sameZone).map(answerOf), rand)
  const fromZone = written.length ? written : distinctWrong(ok, answers(true))
  const wrong = written.length || fromZone.length >= QCM_SIZE - 1 ? fromZone : distinctWrong(ok, [...fromZone, ...answers(false)])
  if (!wrong.length) return SELF_CHECK
  const options = shuffle([ok, ...wrong], rand)
  return { options, correct: options.indexOf(ok) }
}

/** Attribue des propositions aux cartes d'une session qui n'en ont pas encore. */
export function withChoices(s: Session, pool: readonly Card[], rand: () => number = Math.random): Session {
  return { ...s, queue: s.queue.map(q => (q.ch ? q : { ...q, ch: buildChoices(q.c, pool, rand) })) }
}

/** Note d'un QCM validé : bonne réponse = Su, sinon Raté (la carte revient en deuxième chance). */
export function gradeOf(s: Session): Grade | null {
  const ch = s.queue[s.i]?.ch
  if (!ch || s.picked === null) return null
  return s.picked === ch.correct ? 2 : 0
}

/** Générateur pseudo-aléatoire reproductible (planches de démonstration). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
