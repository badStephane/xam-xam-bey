import { buildDocIndex, docIdOf, linkDocument, type DocLink, type ImportDocument } from './cardImportDocs'
import { newCardId, readQcm, type QcmRead } from './cardRules'
import { p2 } from './format'
import type { Qcm } from './types'

/** Import de questions depuis un classeur .xlsx (logique pure : en-têtes, validation, doublons, positions). */

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_IMPORT_ROWS = 1000
export const ZONE_MIN = 1
export const ZONE_MAX = 12

export type ImportField = 'zone' | 'q' | 'a' | 'ok' | 'no1' | 'no2' | 'no3' | 'src' | 'note' | 'tier'

/** En-têtes du modèle, dans l'ordre des colonnes. Garder aligné avec scripts/make_import_xlsx.py. */
export const IMPORT_HEADERS: ReadonlyArray<readonly [ImportField, string]> = [
  ['zone', 'Zone'], ['q', 'Question'], ['a', 'Réponse'], ['ok', 'Bonne proposition'],
  ['no1', 'Mauvaise 1'], ['no2', 'Mauvaise 2'], ['no3', 'Mauvaise 3'], ['src', 'Source'], ['note', 'Note'], ['tier', 'Palier'],
]
const REQUIRED_FIELDS: readonly ImportField[] = ['zone', 'q', 'a']

export const REASONS = {
  zone: (raw: string) => (raw ? `Zone invalide (« ${raw} ») : un nombre entier de 1 à 12.` : 'Zone vide : un nombre entier de 1 à 12.'),
  q: 'Question vide.',
  a: 'Réponse vide.',
  tier: (raw: string) => `Palier invalide (« ${raw} ») : 1, 2 ou 3, ou vide pour 1.`,
  inFile: (line: number) => `Doublon de la ligne ${line} du fichier.`,
  inBase: (zone: number) => `Doublon : la zone ${p2(zone)} contient déjà cette question.`,
} as const

/** Ligne de données lue sous les en-têtes ; `line` est le numéro de ligne affiché par Excel. */
export interface SheetRow { line: number; values: Readonly<Record<ImportField, string>> }
export type SheetParse = { ok: true; rows: SheetRow[] } | { ok: false; error: string }

/** `doc` : document de la zone relié par la colonne Source (E4). */
export interface ImportCard { line: number; zone: number; q: string; a: string; src: string; note: string; qcm: Qcm | null; doc: DocLink; tier: number }
export interface RowError { line: number; zone: number | null; reason: string }
export interface ZoneCount { zone: number | null; valid: number; errors: number }
export interface ImportAnalysis { cards: ImportCard[]; errors: RowError[]; byZone: ZoneCount[] }
/** Question déjà en base, lue pour les doublons, la fin de zone et les identifiants pris. */
export interface ExistingCard { id: string; zone: number; q: string; position: number }
export interface CardInsert {
  id: string; zone: number; position: number; q: string; a: string; src: string; note: string
  qcm: Qcm | null; status: 'draft'; document_id: number | null; tier: number
}

/** Nom de fichier, taille : refus clair avant toute lecture. */
export function checkImportFile(file: { name: string; size: number }): string | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xls')) return 'Ancien format Excel (.xls) : ouvrez le fichier dans Excel et enregistrez-le au format .xlsx.'
  if (name.endsWith('.csv')) return 'Fichier CSV : ouvrez-le dans Excel et enregistrez-le au format .xlsx, ou partez du modèle.'
  if (!name.endsWith('.xlsx')) return 'Choisissez un classeur Excel au format .xlsx.'
  if (file.size <= 0) return 'Le fichier est vide.'
  if (file.size > MAX_IMPORT_BYTES) return 'Le fichier dépasse 2 Mo. Découpez-le en plusieurs classeurs.'
  return null
}

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** En-tête comparable : sans accents, en minuscules, espaces réduits. */
export const normalizeHeader = (s: string): string => stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim()

