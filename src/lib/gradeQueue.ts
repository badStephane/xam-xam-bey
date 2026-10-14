import type { Grade } from './types'

/**
 * File locale des notes pour l'XP de ligue (lot 5, contrat L5-1, A11) : `xxb.grades.v1.<user_id>`.
 * Une entrée par (carte, jour) : la première note du jour. Pour un QCM, `a` est le texte exact de la proposition choisie
 * (le serveur la compare à la bonne réponse, A11) ; absent pour une carte en auto-évaluation. Rien pour « J'interroge ».
 * `t` : heure de la note (secondes depuis 1970) ; le serveur s'en sert pour la limite du dimanche 20:00 (A7).
 * Envoyée avec save_progress (4e paramètre p_grades), retirée après un envoi réussi, effacée à la déconnexion.
 * Garde aussi les cartes distinctes notées aujourd'hui sur l'appareil (message « plafond du jour atteint »).
 */
export interface QueuedGrade { c: string; d: number; g: Grade; t?: number; a?: string }

export const GRADES_QUEUE_VERSION = 1
export const gradesQueueKey = (userId: string): string => `xxb.grades.v${GRADES_QUEUE_VERSION}.${userId}`
/** Contrat L5-1 : 500 notes au plus par appel. */
export const MAX_GRADES_PER_CALL = 500

/**
 * Jour UTC d'un instant (jours depuis 1970), unité du serveur. Jamais le jour local : à l'est de Dakar, juste après
 * minuit, le jour local serait « demain » pour le serveur et la note refusée (QA L5-1).
 */
export const utcDay = (ms: number): number => Math.floor(ms / 864e5)
/** Le serveur refuse les notes de plus de 8 jours : inutile de les garder. */
export const GRADE_RETENTION_DAYS = 8
/** A6 : 30 cartes par jour comptent pour la ligue. */
export const DAILY_LEAGUE_CARDS = 30
const MAX_ANSWER_LENGTH = 500
const MAX_CARD_ID_LENGTH = 64

interface StoredQueue {
  v: typeof GRADES_QUEUE_VERSION
  user: string
  items: QueuedGrade[]
  /** Cartes distinctes notées le jour `d` sur cet appareil. */
  today: { d: number; ids: string[] }
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v > 0
const isDay = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
const isCardId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_CARD_ID_LENGTH

/** Entrée valide, ou null (une entrée mal formée bloquerait tout l'envoi : 22023 GRADES_INVALID). */
export function parseQueuedGrade(v: unknown): QueuedGrade | null {
  if (!isRecord(v) || !isCardId(v.c) || !isDay(v.d) || ![0, 1, 2].includes(v.g as number)) return null
  if (v.t !== undefined && !isInt(v.t)) return null
  const base: QueuedGrade = { c: v.c, d: v.d, g: v.g as Grade, ...(v.t === undefined ? {} : { t: v.t as number }) }
  if (v.a === undefined) return base
  return typeof v.a === 'string' && v.a.length <= MAX_ANSWER_LENGTH ? { ...base, a: v.a } : null
}

const keyOf = (q: Pick<QueuedGrade, 'c' | 'd'>): string => `${q.d}|${q.c}`

function emptyQueue(userId: string): StoredQueue {
  return { v: GRADES_QUEUE_VERSION, user: userId, items: [], today: { d: 0, ids: [] } }
}

/** File relue pour `userId` ; absente, d'un autre compte, d'une autre version ou illisible : file vide. */
export function parseGradesQueue(raw: unknown, userId: string): StoredQueue {
  if (!isRecord(raw) || raw.v !== GRADES_QUEUE_VERSION || raw.user !== userId || !Array.isArray(raw.items)) return emptyQueue(userId)
  const seen = new Set<string>()
  const items = raw.items.map(parseQueuedGrade).filter((q): q is QueuedGrade => {
    if (!q || seen.has(keyOf(q))) return false
    seen.add(keyOf(q))
    return true
  })
  const t = isRecord(raw.today) ? raw.today : {}
  const ids = Array.isArray(t.ids) ? [...new Set(t.ids.filter(isCardId))] : []
  return { v: GRADES_QUEUE_VERSION, user: userId, items, today: { d: isDay(t.d) ? t.d : 0, ids } }
}

function readStored(store: Pick<Storage, 'getItem'> | null, userId: string): StoredQueue {
  try {
    const raw = store?.getItem(gradesQueueKey(userId))
    return raw ? parseGradesQueue(JSON.parse(raw), userId) : emptyQueue(userId)
  } catch {
    return emptyQueue(userId)
  }
}

function writeStored(store: Store | null, q: StoredQueue): void {
  try {
    if (!q.items.length && !q.today.ids.length) store?.removeItem(gradesQueueKey(q.user))
    else store?.setItem(gradesQueueKey(q.user), JSON.stringify(q))
  } catch {
    // Stockage plein ou bloqué : la note reste dans la progression (XP perso), seule l'XP de ligue est perdue.
  }
}

/** Notes en attente d'envoi, des plus anciennes aux plus récentes. */
export const readGradesQueue = (store: Pick<Storage, 'getItem'> | null, userId: string): QueuedGrade[] => readStored(store, userId).items

/**
 * Ajoute une note si la carte n'est pas déjà dans la file pour ce jour (la première note du jour compte).
 * Purge les notes trop anciennes pour être acceptées (jour < today - 8).
 */
export function enqueueGrade(store: Store | null, userId: string, grade: QueuedGrade, today: number): void {
  const parsed = parseQueuedGrade(grade)
  if (!parsed) return
  const q = readStored(store, userId)
  const fresh = q.items.filter(i => i.d >= today - GRADE_RETENTION_DAYS)
  const items = fresh.some(i => keyOf(i) === keyOf(parsed)) ? fresh : [...fresh, parsed]
  const base = q.today.d === today ? q.today.ids : []
  const ids = parsed.d === today && !base.includes(parsed.c) ? [...base, parsed.c] : base
  writeStored(store, { ...q, items, today: { d: today, ids } })
}

/** Lot à envoyer : les plus anciennes d'abord, 500 au plus. */
export const gradesBatch = (items: readonly QueuedGrade[]): QueuedGrade[] => items.slice(0, MAX_GRADES_PER_CALL)

/** Après un envoi réussi : retire les notes envoyées, garde celles ajoutées pendant l'appel. Renvoie le reste. */
export function removeSentGrades(store: Store | null, userId: string, sent: readonly QueuedGrade[]): QueuedGrade[] {
  const gone = new Set(sent.map(keyOf))
  const q = readStored(store, userId)
  const items = q.items.filter(i => !gone.has(keyOf(i)))
  writeStored(store, { ...q, items })
  return items
}

/** Cartes distinctes notées aujourd'hui sur cet appareil (envoyées ou non). */
export function gradedToday(store: Pick<Storage, 'getItem'> | null, userId: string, today: number): number {
  const q = readStored(store, userId)
  return q.today.d === today ? q.today.ids.length : 0
}

export function clearGradesQueue(store: Pick<Storage, 'removeItem'> | null, userId: string): void {
  try { store?.removeItem(gradesQueueKey(userId)) } catch { /* stockage indisponible : rien à effacer */ }
}
