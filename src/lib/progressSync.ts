import { KEPT_SESSIONS } from './constants'
import { MAX_XP, mergeProgress, parseStoredProgress, progressEquals } from './progressMerge'
import type { QueuedGrade } from './gradeQueue'
import { EMPTY_PROGRESS } from './srs'
import type { Progress, SessionLog } from './types'

/** Sous-ensemble de Storage utilisé (injectable pour les tests). */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

export const localProgressKey = (userId: string): string => `xxb.progress.v1.${userId}`

/** Copie locale de la progression ; stockage absent, bloqué ou contenu illisible : progression vide. */
export function readLocalProgress(store: KeyValueStore | null, userId: string): Progress {
  try {
    const raw = store?.getItem(localProgressKey(userId))
    return raw ? parseStoredProgress(JSON.parse(raw)) : EMPTY_PROGRESS
  } catch {
    return EMPTY_PROGRESS
  }
}

/**
 * Écrit la copie locale, fusionnée avec celle déjà présente (un autre onglet du même compte a pu y écrire, L1-4).
 * Un stockage plein ou bloqué n'empêche pas de réviser (le serveur reste la référence).
 */
export function writeLocalProgress(store: KeyValueStore | null, userId: string, p: Progress): void {
  try {
    const merged = mergeProgress(readLocalProgress(store, userId), p)
    store?.setItem(localProgressKey(userId), JSON.stringify({ cards: merged.cards, sessions: merged.sessions, xp: merged.xp }))
  } catch {
    // Quota dépassé ou navigation privée : on continue sans copie locale.
  }
}

/** Au chargement : fusion de la ligne serveur et de la copie locale ; `dirty` si le local apporte du nouveau. */
export function reconcileOnLoad(server: Progress, local: Progress): { prog: Progress; dirty: boolean } {
  const normalized = mergeProgress(server, EMPTY_PROGRESS)
  const prog = mergeProgress(server, local)
  return { prog, dirty: !progressEquals(prog, normalized) }
}

export interface SaveArgs {
  p_cards: Progress['cards']
  p_sessions: SessionLog[]
  p_xp: number
  p_grades?: QueuedGrade[]
}

/**
 * Paramètres de la RPC save_progress (contrat §1, et L5-1 pour `p_grades`). Sans note en attente : appel à 3 clés,
 * identique au lot 4 (compatible avec une base qui n'a pas encore la migration du lot 5).
 */
export const saveArgs = (p: Progress, grades: readonly QueuedGrade[] = []): SaveArgs => ({
  p_cards: p.cards,
  p_sessions: p.sessions.slice(-KEPT_SESSIONS),
  p_xp: Math.min(MAX_XP, Math.max(0, Math.floor(p.xp))),
  ...(grades.length ? { p_grades: [...grades] } : {}),
})

/** XP de ligue de la semaine et notes comptées renvoyées par save_progress (L5-1) ; null si absentes (base du lot 4). */
export function weekOfSaveResult(data: unknown): { weekXp: number; counted: number } | null {
  const row: unknown = Array.isArray(data) ? data[0] : data
  if (typeof row !== 'object' || row === null) return null
  const { week_xp: weekXp, grades_counted: counted } = row as { week_xp?: unknown; grades_counted?: unknown }
  if (typeof weekXp !== 'number' || !Number.isFinite(weekXp)) return null
  return { weekXp, counted: typeof counted === 'number' && Number.isFinite(counted) ? counted : 0 }
}

const errorField = (error: unknown, k: 'code' | 'message'): string => {
  const v = typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[k] : undefined
  return typeof v === 'string' ? v : ''
}

/** File de notes refusée en bloc (22023 GRADES_INVALID) : la file est abandonnée pour ne pas bloquer la progression. */
export const isGradesRejected = (error: unknown): boolean => errorField(error, 'code') === '22023' && errorField(error, 'message') === 'GRADES_INVALID'

/** Base sans le 4e paramètre (PostgREST PGRST202, fonction introuvable) : renvoi à 3 clés, la file reste gardée. */
export const isGradesUnsupported = (error: unknown): boolean => errorField(error, 'code') === 'PGRST202'

/** État fusionné renvoyé par save_progress (tableau d'une ligne), ou null si la réponse est inexploitable. */
export function fromSaveResult(data: unknown): Progress | null {
  const row: unknown = Array.isArray(data) ? data[0] : data
  return typeof row === 'object' && row !== null ? parseStoredProgress(row) : null
}

/** État de l'enregistrement au moment de la déconnexion. */
export interface SaveState { dirty: boolean; saving: boolean; again: boolean }

/** La copie locale n'est effacée que si le serveur a tout reçu : rien en attente, rien en cours. */
export const canClearLocal = (s: SaveState): boolean => !s.dirty && !s.saving && !s.again

export function clearLocalProgress(store: Pick<Storage, 'removeItem'> | null, userId: string): void {
  try {
    store?.removeItem(localProgressKey(userId))
  } catch {
    // Stockage bloqué : rien à effacer de notre côté.
  }
}

/** Refus définitifs de save_progress (validation, texte invalide 22P02, contrainte de taille) : réessayer en boucle ne changerait rien. */
const REJECTED_CODES = ['22023', '22P02', '23514']
export type SaveErrorKind = 'retry' | 'rejected'

export function saveErrorKind(error: unknown): SaveErrorKind {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  return typeof code === 'string' && REJECTED_CODES.includes(code) ? 'rejected' : 'retry'
}

/** Un autre compte s'est connecté sans déconnexion préalable (lien magique ouvert dans un autre onglet, L1-5). */
export const isAccountSwitch = (owner: string | null, userId: string): boolean => owner !== null && owner !== userId
