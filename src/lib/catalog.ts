import { TYPE_BY_EXT } from './constants'
import { cleanTitle, norm, p3 } from './format'
import type { Doc, RawDoc, TypeFilter } from './types'

/** Transforme le catalogue compact en pièces affichables (doublons retirés, cotes Zn·NNN). */
export function buildDocs(raw: readonly RawDoc[]): Doc[] {
  const perZone: Record<number, number> = {}
  return raw.map((it, i) => {
    perZone[it.th] = (perZone[it.th] || 0) + 1
    const cote = `Z${it.th}·${p3(perZone[it.th])}`
    return {
      doc: {
        id: i + 1, th: it.th, title: cleanTitle(it.t), folder: it.p, ty: TYPE_BY_EXT[it.e] || 'PDF',
        ess: !!it.es, scan: !!it.x, pages: it.g ?? null, size: it.s, file: `f/${it.f}`, cote,
        key: norm(`${it.t} ${it.p} ${cote}`),
      },
      dup: !!it.d,
    }
  }).filter(x => !x.dup).map(x => x.doc)
}

export interface LibFilters {
  q: string
  type: TypeFilter
  ess: boolean
  month: number | null
}

export const isFiltering = (f: LibFilters): boolean => !!f.q.trim() || f.type !== 'all' || f.ess || f.month !== null

export function matchDoc(d: Doc, f: LibFilters, skipZone = false): boolean {
  if (!skipZone && f.month !== null && d.th !== f.month) return false
  if (f.type !== 'all' && d.ty !== f.type) return false
  if (f.ess && !d.ess) return false
  return norm(f.q).split(/\s+/).filter(Boolean).every(part => d.key.includes(part))
}

export function zoneCounts(docs: readonly Doc[], f: LibFilters): Record<number, number> {
  return docs.reduce<Record<number, number>>((acc, d) => (matchDoc(d, f, true) ? { ...acc, [d.th]: (acc[d.th] || 0) + 1 } : acc), {})
}
