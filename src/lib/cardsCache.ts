import { ZONES } from './constants'
import { validCards } from './srs'
import type { Card, Fiche, Plan, RevisionContent } from './types'

/**
 * Révision hors ligne (lot 4, F1) : copie des cartes publiées, du plan et des fiches, gardée par compte.
 * Le service worker ne garde jamais REST ni Auth : la copie est faite par la page, en localStorage.
 * Forme versionnée, validée à la lecture ; une copie d'un autre compte, d'une autre version ou mal formée est ignorée.
 */
export const CARDS_CACHE_VERSION = 1
export const CARDS_KEY_PREFIX = `xxb.cards.v${CARDS_CACHE_VERSION}.`
export const cardsCacheKey = (userId: string): string => `${CARDS_KEY_PREFIX}${userId}`

export type CardsStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

interface StoredCards {
  v: typeof CARDS_CACHE_VERSION
  user: string
  /** Date de la copie (ms), pour le diagnostic. */
  at: number
  plan: Plan | null
  fiches: Record<number, Fiche>
  cards: Record<number, Card[]>
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Objet indexé par zone (1 à 12), chaque valeur validée par `parse` ; entrées invalides retirées. */
function byZone<T>(v: unknown, parse: (x: unknown, zone: number) => T | null): Record<number, T> | null {
  if (!isRecord(v)) return null
  return Object.entries(v).reduce<Record<number, T>>((acc, [k, x]) => {
    const zone = Number(k)
    const parsed = Number.isInteger(zone) && zone >= 1 && zone <= ZONES.length ? parse(x, zone) : null
    return parsed === null ? acc : { ...acc, [zone]: parsed }
  }, {})
}

/** Fiche : objet dont les listes sont des listes (le rendu les parcourt) ; sinon retirée. */
const validFiche = (v: unknown): Fiche | null =>
  isRecord(v) && [v.sections, v.vigilance].every(l => l === undefined || Array.isArray(l))
  && (!Array.isArray(v.sections) || v.sections.every(x => isRecord(x) && (x.items === undefined || Array.isArray(x.items))))
    ? v as Fiche
    : null

/** Copie relue pour `userId` : contenu validé, ou null (absente, autre compte, autre version, illisible). */
export function parseCardsCache(raw: unknown, userId: string): RevisionContent | null {
  if (!isRecord(raw) || raw.v !== CARDS_CACHE_VERSION || raw.user !== userId || !userId) return null
  if (raw.plan !== null && !isRecord(raw.plan)) return null
  const fiches = byZone(raw.fiches, validFiche)
  const cards = byZone(raw.cards, (x, zone) => (Array.isArray(x) ? validCards(x, zone) : null))
  if (!fiches || !cards) return null
  return { plan: raw.plan as Plan | null, fiches, cards }
}

export function readCardsCache(store: Pick<Storage, 'getItem'> | null, userId: string): RevisionContent | null {
  try {
    const raw = store?.getItem(cardsCacheKey(userId))
    return raw ? parseCardsCache(JSON.parse(raw), userId) : null
  } catch {
    return null
  }
}

/** Texte enregistré pour une copie (exporté pour mesurer sa taille). */
export const serializeCardsCache = (userId: string, c: RevisionContent, at: number): string =>
  JSON.stringify({ v: CARDS_CACHE_VERSION, user: userId, at, plan: c.plan, fiches: c.fiches, cards: c.cards } satisfies StoredCards)

/** Clés de copies de cartes des autres comptes (une seule copie gardée par appareil : celle du dernier compte chargé). */
function otherCopies(store: CardsStore, userId: string): string[] {
  const keys = Array.from({ length: store.length }, (_, i) => store.key(i))
  return keys.filter((k): k is string => !!k && k.startsWith(CARDS_KEY_PREFIX) && k !== cardsCacheKey(userId))
}

/**
 * Remplace la copie après un chargement en ligne réussi. Renvoie faux si le stockage refuse (quota, navigation privée) :
 * la copie précédente du même compte reste alors en place, toujours valide.
 */
export function writeCardsCache(store: CardsStore | null, userId: string, c: RevisionContent, at: number = Date.now()): boolean {
  if (!store || !userId) return false
  try {
    otherCopies(store, userId).forEach(k => store.removeItem(k))
    store.setItem(cardsCacheKey(userId), serializeCardsCache(userId, c, at))
    return true
  } catch {
    return false
  }
}

export function clearCardsCache(store: Pick<Storage, 'removeItem'> | null, userId: string): void {
  try { store?.removeItem(cardsCacheKey(userId)) } catch { /* stockage indisponible : rien à effacer */ }
}
