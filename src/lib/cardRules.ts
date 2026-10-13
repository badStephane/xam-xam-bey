import { norm } from './format'
import { validQcm } from './srs'
import type { Qcm } from './types'

/** Mêmes règles que scripts/check_content.py, appliquées pendant la saisie dans l'espace Admin. */
export const MAX_OK_LENGTH = 110
export const WRONG_COUNT = 3
const LONG_RATIO = 1.8
const LONG_GAP = 25

export interface CardDraft {
  q: string
  a: string
  ok: string
  no: string[]
  note: string
}

export interface CardCheck { errors: string[]; warnings: string[] }

export const QCM_ERRORS = {
  noWrong: 'QCM incomplet : ajoutez au moins une mauvaise proposition, ou videz la bonne pour une question sans QCM.',
  noOk: 'QCM incomplet : ajoutez la bonne proposition, ou videz les mauvaises pour une question sans QCM.',
  tooMany: `QCM : ${WRONG_COUNT} mauvaises propositions au plus.`,
  duplicate: 'QCM : deux propositions sont identiques (ou une mauvaise est égale à la bonne), sans compter casse ni accents.',
} as const

export type QcmRead = { ok: true; qcm: Qcm | null } | { ok: false; error: string }

/**
 * Règle unique du QCM (éditeur, import Excel, publication depuis la liste) : aucun QCM (l'application en compose un),
 * ou une bonne proposition et 1 à 3 mauvaises, toutes distinctes sans compter casse ni accents (`norm`).
 * Le QCM rendu passe aussi validQcm, la règle de lecture côté scouts.
 */
export function readQcm(ok: string, wrong: readonly string[]): QcmRead {
  const good = ok.trim()
  const filled = wrong.map(x => x.trim()).filter(Boolean)
  if (!good && !filled.length) return { ok: true, qcm: null }
  if (!good) return { ok: false, error: QCM_ERRORS.noOk }
  if (!filled.length) return { ok: false, error: QCM_ERRORS.noWrong }
  if (filled.length > WRONG_COUNT) return { ok: false, error: QCM_ERRORS.tooMany }
  const keys = [good, ...filled].map(norm)
  if (new Set(keys).size !== keys.length) return { ok: false, error: QCM_ERRORS.duplicate }
  const qcm = validQcm({ ok: good, no: filled })
  return qcm ? { ok: true, qcm } : { ok: false, error: QCM_ERRORS.duplicate }
}

/** Lecture tolérante d'un QCM stocké (jsonb) avant de lui appliquer readQcm. */
export function readStoredQcm(raw: unknown): QcmRead {
  if (raw === null || raw === undefined) return { ok: true, qcm: null }
  const { ok, no } = (typeof raw === 'object' ? raw : {}) as { ok?: unknown; no?: unknown }
  const wrong = Array.isArray(no) ? no.map(x => (typeof x === 'string' ? x : '')) : []
  return readQcm(typeof ok === 'string' ? ok : '', wrong)
}

/** Vérifie une question avant enregistrement : erreurs bloquantes et avertissements de qualité. */
export function checkCard(c: CardDraft): CardCheck {
  const errors = [c.q.trim() ? null : 'La question est vide.', c.a.trim() ? null : 'La réponse complète est vide.'].filter((x): x is string => x !== null)
  const read = readQcm(c.ok, c.no)
  if (!read.ok) return { errors: [...errors, read.error], warnings: [] }
  return { errors, warnings: read.qcm ? qcmWarnings(read.qcm.ok, read.qcm.no) : [] }
}

function qcmWarnings(ok: string, no: readonly string[]): string[] {
  const warnings: string[] = []
  if (ok.length > MAX_OK_LENGTH) warnings.push(`Bonne réponse longue (${ok.length} caractères) : visez moins de 90.`)
  const avg = no.reduce((a, x) => a + x.length, 0) / no.length
  if (ok.length > LONG_RATIO * avg && ok.length - avg > LONG_GAP) {
    warnings.push('La bonne réponse est nettement plus longue que les mauvaises : elle se devine. Équilibrez les longueurs.')
  }
  if ([ok, ...no].some(x => x.includes('*'))) warnings.push('Pas de mise en forme (**) dans les propositions du QCM.')
  return warnings
}

/** Identifiant d'une nouvelle carte : t<zone>-<6 caractères>, conforme à la contrainte de la table cards. */
export function newCardId(zone: number, rand: () => number = Math.random): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const tail = Array.from({ length: 6 }, () => chars[Math.floor(rand() * chars.length)]).join('')
  return `t${zone}-${tail}`
}

/** Chemin de stockage d'un PDF envoyé : nom lisible sans accents ni espaces, suffixe unique. */
export function storagePathFor(fileName: string, rand: () => number = Math.random): string {
  const base = norm(fileName.replace(/\.pdf$/i, '')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document'
  const tail = Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')
  return `${base}-${tail}.pdf`
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export function checkUpload(file: { name: string; type: string; size: number }): string | null {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return 'Seuls les fichiers PDF sont acceptés. Exportez les documents Word ou PowerPoint en PDF.'
  if (file.size <= 0) return 'Le fichier est vide.'
  if (file.size > MAX_UPLOAD_BYTES) return 'Le fichier dépasse 50 Mo.'
  return null
}
