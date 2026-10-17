import { validDocPage, type DocPage } from './docPage'
import { supabase } from './supabase'

/**
 * Pages de révision (table doc_pages). Lecture : pages publiées, pour les personnes connectées (RLS). Écriture : admins.
 * Copie locale par compte (`xxb.pages.v1.<id>`) : liste des pages publiées et pages déjà ouvertes, relues hors réseau.
 */
export const PAGES_KEY_PREFIX = 'xxb.pages.v1.'
export const pagesCacheKey = (userId: string): string => `${PAGES_KEY_PREFIX}${userId}`

export interface PagesCache { ids: number[]; pages: Record<number, DocPage> }
export const EMPTY_PAGES: PagesCache = { ids: [], pages: {} }

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const isId = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0

export function readPagesCache(store: Store | null, userId: string): PagesCache {
  try {
    const raw = JSON.parse(store?.getItem(pagesCacheKey(userId)) || 'null') as { ids?: unknown; pages?: unknown } | null
    if (!raw || !Array.isArray(raw.ids)) return EMPTY_PAGES
    const pages = Object.entries((raw.pages && typeof raw.pages === 'object' ? raw.pages : {}) as Record<string, unknown>)
      .reduce<Record<number, DocPage>>((acc, [k, v]) => {
        const page = validDocPage(v)
        return isId(Number(k)) && page ? { ...acc, [Number(k)]: page } : acc
      }, {})
    return { ids: raw.ids.filter(isId), pages }
  } catch {
    return EMPTY_PAGES
  }
}

export function writePagesCache(store: Store | null, userId: string, c: PagesCache): void {
  try {
    store?.setItem(pagesCacheKey(userId), JSON.stringify(c))
  } catch {
    // Quota dépassé ou stockage bloqué : la copie hors ligne est facultative.
  }
}

export function clearPagesCache(store: Pick<Storage, 'removeItem'> | null, userId: string): void {
  try { store?.removeItem(pagesCacheKey(userId)) } catch { /* stockage bloqué */ }
}

export function client() {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  return supabase
}

/** Documents dont la page est publiée. */
export async function listPublishedPageIds(): Promise<number[]> {
  const { data, error } = await client().from('doc_pages').select('document_id').eq('status', 'published')
  if (error) throw error
  return (data || []).map(r => (r as { document_id: number }).document_id).filter(isId)
}

/** Page publiée (ou brouillon pour un admin) ; null si absente ou mal formée. */
export async function fetchDocPage(docId: number): Promise<DocPage | null> {
  const { data, error } = await client().from('doc_pages').select('data').eq('document_id', docId).maybeSingle()
  if (error) throw error
  return data ? validDocPage((data as { data: unknown }).data) : null
}
