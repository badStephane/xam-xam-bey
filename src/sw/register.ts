import { PARAMS } from '../lib/params'
import { CACHE_PREFIX } from './rules'

/**
 * Inscription du service worker (lot 3, E3), après le chargement complet de la page : sans effet sur le premier affichage.
 * Jamais en développement (`vite`), donc jamais dans les E2E qui tournent sur le serveur de dev, ni dans les cadres des planches.
 * Build avec VITE_SW=off : désinscrit tout worker existant (procédure de secours, docs/squad/05-build.md).
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || PARAMS.frame || !('serviceWorker' in navigator)) return
  const run = (): void => {
    if (import.meta.env.VITE_SW === 'off') {
      void unregisterAll()
      return
    }
    // updateViaCache « none » : sw.js est toujours revérifié au réseau, une nouvelle version n'est jamais masquée.
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .catch(err => console.warn('[xxb] Service worker non inscrit : le site fonctionne sans copie hors ligne', err))
  }
  if (document.readyState === 'complete') run()
  else window.addEventListener('load', run, { once: true })
}

/**
 * Purges tardives (ms après la désinscription) : un ancien worker peut finir d'écrire un fichier dans un cache après la
 * première purge, et le worker de secours ne peut pas recharger un onglet qu'il ne contrôle pas. Idempotent.
 */
export const LATE_PURGE_DELAYS_MS: readonly number[] = [3_000, 10_000]

/** Supprime les caches du site (préfixe « xxb- ») ; rien d'autre (localStorage, dont xxb.progress.*, jamais touché). */
export async function purgeSiteCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  const names = await caches.keys()
  await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX)).map(n => caches.delete(n)))
}

/** Secours : désinscrit tout worker du site et purge ses caches (xxb-*), y compris ceux recréés par un ancien worker en partant. */
export async function unregisterAll(wait: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map(r => r.unregister()))
    await purgeSiteCaches()
    let elapsed = 0
    for (const at of LATE_PURGE_DELAYS_MS) {
      await wait(at - elapsed)
      elapsed = at
      await purgeSiteCaches()
    }
  } catch (err) {
    console.warn('[xxb] Désinscription du service worker incomplète', err)
  }
}
