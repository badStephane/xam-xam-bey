import { TYPE_BY_EXT } from './constants'
import { cleanTitle, norm, p3 } from './format'
import type { Doc, DocumentRow, RawDoc, TypeFilter } from './types'

export interface DocUrls { file(path: string): string; download(path: string, name: string): string }

/** Adresses locales (développement sans stockage) : site/f/<chemin>. */
export const LOCAL_URLS: DocUrls = { file: path => `f/${path}`, download: path => `f/${path}` }

const extOf = (name: string): string => (name.split('.').pop() || '').toLowerCase()

/** Pièces affichables triées par zone puis identifiant, avec cotes Zn·NNN numérotées dans chaque zone. */
export function docsFromRows(rows: readonly DocumentRow[], urls: DocUrls): Doc[] {
  const perZone: Record<number, number> = {}
  return rows.slice().sort((a, b) => a.zone - b.zone || a.id - b.id).map(r => {
    perZone[r.zone] = (perZone[r.zone] || 0) + 1
    const cote = `Z${r.zone}·${p3(perZone[r.zone])}`
    const title = cleanTitle(r.title)
    return {
      id: r.id, th: r.zone, title, folder: r.folder, ty: TYPE_BY_EXT[extOf(r.file_name)] || 'PDF', ess: r.essential, scan: r.scan,
      pages: r.pages, size: r.size, fileName: r.file_name, storagePath: r.storage_path,
      file: urls.file(r.storage_path), download: urls.download(r.storage_path, `${title}.pdf`), cote, key: norm(`${r.title} ${r.folder} ${cote}`),
    }
  })
}

/** Catalogue compact d'origine (data/catalog.site.json) converti en lignes de la table documents, doublons retirés. */
export function rowsFromCatalog(raw: readonly RawDoc[]): DocumentRow[] {
  return raw.flatMap((it, i) => (it.d ? [] : [{
    id: i + 1, zone: it.th, title: it.t, folder: it.p, file_name: it.n || `${it.t}.${it.e}`, storage_path: it.f,
    size: it.s, pages: it.g ?? null, essential: !!it.es, scan: !!it.x,
  }]))
}

/** Compatibilité : catalogue compact vers pièces, adresses locales. */
export const buildDocs = (raw: readonly RawDoc[], urls: DocUrls = LOCAL_URLS): Doc[] => docsFromRows(rowsFromCatalog(raw), urls)

export function catalogStats(docs: readonly Doc[]): { count: number; ess: number; mo: number } {
  return { count: docs.length, ess: docs.filter(d => d.ess).length, mo: Math.round(docs.reduce((a, d) => a + d.size, 0) / 1e6) }
}

export interface LibFilters {
  q: string
  type: TypeFilter
  ess: boolean
  month: number | null
}

export const isFiltering = (f: LibFilters): boolean => !!f.q.trim() || f.type !== 'all' || f.ess || f.month !== null

/** Mots de la recherche, normalisés (casse, accents) une seule fois pour tout le catalogue. */
export const queryParts = (q: string): string[] => norm(q).split(/\s+/).filter(Boolean)

function matchParts(d: Doc, f: LibFilters, parts: readonly string[], skipZone: boolean): boolean {
  if (!skipZone && f.month !== null && d.th !== f.month) return false
  if (f.type !== 'all' && d.ty !== f.type) return false
  if (f.ess && !d.ess) return false
  return parts.every(part => d.key.includes(part))
}

export function matchDoc(d: Doc, f: LibFilters, skipZone = false): boolean {
  return matchParts(d, f, queryParts(f.q), skipZone)
}

/** Pièces retenues par les filtres (recherche normalisée une fois, et non une fois par pièce : audit 23). */
export function filterDocs(docs: readonly Doc[], f: LibFilters): Doc[] {
  const parts = queryParts(f.q)
  return docs.filter(d => matchParts(d, f, parts, false))
}

export function zoneCounts(docs: readonly Doc[], f: LibFilters): Record<number, number> {
  const parts = queryParts(f.q)
  return docs.reduce<Record<number, number>>((acc, d) => (matchParts(d, f, parts, true) ? { ...acc, [d.th]: (acc[d.th] || 0) + 1 } : acc), {})
}
