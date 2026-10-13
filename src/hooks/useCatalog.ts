import { useCallback, useEffect, useMemo, useState } from 'react'
import { CACHE_KEYS, LEGACY_KEYS, parseRows } from '../lib/cache'
import { docsFromRows } from '../lib/catalog'
import { BUNDLED_ROWS } from '../lib/docs'
import { loadPref, savePref } from '../lib/storage'
import { storageUrls, supabase } from '../lib/supabase'
import type { Doc, DocumentRow } from '../lib/types'

export type CatalogStatus = 'loading' | 'ready' | 'cached' | 'bundled'
const COLUMNS = 'id, zone, title, folder, file_name, storage_path, size, pages, essential, scan'

/** Dernière copie valide gardée sur l'appareil (null si absente ou d'une forme inattendue). */
const readCache = (): DocumentRow[] | null => loadPref(CACHE_KEYS.catalog, parseRows, null, LEGACY_KEYS.catalog)

/**
 * Catalogue de la bibliothèque lu dans la table documents.
 * Hors réseau : dernière copie valide gardée sur l'appareil, sinon le catalogue intégré au site.
 * Toute ligne invalide (cache ancien, réponse inattendue) fait retomber sur le repli au lieu d'une page blanche (FE-3).
 */
export function useCatalog(): { docs: Doc[]; status: CatalogStatus; reload(): Promise<void> } {
  const [rows, setRows] = useState<DocumentRow[]>(() => readCache() ?? BUNDLED_ROWS)
  const [status, setStatus] = useState<CatalogStatus>('loading')

  const reload = useCallback(async () => {
    if (!supabase) { setStatus('bundled'); return }
    const { data, error } = await supabase.from('documents').select(COLUMNS).order('zone').order('id')
    const fresh = error ? null : parseRows(data)
    if (!fresh) {
      if (error) console.error('[xxb] Catalogue indisponible', error)
      else if (data?.length) console.error('[xxb] Catalogue reçu d’une forme inattendue : repli')
      setStatus(readCache() ? 'cached' : 'bundled')
      return
    }
    setRows(fresh)
    savePref(CACHE_KEYS.catalog, fresh)
    setStatus('ready')
  }, [])

  useEffect(() => { void reload() }, [reload])
  const docs = useMemo(() => docsFromRows(rows, storageUrls), [rows])
  return { docs, status, reload }
}
