import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DocPage } from '../lib/docPage'
import { EMPTY_PAGES, fetchDocPage, listPublishedPageIds, readPagesCache, writePagesCache, type PagesCache } from '../lib/docPagesApi'

export interface DocPages {
  /** Documents dont la page de révision est publiée (copie locale hors réseau). */
  ids: ReadonlySet<number>
  page(id: number): DocPage | null
  /** Recharge la page depuis la base ; renvoie false si elle est absente ou injoignable (la copie locale reste). */
  load(id: number): Promise<boolean>
}

function store(): Storage | null {
  try { return window.localStorage } catch { return null }
}

/** Pages de révision des documents (2026-10-18), pour la personne connectée `userId`. */
export function useDocPages(userId: string | null, online: boolean): DocPages {
  const [cache, setCache] = useState<PagesCache>(EMPTY_PAGES)

  const update = useCallback((f: (c: PagesCache) => PagesCache) => {
    setCache(c => {
      const next = f(c)
      if (userId) writePagesCache(store(), userId, next)
      return next
    })
  }, [userId])

  useEffect(() => {
    setCache(userId ? readPagesCache(store(), userId) : EMPTY_PAGES)
    if (!userId || !online) return
    let alive = true
    listPublishedPageIds().then(ids => {
      if (!alive) return
      // Pages dépubliées : retirées de la copie locale.
      update(c => ({ ids, pages: Object.fromEntries(Object.entries(c.pages).filter(([k]) => ids.includes(Number(k)))) }))
    }, err => console.error('[xxb] Pages de révision : liste injoignable', err))
    return () => { alive = false }
  }, [userId, online, update])

  const load = useCallback(async (id: number): Promise<boolean> => {
    try {
      const page = await fetchDocPage(id)
      if (!page) return false
      update(c => ({ ids: c.ids.includes(id) ? c.ids : [...c.ids, id], pages: { ...c.pages, [id]: page } }))
      return true
    } catch (err) {
      console.error('[xxb] Page de révision injoignable', err)
      return false
    }
  }, [update])

  const ids = useMemo(() => new Set(cache.ids), [cache.ids])
  return { ids, page: id => cache.pages[id] ?? null, load }
}
