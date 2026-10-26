import { useSyncExternalStore } from 'react'
import { PARAMS } from '../lib/params'
import { isPageCurrent, SHELL_QUERY_MESSAGE, sitePath } from '../sw/rules'

/**
 * Nouvelle version prête. Le worker d'un nouveau déploiement prend la main tout de suite (skipWaiting, clients.claim),
 * mais la page ouverte garde l'ancien code, et ses écrans chargés à la demande ont été purgés du cache : il faut
 * recharger. Dans l'appli installée, ni barre d'adresse ni bouton du navigateur : le site propose RECHARGER.
 *
 * Lu au chargement du module : une page ouverte sans worker (première visite) voit le sien prendre la main une
 * première fois, sans nouvelle version ; seuls les changements suivants en annoncent une. Pages servies réseau
 * d'abord : la page ouverte a souvent déjà le nouveau code ; on demande sa coquille au nouveau worker (isPageCurrent).
 */
const container = typeof navigator !== 'undefined' && !PARAMS.frame ? navigator.serviceWorker : undefined
let controlled = !!container?.controller
let ready = false
const listeners = new Set<() => void>()

/** Délai d'attente de la réponse du worker ; sans réponse (worker de secours), le bouton est proposé. */
const SHELL_REPLY_TIMEOUT_MS = 3000

/**
 * Scripts et styles de la page affichée, en chemins relatifs au site (comme la coquille du worker). Relevés au chargement
 * du module : un écran chargé plus tard peut ajouter une feuille de style absente de la coquille sans rendre la page périmée.
 */
function pageFiles(): string[] {
  const base = new URL('./', location.href)
  const scope = { origin: base.origin, path: base.pathname }
  const urls = [
    ...[...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map(e => e.src),
    ...[...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')].map(e => e.href),
  ]
  return urls.flatMap(u => { const p = sitePath(u, scope); return p === null ? [] : [p] })
}
const PAGE_FILES = container ? pageFiles() : []

/** Coquille du worker qui contrôle la page, ou null s'il ne répond pas à temps. */
function askShell(sw: ServiceWorker | null): Promise<string[] | null> {
  if (!sw) return Promise.resolve(null)
  return new Promise(resolve => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(null), SHELL_REPLY_TIMEOUT_MS)
    channel.port1.onmessage = e => {
      clearTimeout(timer)
      resolve(Array.isArray(e.data) ? e.data.filter((p): p is string => typeof p === 'string') : null)
    }
    sw.postMessage({ type: SHELL_QUERY_MESSAGE }, [channel.port2])
  })
}

function announce(): void {
  if (ready) return
  ready = true
  listeners.forEach(l => l())
}

container?.addEventListener('controllerchange', () => {
  const wasControlled = controlled
  controlled = true
  if (!wasControlled || ready) return
  void askShell(container.controller).then(shell => { if (!shell || !isPageCurrent(PAGE_FILES, shell)) announce() })
})

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
const snapshot = (): boolean => ready
const reload = (): void => location.reload()

export interface SwUpdate { ready: boolean; reload(): void }

export function useSwUpdate(): SwUpdate {
  return { ready: useSyncExternalStore(subscribe, snapshot), reload }
}
