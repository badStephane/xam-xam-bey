import { KEPT_SESSIONS, XP_SU } from './constants'
import type { CardProgress, Progress, SessionLog } from './types'

/** Plafond de l'XP accepté par la RPC save_progress (contrat lot 1, §1). */
export const MAX_XP = 10_000_000

const CARD_FIELDS = 5
const VIEWS = 2
const DUE = 1
/** Ordre de comparaison de deux entrées : vues, échéance, puis le reste pour départager sans ambiguïté. */
const CARD_ORDER = [VIEWS, DUE, 0, 3, 4] as const

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function compareCards(a: CardProgress, b: CardProgress): number {
  for (const i of CARD_ORDER) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/** Entrée retenue pour une carte présente des deux côtés : plus de vues, puis échéance la plus lointaine. */
export const pickCard = (a: CardProgress, b: CardProgress): CardProgress => (compareCards(a, b) >= 0 ? a : b)

/** Forme canonique d'une séance (clés triées) : deux séances égales en JSON ont la même clé. */
function sessionKey(s: SessionLog): string {
  const rec = s as unknown as Record<string, unknown>
  return JSON.stringify(Object.keys(rec).sort().map(k => [k, rec[k]]))
}

function mergeCards(a: Progress['cards'], b: Progress['cards']): Progress['cards'] {
  return Object.entries(b).reduce<Progress['cards']>(
    (acc, [id, entry]) => ({ ...acc, [id]: acc[id] ? pickCard(acc[id], entry) : entry }),
    { ...a },
  )
}

const cmpText = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)

/**
 * Ordre canonique commun avec le SQL (décision PM, L1-1) : d, n, ok en nombres, puis k, l en comparaison
 * simple (unités de code, pas localeCompare). Le JSON à clés triées départage les séances à champs en plus.
 */
function compareSessions([ka, a]: readonly [string, SessionLog], [kb, b]: readonly [string, SessionLog]): number {
  return a.d - b.d || a.n - b.n || a.ok - b.ok || cmpText(a.k, b.k) || cmpText(a.l, b.l) || cmpText(ka, kb)
}

function mergeSessions(a: readonly SessionLog[], b: readonly SessionLog[]): SessionLog[] {
  const unique = new Map([...a, ...b].map(s => [sessionKey(s), s] as const))
  return [...unique.entries()]
    .sort(compareSessions)
    .map(([, s]) => s)
    .slice(-KEPT_SESSIONS)
}

/**
 * Fusion de deux progressions, mêmes règles que la RPC save_progress (contrat §1 et §2) :
 * union des cartes (plus de vues, puis plus grande échéance), union des séances triées et bornées, XP maximale.
 * Commutative, associative et idempotente.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  return { cards: mergeCards(a.cards, b.cards), sessions: mergeSessions(a.sessions, b.sessions), xp: Math.max(a.xp, b.xp) }
}

function parseCards(v: unknown): Progress['cards'] {
  if (!isRecord(v)) return {}
  return Object.entries(v).reduce<Progress['cards']>((acc, [id, e]) => (
    Array.isArray(e) && e.length === CARD_FIELDS && e.every(isCount) ? { ...acc, [id]: [...e] as CardProgress } : acc
  ), {})
}

const isSession = (v: unknown): v is SessionLog =>
  isRecord(v) && isFiniteNum(v.d) && isFiniteNum(v.n) && isFiniteNum(v.ok) && typeof v.k === 'string' && typeof v.l === 'string'

function parseXp(v: unknown, sessions: readonly SessionLog[]): number {
  const raw = isFiniteNum(v) && v >= 0 ? v : sessions.reduce((sum, s) => sum + s.ok * XP_SU, 0)
  return Math.min(MAX_XP, Math.max(0, Math.floor(raw)))
}

/** Lecture tolérante d'une progression venue du serveur ou du stockage local : les entrées invalides sont ignorées. */
export function parseStoredProgress(raw: unknown): Progress {
  if (!isRecord(raw)) return { cards: {}, sessions: [], xp: 0 }
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.filter(isSession).map(s => ({ ...s })) : []
  return { cards: parseCards(raw.cards), sessions, xp: parseXp(raw.xp, sessions) }
}

/** Égalité de contenu de deux progressions (même ordre des séances). */
export function progressEquals(a: Progress, b: Progress): boolean {
  const ka = Object.keys(a.cards)
  if (a.xp !== b.xp || ka.length !== Object.keys(b.cards).length || a.sessions.length !== b.sessions.length) return false
  const sameCards = ka.every(id => b.cards[id] !== undefined && compareCards(a.cards[id], b.cards[id]) === 0)
  return sameCards && a.sessions.every((s, i) => sessionKey(s) === sessionKey(b.sessions[i]))
}
