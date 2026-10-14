/**
 * Dernier compte chargé en ligne sur cet appareil (lot 4, F1). Hors réseau, la page ne peut pas interroger
 * Supabase sans attendre l'échec du rafraîchissement du jeton (jusqu'à ~25 s) : elle reprend ce compte-ci.
 * Écrit après un chargement en ligne réussi, effacé à la déconnexion (ou si Supabase annonce SIGNED_OUT).
 * Ne donne aucun droit : les écritures repartent toujours avec la session Supabase de ce même compte.
 */
export const KNOWN_USER_KEY = 'xxb.user.v1'

export interface KnownUser {
  id: string
  email: string | null
}

type Store = Pick<Storage, 'getItem'>

export function parseKnownUser(raw: unknown): KnownUser | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { id, email } = raw as { id?: unknown; email?: unknown }
  if (typeof id !== 'string' || !id.trim()) return null
  return { id, email: typeof email === 'string' ? email : null }
}

export function readKnownUser(store: Store | null): KnownUser | null {
  try {
    const raw = store?.getItem(KNOWN_USER_KEY)
    return raw ? parseKnownUser(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function writeKnownUser(store: Pick<Storage, 'setItem'> | null, user: KnownUser): void {
  try {
    store?.setItem(KNOWN_USER_KEY, JSON.stringify({ id: user.id, email: user.email }))
  } catch {
    // Stockage plein ou bloqué : pas de révision hors ligne, rien d'autre ne change.
  }
}

/** Efface le compte retenu s'il s'agit de `userId` (ou si l'entrée est illisible). */
export function forgetKnownUser(store: Pick<Storage, 'getItem' | 'removeItem'> | null, userId: string): void {
  try {
    const known = readKnownUser(store)
    if (!known || known.id === userId) store?.removeItem(KNOWN_USER_KEY)
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}
