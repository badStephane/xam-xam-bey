import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DocPage } from '../lib/docPage'
import { EMPTY_PAGES, fetchDocPage, listPublishedPageIds, readPagesCache, writePagesCache, type PagesCache } from '../lib/docPagesApi'

/** Résultat d'un rechargement : page reçue, absente (ou dépubliée), ou base injoignable. */
export type PageLoad = 'ok' | 'missing' | 'error'

export interface DocPages {
  /** Documents dont la page de révision est publiée (copie locale hors réseau). */
  ids: ReadonlySet<number>
  page(id: number): DocPage | null
  /** Recharge la page depuis la base. Absente : retirée de la copie locale. Erreur : la copie locale reste. */
  load(id: number): Promise<PageLoad>
}

function store(): Storage | null {
  try { return window.localStorage } catch { return null }
}

const without = (c: PagesCache, id: number): PagesCache =>
  ({ ids: c.ids.filter(x => x !== id), pages: Object.fromEntries(Object.entries(c.pages).filter(([k]) => Number(k) !== id)) })

/** Pages de révision des documents (2026-10-18), pour la personne connectée `userId`. */
export function useDocPages(userId: string | null, online: boolean): DocPages {
  // `owner` : compte auquel appartient `cache` ; une réponse arrivée après un changement de compte est ignorée.
  const [state, setState] = useState<{ owner: string | null; cache: PagesCache }>({ owner: null, cache: EMPTY_PAGES })
  const userRef = useRef(userId)
  userRef.current = userId

  const update = useCallback((owner: string, f: (c: PagesCache) => PagesCache) => {
    if (userRef.current !== owner) return
    setState(s => (s.owner === owner ? { owner, cache: f(s.cache) } : s))
  }, [])

  // Copie locale écrite après chaque changement, jamais pendant la mise à jour de l'état.
  useEffect(() => {
    if (state.owner) writePagesCache(store(), state.owner, state.cache)
  }, [state])

  useEffect(() => {
    setState({ owner: userId, cache: userId ? readPagesCache(store(), userId) : EMPTY_PAGES })
    if (!userId || !online) return
    let alive = true
    listPublishedPageIds().then(ids => {
      // Pages dépubliées : retirées de la copie locale.
      if (alive) update(userId, c => ({ ids, pages: Object.fromEntries(Object.entries(c.pages).filter(([k]) => ids.includes(Number(k)))) }))
    }, err => console.error('[xxb] Pages de révision : liste injoignable', err))
    return () => { alive = false }
  }, [userId, online, update])

  const load = useCallback(async (id: number): Promise<PageLoad> => {
    const owner = userRef.current
    if (!owner) return 'error'
    try {
      const page = await fetchDocPage(id)
      if (!page) { update(owner, c => without(c, id)); return 'missing' }
      update(owner, c => ({ ids: c.ids.includes(id) ? c.ids : [...c.ids, id], pages: { ...c.pages, [id]: page } }))
      return 'ok'
    } catch (err) {
      console.error('[xxb] Page de révision injoignable', err)
      return 'error'
    }
  }, [update])

  const cache = state.owner === userId ? state.cache : EMPTY_PAGES
  const ids = useMemo(() => new Set(cache.ids), [cache.ids])
  return { ids, page: id => cache.pages[id] ?? null, load }
}
