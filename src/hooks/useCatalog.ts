import { useCallback, useEffect, useMemo, useState } from 'react'
import { docsFromRows } from '../lib/catalog'
import { BUNDLED_ROWS } from '../lib/docs'
import { loadPref, savePref } from '../lib/storage'
import { storageUrls, supabase } from '../lib/supabase'
import type { Doc, DocumentRow } from '../lib/types'

export type CatalogStatus = 'loading' | 'ready' | 'cached' | 'bundled'
const CACHE_KEY = 'catalog'
const COLUMNS = 'id, zone, title, folder, file_name, storage_path, size, pages, essential, scan'

/**
 * Catalogue de la bibliothèque lu dans la table documents.
 * Hors réseau : dernière copie gardée sur l'appareil, sinon le catalogue intégré au site.
 */
export function useCatalog(): { docs: Doc[]; status: CatalogStatus; reload(): Promise<void> } {
  const cached = loadPref<DocumentRow[] | null>(CACHE_KEY, null)
  const [rows, setRows] = useState<DocumentRow[]>(cached?.length ? cached : BUNDLED_ROWS)
  const [status, setStatus] = useState<CatalogStatus>('loading')

  const reload = useCallback(async () => {
    if (!supabase) { setStatus('bundled'); return }
    const { data, error } = await supabase.from('documents').select(COLUMNS).order('zone').order('id')
    if (error || !data?.length) {
      if (error) console.error('[xxb] Catalogue indisponible', error)
      setStatus(loadPref<DocumentRow[] | null>(CACHE_KEY, null)?.length ? 'cached' : 'bundled')
      return
    }
    setRows(data as DocumentRow[])
    savePref(CACHE_KEY, data)
    setStatus('ready')
  }, [])

  useEffect(() => { void reload() }, [reload])
  const docs = useMemo(() => docsFromRows(rows, storageUrls), [rows])
  return { docs, status, reload }
}
