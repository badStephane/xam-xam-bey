import type { CardInsert, ExistingCard } from './cardImport'
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

/** Message quand la base n'a touché aucune ligne : RLS (compte retiré des admins) ou élément déjà supprimé (BE-5). */
export const NOTHING_CHANGED = 'Action refusée ou élément introuvable : rien n’a été modifié. Rechargez la page ; si cela persiste, vérifiez que votre compte est toujours administrateur.'

/** Message lisible pour une erreur Supabase (droits refusés, contrainte, réseau). */
export function adminError(err: unknown): string {
  const e = err as { message?: string; code?: string; statusCode?: string }
  if (e?.code === '42501' || /row-level security|permission denied|Unauthorized/i.test(e?.message || '')) return 'Action refusée : votre compte n’est pas administrateur.'
  if (e?.code === '23505') return 'Cet élément existe déjà.'
  if (e?.code === '23514') return 'Une valeur ne respecte pas les règles (longueur, format ou zone).'
  if (e?.code === 'PGRST116') return NOTHING_CHANGED
  return e?.message || 'Erreur inconnue. Vérifiez la connexion et réessayez.'
}

/**
 * Une mise à jour ou suppression filtrée par la RLS renvoie 0 ligne sans erreur (QA-5) :
 * on exige au moins une ligne touchée, sinon on lève une erreur visible.
 */
function touchedRows<T>(res: { data: T[] | null; error: unknown }): T[] {
  if (res.error) throw new Error(adminError(res.error))
  if (!res.data?.length) throw new Error(NOTHING_CHANGED)
  return res.data
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

/**
 * Retire un fichier du bucket. Storage renvoie `data: []` sans erreur quand la RLS bloque la suppression :
 * seul « exactement un objet supprimé » vaut succès (contrat lot 1 §3).
 */
async function removeOneFile(path: string): Promise<boolean> {
  const rm = await client().storage.from(BUCKET).remove([path])
  if (rm.error || rm.data?.length !== 1) {
    console.error('[xxb] Fichier non supprimé du bucket :', path, rm.error ?? `${rm.data?.length ?? 0} objet(s) supprimé(s)`)
    return false
  }
  return true
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
    const removed = await removeOneFile(path)
    if (!removed) throw new Error(`${adminError(error)} Le fichier envoyé (${path}) n’a pas pu être retiré : signalez-le à un responsable technique.`)
    throw new Error(adminError(error))
  }
  return data as DocumentRow
}

export async function updateDocument(id: number, meta: DocumentMeta): Promise<void> {
  touchedRows(await client().from('documents').update({ title: meta.title.trim(), zone: meta.zone, folder: meta.folder.trim(), essential: meta.essential }).eq('id', id).select('id'))
}

/** Retire un document du catalogue puis son fichier ; ses questions restent, sans document lié. */
export async function deleteDocument(id: number, storagePath: string): Promise<void> {
  const db = client()
  touchedRows(await db.from('documents').delete().eq('id', id).select('id'))
  const removed = await removeOneFile(storagePath)
  if (!removed) throw new Error(`Le document est retiré du catalogue, mais son fichier (${storagePath}) reste en ligne. Réessayez ou signalez-le à un responsable technique.`)
}

const CARD_COLUMNS = 'id, zone, document_id, position, q, a, src, note, qcm, status'

export async function listCards(zone: number): Promise<CardRow[]> {
  const { data, error } = await client().from('cards').select(CARD_COLUMNS).eq('zone', zone).order('position')
  if (error) throw new Error(adminError(error))
  return (data || []) as CardRow[]
}

/** `qcm` : null pour une question sans QCM (l'application compose alors les propositions). */
export interface CardInput { zone: number; documentId: number | null; src: string; q: string; a: string; note: string; qcm: Qcm | null; status: CardStatus }

/** Crée (id absent) ou met à jour une question ; une nouvelle question va en fin de zone. */
export async function saveCard(id: string | null, input: CardInput): Promise<CardRow> {
  const db = client()
  const fields = {
    zone: input.zone, document_id: input.documentId, src: input.src.trim(), q: input.q.trim(), a: input.a.trim(), note: input.note.trim(),
    qcm: input.qcm ? { ok: input.qcm.ok.trim(), no: input.qcm.no.map(x => x.trim()).filter(Boolean) } : null, status: input.status,
  }
  if (id) {
    const [row] = touchedRows(await db.from('cards').update(fields).eq('id', id).select(CARD_COLUMNS))
    return row as CardRow
  }
  const last = await db.from('cards').select('position').eq('zone', input.zone).order('position', { ascending: false }).limit(1)
  if (last.error) throw new Error(adminError(last.error))
  const position = (last.data?.[0]?.position ?? 0) + 1
  const { data, error } = await db.from('cards').insert({ id: newCardId(input.zone), position, ...fields }).select(CARD_COLUMNS).single()
  if (error) throw new Error(adminError(error))
  return data as CardRow
}

export async function setCardStatus(id: string, status: CardStatus): Promise<void> {
  touchedRows(await client().from('cards').update({ status }).eq('id', id).select('id'))
}

export async function deleteCard(id: string): Promise<void> {
  touchedRows(await client().from('cards').delete().eq('id', id).select('id'))
}

/** Plafond de lignes par réponse de l'API (max_rows de supabase/config.toml) : on pagine au-delà. */
const API_PAGE = 1000

/** Questions existantes (tous statuts) des zones citées par un import : doublons, fin de zone, identifiants pris. */
export async function listCardsForImport(zones: readonly number[]): Promise<ExistingCard[]> {
  if (!zones.length) return []
  const fetchPage = async (from: number, acc: ExistingCard[]): Promise<ExistingCard[]> => {
    const { data, error } = await client().from('cards').select('id, zone, q, position').in('zone', [...zones]).order('id').range(from, from + API_PAGE - 1)
    if (error) throw new Error(adminError(error))
    const rows = [...acc, ...((data || []) as ExistingCard[])]
    return (data?.length ?? 0) < API_PAGE ? rows : fetchPage(from + API_PAGE, rows)
  }
  return fetchPage(0, [])
}

export const UNCERTAIN_IMPORT = 'Résultat incertain : rechargez la liste pour vérifier avant de réimporter.'

/** L'écriture a pu aboutir sans que la réponse arrive (réseau, délai, compte incohérent) : ne jamais annoncer « rien importé » (IM-4). */
export class UncertainWriteError extends Error {}

/**
 * Insère les questions importées en une seule requête (tout ou rien côté base).
 * Succès seulement si la base confirme exactement autant de lignes créées que demandé.
 * Refus certain : la base a répondu avec un code (SQL ou PostgREST), l'instruction est annulée.
 * Sinon (pas de réponse exploitable) : résultat incertain.
 */
export async function insertImportedCards(rows: readonly CardInsert[]): Promise<number> {
  if (!rows.length) throw new Error('Aucune question à importer.')
  const res = await client().from('cards').insert([...rows]).select('id').then(r => r, (err: unknown) => {
    console.error('[xxb] Import : réponse perdue', err)
    throw new UncertainWriteError(UNCERTAIN_IMPORT)
  })
  if (res.error) {
    if (!res.error.code) {
      console.error('[xxb] Import : erreur sans code (réseau ou délai)', res.error)
      throw new UncertainWriteError(UNCERTAIN_IMPORT)
    }
    throw new Error(adminError(res.error))
  }
  const created = res.data?.length ?? 0
  if (created !== rows.length) throw new UncertainWriteError(`La base a confirmé ${created} question(s) sur ${rows.length}. ${UNCERTAIN_IMPORT}`)
  return created
}
