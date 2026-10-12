import raw from '../../data/catalog.site.json'
import { buildDocs } from './catalog'
import type { Doc, RawDoc } from './types'

export const DOCS: Doc[] = buildDocs(raw as RawDoc[])
export const N_ESS = DOCS.filter(d => d.ess).length
export const TOTAL_MO = Math.round(DOCS.reduce((a, d) => a + d.size, 0) / 1e6)
export const docById = (id: number | null): Doc | null => (id === null ? null : DOCS.find(d => d.id === id) || null)
