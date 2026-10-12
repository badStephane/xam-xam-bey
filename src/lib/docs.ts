import raw from '../../data/catalog.site.json'
import { rowsFromCatalog } from './catalog'
import type { DocumentRow, RawDoc } from './types'

/** Catalogue intégré au site : repli si la base ne répond pas et qu'aucune copie locale n'existe. */
export const BUNDLED_ROWS: DocumentRow[] = rowsFromCatalog(raw as RawDoc[])
