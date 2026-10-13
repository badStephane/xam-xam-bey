import { useEffect, useState } from 'react'
import type { ConnectionHint } from '../lib/openMode'
import { KEEP_PDF_MESSAGE, PDF_CACHE, PDF_CACHED_MESSAGE } from '../sw/rules'

export interface OfflineDocs {
  /** Vrai si un service worker contrôle la page : les PDF ouverts sont gardés sur l'appareil. */
  active: boolean
  /** Adresses absolues des PDF gardés. */
  urls: ReadonlySet<string>
}

const EMPTY: ReadonlySet<string> = new Set()
export const isSwControlling = (): boolean => typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller

/** Adresse absolue, telle que le service worker la range dans le cache. */
export const absoluteUrl = (u: string): string => new URL(u, location.href).href

async function readKept(): Promise<ReadonlySet<string>> {
  if (typeof caches === 'undefined' || !(await caches.has(PDF_CACHE))) return EMPTY
  const keys = await (await caches.open(PDF_CACHE)).keys()
  return new Set(keys.map(k => k.url))
}

/** PDF gardés hors ligne par le service worker, mis à jour à chaque nouveau PDF gardé. */
export function useOfflineDocs(): OfflineDocs {
  const [active, setActive] = useState(isSwControlling)
  const [urls, setUrls] = useState<ReadonlySet<string>>(EMPTY)
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
    if (!sw) return
    let alive = true
    const refresh = (): void => {
      setActive(isSwControlling())
      readKept().then(s => { if (alive) setUrls(s) }, () => undefined)
    }
    const onMessage = (e: MessageEvent): void => { if ((e.data as { type?: string } | null)?.type === PDF_CACHED_MESSAGE) refresh() }
    refresh()
    sw.addEventListener('controllerchange', refresh)
    sw.addEventListener('message', onMessage)
    return () => {
      alive = false
      sw.removeEventListener('controllerchange', refresh)
      sw.removeEventListener('message', onMessage)
    }
  }, [])
  return { active, urls }
}

/** Demande au service worker de garder un PDF (ouverture dans le lecteur du téléphone, que le worker ne voit pas). */
export function askWorkerToKeep(url: string): void {
  navigator.serviceWorker?.controller?.postMessage({ type: KEEP_PDF_MESSAGE, url: absoluteUrl(url) })
}

/** Indications de réseau du navigateur (Chrome Android) ; absentes ailleurs. */
export const connectionHint = (): ConnectionHint | undefined =>
  (navigator as Navigator & { connection?: ConnectionHint }).connection