/** Clé de doublon : casse, espaces et ponctuation finale ignorés (les accents comptent). */
export function questionKey(q: string): string {
  return q.replace(/[’‘]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim().replace(/[\s?!.…:;,]+$/u, '')
}

/** Valeur de cellule en texte : nombres et booléens tels qu'affichés, dates en AAAA-MM-JJ. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  return String(v).trim()
}

const isEmptyRow = (row: ReadonlyArray<unknown>): boolean => row.every(v => cellText(v) === '')

const HEADER_BY_KEY = new Map(IMPORT_HEADERS.map(([field, label]) => [normalizeHeader(label), field]))

/** Colonne de chaque champ connu ; la première occurrence l'emporte, les colonnes inconnues sont ignorées. */
export function matchHeaders(header: ReadonlyArray<unknown>): { ok: true; columns: Partial<Record<ImportField, number>> } | { ok: false; error: string } {
  const columns = header.reduce<Partial<Record<ImportField, number>>>((acc, cell, i) => {
    const field = HEADER_BY_KEY.get(normalizeHeader(cellText(cell)))
    return field && acc[field] === undefined ? { ...acc, [field]: i } : acc
  }, {})
  const missing = REQUIRED_FIELDS.filter(f => columns[f] === undefined)
  if (!missing.length) return { ok: true, columns }
  const labels = missing.map(f => IMPORT_HEADERS.find(([k]) => k === f)?.[1]).join(', ')
  return { ok: false, error: `Colonnes obligatoires introuvables : ${labels}. Seule la première feuille du classeur est lue ; sa première ligne doit porter les en-têtes du modèle.` }
}

/**
 * Lit la feuille : la première ligne non vide porte les en-têtes, les lignes vides sont ignorées
 * sans décaler la numérotation (index 0 de la feuille = ligne 1 d'Excel).
 */
export function readSheetRows(sheet: ReadonlyArray<ReadonlyArray<unknown>>): SheetParse {
  const headerIndex = sheet.findIndex(row => !isEmptyRow(row))
  if (headerIndex < 0) return { ok: false, error: 'La première feuille du classeur est vide. Partez du modèle.' }
  const match = matchHeaders(sheet[headerIndex])
  if (!match.ok) return match
  const { columns } = match
  // IM-3 : une ligne vide dans les colonnes reconnues est ignorée, même si une colonne inconnue est remplie.
  const rows = sheet.slice(headerIndex + 1).flatMap((row, i): SheetRow[] => {
    const values = Object.fromEntries(IMPORT_HEADERS.map(([field]) => {
      const col = columns[field]
      return [field, col === undefined ? '' : cellText(row[col])]
    })) as Record<ImportField, string>
    return Object.values(values).every(v => v === '') ? [] : [{ line: headerIndex + i + 2, values }]
  })
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: `Le fichier contient ${rows.length} lignes de questions : 1 000 au plus par import. Découpez-le.` }
  return { ok: true, rows }
}

/** Zone entière de 1 à 12 (nombre ou texte « 3 »), sinon null. */
export function parseZone(raw: string): number | null {
  if (!/^\d+(\.0+)?$/.test(raw)) return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= ZONE_MIN && n <= ZONE_MAX ? n : null
}

/** Palier facultatif : vide = 1 ; sinon entier de 1 à 3 (nombre ou texte), sinon null. */
export function parseTier(raw: string): number | null {
  if (!raw) return 1
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : null
}

/** QCM de la ligne, selon la règle partagée avec l'éditeur (readQcm). */
export const rowQcm = (v: Readonly<Record<ImportField, string>>): QcmRead => readQcm(v.ok, [v.no1, v.no2, v.no3])

/** Zones valides citées par le fichier : seules leurs questions existantes sont lues en base. */
export function zonesOf(rows: readonly SheetRow[]): number[] {
  return [...new Set(rows.map(r => parseZone(r.values.zone)).filter((z): z is number => z !== null))].sort((a, b) => a - b)
}

function fieldErrors(v: Readonly<Record<ImportField, string>>, zone: number | null, qcm: QcmRead): string[] {
  return [
    zone === null ? REASONS.zone(v.zone) : null,
    v.q ? null : REASONS.q,
    v.a ? null : REASONS.a,
    parseTier(v.tier) === null ? REASONS.tier(v.tier) : null,
    qcm.ok ? null : qcm.error,
  ].filter((x): x is string => x !== null)
}

