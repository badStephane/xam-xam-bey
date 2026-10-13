import { dayNum } from './format'

/** Marge après minuit, pour que le minuteur ne se déclenche pas une poignée de millisecondes trop tôt. */
const MIDNIGHT_MARGIN_MS = 1_000

export const dayChanged = (prev: Date, next: Date): boolean => dayNum(prev) !== dayNum(next)

/** Garde la date précédente (même référence) tant que le jour civil n'a pas changé. */
export const nextNow = (prev: Date, next: Date): Date => (dayChanged(prev, next) ? next : prev)

/** Délai avant le prochain minuit local, plus une marge. */
export function msUntilNextDay(now: Date): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return Math.max(0, midnight.getTime() - now.getTime()) + MIDNIGHT_MARGIN_MS
}
