/**
 * Ouverture d'une pièce (lot 3, E3, décision PM du 2026-10-13).
 *  - en ligne, sur téléphone : lecteur du téléphone (choix de l'utilisateur, commit 40da947) ;
 *  - en ligne, sur ordinateur : aperçu latéral du site ;
 *  - hors ligne et PDF gardé sur l'appareil : aperçu du site (pdf.js), lu depuis le cache du service worker ;
 *  - hors ligne et PDF absent : message, aucun lien.
 */
export type OpenMode = 'native' | 'inApp' | 'unavailable'

export function openMode(o: { mobile: boolean; offline: boolean; kept: boolean }): OpenMode {
  if (o.offline) return o.kept ? 'inApp' : 'unavailable'
  return o.mobile ? 'native' : 'inApp'
}

/** Sous-ensemble de `navigator.connection` (Network Information API, Chrome Android). */
export interface ConnectionHint { saveData?: boolean; effectiveType?: string }

/** Réseaux où un second téléchargement du même PDF coûte trop (temps et données payées au Mo). */
const SLOW_TYPES = ['slow-2g', '2g']

/** Économie de données demandée, ou 2G : aucun téléchargement facultatif (garde ou revalidation d'un PDF). */
export const isCostlyNetwork = (connection?: ConnectionHint): boolean =>
  !!connection?.saveData || SLOW_TYPES.includes(connection?.effectiveType ?? '')

/**
 * Faut-il demander au service worker de garder (ou de revalider, L3-6) le PDF qu'on ouvre dans le lecteur du téléphone ?
 * Ce lecteur télécharge le fichier hors du site : le garder impose un second téléchargement. On l'évite si l'utilisateur
 * a demandé l'économie de données, ou en 2G. En 3G et au-delà, on accepte le double téléchargement : c'est le seul moyen
 * de tenir la promesse hors ligne sans changer le lecteur choisi. PDF déjà gardé : le worker ne fait qu'une requête HEAD
 * et ne retélécharge le fichier que s'il a changé.
 */
export function shouldKeepOnOpen(o: { workerActive: boolean; connection?: ConnectionHint }): boolean {
  return o.workerActive && !isCostlyNetwork(o.connection)
}
