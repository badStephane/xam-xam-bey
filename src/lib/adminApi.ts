import { checkUpload, newCardId, storagePathFor } from './cardRules'
import { openPdf } from './pdf'
import { supabase } from './supabase'
import type { CardRow, CardStatus, DocumentRow, Qcm } from './types'

const BUCKET = 'documents'
/** Colonnes lisibles de la table documents (created_by reste privé). */
const DOCUMENT_COLUMNS = 'id, zone, title, folder, file_name, storage_path, size, pages, essential, scan'

function client() {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  return supabase
}

/** Message lisible pour une erreur Supabase (droits refusés, contrainte, réseau). */
export function adminError(err: unknown): string {
  const e = err as { message?: string; code?: string; statusCode?: string }
  if (e?.code === '42501' || /row-level security|permission denied|Unauthorized/i.test(e?.message || '')) return 'Action refusée : votre compte n’est pas administrateur.'
  if (e?.code === '23505') return 'Cet élément existe déjà.'
  if (e?.code === '23514') return 'Une valeur ne respecte pas les règles (longueur, format ou zone).'
  return e?.message || 'Erreur inconnue. Vérifiez la connexion et réessayez.'
}

export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await client().rpc('is_admin')
  if (error) { console.error('[xxb] Vérification admin impossible', error); return false }
  return data === true
}

async function countPages(file: File): Promise<number | null> {
  try {
    const { doc, cancel } = await openPdf(await file.arrayBuffer())
    const n = doc.numPages
    cancel()
    return n
  } catch (err) {
    console.error('[xxb] Lecture du PDF impossible', err)
    return null
  }
}

export interface DocumentMeta { title: string; zone: number; folder: string; essential: boolean }

/** Envoie un PDF puis l'enregistre au catalogue ; si l'enregistrement échoue, le fichier envoyé est retiré. */
export async function uploadDocument(file: File, meta: DocumentMeta): Promise<DocumentRow> {
  const invalid = checkUpload(file)
  if (invalid) throw new Error(invalid)
  const pages = await countPages(file)
  if (pages === null) throw new Error('Ce fichier n’est pas un PDF lisible.')
  const db = client()
  const path = storagePathFor(file.name)
  const up = await db.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false, cacheControl: '604800' })
  if (up.error) throw new Error(adminError(up.error))
  const { data, error } = await db.from('documents').insert({
    zone: meta.zone, title: meta.title.trim(), folder: meta.folder.trim(), file_name: file.name, storage_path: path,
    size: file.size, pages, essential: meta.essential, scan: false,
  }).select(DOCUMENT_COLUMNS).single()
  if (error) {
    const cleanup = await db.storage.from(BUCKET).remove([path])
    if (cleanup.error) console.error('[xxb] Fichier orphelin à supprimer à la main :', path, cleanup.error)
    throw new Error(adminError(error))
  }
  return data as DocumentRow
}

export async function updateDocument(id: number, meta: DocumentMeta): Promise<void> {
  const { error } = await client().from('documents').update({ title: meta.title.trim(), zone: meta.zone, folder: meta.folder.trim(), essential: meta.essential }).eq('id', id)
  if (error) throw new Error(adminError(error))
}

/** Retire un document du catalogue puis son fichier ; ses questions restent, sans document lié. */
export async function deleteDocument(id: number, storagePath: string): Promise<void> {
  const db = client()
  const { error } = await db.from('documents').delete().eq('id', id)
  if (error) throw new Error(adminError(error))
  const rm = await db.storage.from(BUCKET).remove([storagePath])
  if (rm.error) console.error('[xxb] Fichier à supprimer à la main :', storagePath, rm.error)
}

const CARD_COLUMNS = 'id, zone, document_id, position, q, a, src, note, qcm, status'

export async function listCards(zone: number): Promise<CardRow[]> {
  const { data, error } = await client().from('cards').select(CARD_COLUMNS).eq('zone', zone).order('position')
  if (error) throw new Error(adminError(error))
  return (data || []) as CardRow[]
}

export interface CardInput { zone: number; documentId: number | null; src: string; q: string; a: string; note: string; qcm: Qcm; status: CardStatus }

/** Crée (id absent) ou met à jour une question ; une nouvelle question va en fin de zone. */
export async function saveCard(id: string | null, input: CardInput): Promise<CardRow> {
  const db = client()
  const fields = {
    zone: input.zone, document_id: input.documentId, src: input.src.trim(), q: input.q.trim(), a: input.a.trim(), note: input.note.trim(),
    qcm: { ok: input.qcm.ok.trim(), no: input.qcm.no.map(x => x.trim()) }, status: input.status,
  }
  if (id) {
    const { data, error } = await db.from('cards').update(fields).eq('id', id).select(CARD_COLUMNS).single()
    if (error) throw new Error(adminError(error))
    return data as CardRow
  }
  const last = await db.from('cards').select('position').eq('zone', input.zone).order('position', { ascending: false }).limit(1)
  if (last.error) throw new Error(adminError(last.error))
  const position = (last.data?.[0]?.position ?? 0) + 1
  const { data, error } = await db.from('cards').insert({ id: newCardId(input.zone), position, ...fields }).select(CARD_COLUMNS).single()
  if (error) throw new Error(adminError(error))
  return data as CardRow
}

export async function setCardStatus(id: string, status: CardStatus): Promise<void> {
  const { error } = await client().from('cards').update({ status }).eq('id', id)
  if (error) throw new Error(adminError(error))
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await client().from('cards').delete().eq('id', id)
  if (error) throw new Error(adminError(error))
}