function countByZone(cards: readonly ImportCard[], errors: readonly RowError[]): ZoneCount[] {
  const zones = [...new Set([...cards.map(c => c.zone), ...errors.map(e => e.zone)])]
  return zones
    .sort((a, b) => (a ?? Infinity) - (b ?? Infinity))
    .map(zone => ({ zone, valid: cards.filter(c => c.zone === zone).length, errors: errors.filter(e => e.zone === zone).length }))
}

/**
 * Valide chaque ligne ; les doublons (dans le fichier, puis avec la base de la même zone) sont écartés et signalés.
 * Chaque ligne retenue est reliée au document de sa zone désigné par la colonne Source, s'il est unique (E4).
 */
export function analyzeImport(rows: readonly SheetRow[], existing: readonly ExistingCard[], docs: readonly ImportDocument[] = []): ImportAnalysis {
  const inBase = new Set(existing.map(c => `${c.zone}|${questionKey(c.q)}`))
  const docIndex = buildDocIndex(docs)
  type Acc = { cards: ImportCard[]; errors: RowError[]; seen: ReadonlyMap<string, number> }
  const out = rows.reduce<Acc>((acc, { line, values: v }) => {
    const zone = parseZone(v.zone)
    const qcm = rowQcm(v)
    const reasons = fieldErrors(v, zone, qcm)
    if (reasons.length || zone === null || !qcm.ok) return { ...acc, errors: [...acc.errors, { line, zone, reason: reasons.join(' ') }] }
    const key = `${zone}|${questionKey(v.q)}`
    const first = acc.seen.get(key)
    if (first !== undefined) return { ...acc, errors: [...acc.errors, { line, zone, reason: REASONS.inFile(first) }] }
    if (inBase.has(key)) return { ...acc, errors: [...acc.errors, { line, zone, reason: REASONS.inBase(zone) }] }
    const card: ImportCard = { line, zone, q: v.q, a: v.a, src: v.src, note: v.note, qcm: qcm.qcm, doc: linkDocument(v.src, zone, docIndex), tier: parseTier(v.tier) ?? 1 }
    return { cards: [...acc.cards, card], errors: acc.errors, seen: new Map([...acc.seen, [key, line]]) }
  }, { cards: [], errors: [], seen: new Map() })
  return { cards: out.cards, errors: out.errors, byZone: countByZone(out.cards, out.errors) }
}

/** Lignes à insérer : brouillons en fin de zone (max + 1, + 2…), identifiants neufs et uniques. */
export function planInserts(cards: readonly ImportCard[], existing: readonly ExistingCard[], rand: () => number = Math.random): CardInsert[] {
  const maxPos = existing.reduce<Readonly<Record<number, number>>>((acc, c) => ({ ...acc, [c.zone]: Math.max(acc[c.zone] ?? 0, c.position) }), {})
  type Acc = { rows: CardInsert[]; taken: ReadonlySet<string>; next: Readonly<Record<number, number>> }
  return cards.reduce<Acc>((acc, c) => {
    const id = freshId(c.zone, acc.taken, rand)
    const position = (acc.next[c.zone] ?? maxPos[c.zone] ?? 0) + 1
    const row: CardInsert = { id, zone: c.zone, position, q: c.q, a: c.a, src: c.src, note: c.note, qcm: c.qcm, status: 'draft', document_id: docIdOf(c.doc), tier: c.tier }
    return { rows: [...acc.rows, row], taken: new Set([...acc.taken, id]), next: { ...acc.next, [c.zone]: position } }
  }, { rows: [], taken: new Set(existing.map(c => c.id)), next: {} }).rows
}

const MAX_ID_TRIES = 20
function freshId(zone: number, taken: ReadonlySet<string>, rand: () => number, tries = MAX_ID_TRIES): string {
  if (tries <= 0) throw new Error('Impossible de créer un identifiant de question unique. Réessayez.')
  const id = newCardId(zone, rand)
  return taken.has(id) ? freshId(zone, taken, rand, tries - 1) : id
}

/** Message de fin : nombre importé et zones touchées. */
export function importDoneMessage(rows: readonly Pick<CardInsert, 'zone'>[]): string {
  const zones = [...new Set(rows.map(r => r.zone))].sort((a, b) => a - b).map(p2)
  const n = rows.length
  const what = n > 1 ? `${n} questions importées` : '1 question importée'
  return `${what} en brouillon dans ${zones.length > 1 ? 'les zones' : 'la zone'} ${zones.join(', ')}.`
}
