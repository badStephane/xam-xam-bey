import type { AppMode, AuthEventKind, AuthLogEntry } from './authLog'

/** Mise en forme du journal de connexion : chargée seulement avec l'écran de connexion (budget du bundle initial). */
const KIND_LABEL: Record<AuthEventKind, string> = {
  forced: 'déconnexion imposée', chosen: 'déconnexion choisie', absent: 'pas de session à l’ouverture', signed_in: 'connexion', refreshed: 'jeton rafraîchi',
}
const APP_LABEL: Record<AppMode, string> = { appli: 'appli installée', navigateur: 'navigateur', webview: 'navigateur intégré' }
const p2 = (n: number): string => String(n).padStart(2, '0')

/** Texte à recopier, l'événement le plus récent en premier. */
export function formatAuthLog(entries: readonly AuthLogEntry[]): string {
  return [...entries].reverse().map(e => {
    const d = new Date(e.t)
    return [
      `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`, KIND_LABEL[e.k],
      e.vis === 'hidden' ? 'onglet caché' : 'onglet visible', e.on ? 'en ligne' : 'hors réseau', APP_LABEL[e.app], e.tok ? 'jeton présent' : 'sans jeton',
    ].join(' · ')
  }).join('\n')
}
