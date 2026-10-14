import { gradeFloorKey } from './grades'
import { clearGradesQueue } from './gradeQueue'

/**
 * Clés locales du lot 5 par compte, toutes effacées à la déconnexion comme la copie des cartes du lot 4 (aucune trace du
 * compte sur un téléphone partagé). « Non merci » reste définitif : il est aussi enregistré par le serveur
 * (set_league_opt_in(false), L5-2). Le plancher de grade (A1) se recalcule à l'identique à la connexion suivante.
 */
export const leagueCacheKey = (userId: string): string => `xxb.league.v1.${userId}`
export const leagueSeenKey = (userId: string): string => `xxb.leagueSeen.v1.${userId}`
export const badgesSeenKey = (userId: string): string => `xxb.badges.v1.${userId}`
export const pseudoAskKey = (userId: string): string => `xxb.pseudoAsk.v1.${userId}`

export function clearGamification(store: Pick<Storage, 'removeItem'> | null, userId: string): void {
  clearGradesQueue(store, userId)
  try {
    [leagueCacheKey, leagueSeenKey, badgesSeenKey, pseudoAskKey, gradeFloorKey].forEach(k => store?.removeItem(k(userId)))
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}
