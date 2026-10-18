import { adminError, NOTHING_CHANGED } from './adminApi'
import type { DocPage } from './docPage'
import { client } from './docPagesApi'
import type { CardStatus } from './types'

/* Admin. */
export interface PageRow { document_id: number; status: CardStatus; data: unknown; updated_at: string }

export async function listPageRows(): Promise<PageRow[]> {
  const { data, error } = await client().from('doc_pages').select('document_id, status, data, updated_at').order('document_id')
  if (error) throw new Error(adminError(error))
  return (data || []) as PageRow[]
}

export async function savePage(docId: number, page: DocPage, status: CardStatus): Promise<void> {
  const { data, error } = await client().from('doc_pages').upsert({ document_id: docId, data: page, status }).select('document_id')
  if (error) throw new Error(adminError(error))
  if (!data?.length) throw new Error(NOTHING_CHANGED)
}

export async function deletePage(docId: number): Promise<void> {
  const { data, error } = await client().from('doc_pages').delete().eq('document_id', docId).select('document_id')
  if (error) throw new Error(adminError(error))
  if (!data?.length) throw new Error(NOTHING_CHANGED)
}

/** Pages importées, toutes en brouillon, en une requête (rien n'est écrit si une ligne est refusée). */
export async function insertPages(rows: ReadonlyArray<{ docId: number; page: DocPage }>): Promise<number> {
  if (!rows.length) return 0
  const { data, error } = await client().from('doc_pages')
    .insert(rows.map(r => ({ document_id: r.docId, data: r.page, status: 'draft' }))).select('document_id')
  if (error) throw new Error(adminError(error))
  return data?.length ?? 0
}

/** Publie d'un coup les brouillons désignés (bouton « Publier les brouillons de la zone ») ; renvoie le nombre publié. */
export async function publishPages(docIds: readonly number[]): Promise<number> {
  if (!docIds.length) return 0
  const { data, error } = await client().from('doc_pages').update({ status: 'published' })
    .in('document_id', [...docIds]).eq('status', 'draft').select('document_id')
  if (error) throw new Error(adminError(error))
  if (!data?.length) throw new Error(NOTHING_CHANGED)
  return data.length
}
