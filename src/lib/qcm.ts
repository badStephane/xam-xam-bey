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

/**
 * Propositions d'une carte : le QCM rédigé s'il existe, sinon les réponses d'autres cartes de la même zone.
 * La bonne réponse est toujours présente ; les doublons (sans accents ni casse) sont écartés.
 */
export function buildChoices(card: Card, pool: readonly Card[], rand: () => number = Math.random): Choices {
  const ok = answerOf(card)
  const candidates = card.qcm ? card.qcm.no : shuffle(pool.filter(c => c.id !== card.id && c.th === card.th).map(answerOf), rand)
  const seen = new Set([norm(ok)])
  const wrong = candidates.filter(w => {
    const k = norm(w)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, QCM_SIZE - 1)
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
