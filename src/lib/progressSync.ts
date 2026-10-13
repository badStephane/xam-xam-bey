import { KEPT_SESSIONS } from './constants'
import { MAX_XP, mergeProgress, parseStoredProgress, progressEquals } from './progressMerge'
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
}

/** Paramètres de la RPC save_progress (contrat §1). */
export const saveArgs = (p: Progress): SaveArgs => ({
  p_cards: p.cards,
  p_sessions: p.sessions.slice(-KEPT_SESSIONS),
  p_xp: Math.min(MAX_XP, Math.max(0, Math.floor(p.xp))),
})

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
