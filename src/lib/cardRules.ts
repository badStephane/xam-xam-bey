import { norm } from './format'

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

/** Vérifie une question avant enregistrement : erreurs bloquantes et avertissements de qualité. */
export function checkCard(c: CardDraft): CardCheck {
  const errors: string[] = []
  const warnings: string[] = []
  if (!c.q.trim()) errors.push('La question est vide.')
  if (!c.a.trim()) errors.push('La réponse complète est vide.')
  const ok = c.ok.trim()
  const no = c.no.map(x => x.trim())
  if (!ok) errors.push('La bonne réponse courte du QCM est vide.')
  if (no.length !== WRONG_COUNT || no.some(x => !x)) errors.push(`Il faut ${WRONG_COUNT} mauvaises réponses.`)
  const keys = [ok, ...no].filter(Boolean).map(norm)
  if (new Set(keys).size !== keys.length) errors.push('Deux propositions sont identiques (ou une mauvaise réponse est égale à la bonne).')
  if (ok.length > MAX_OK_LENGTH) warnings.push(`Bonne réponse longue (${ok.length} caractères) : visez moins de 90.`)
  const filled = no.filter(Boolean)
  const avg = filled.length ? filled.reduce((a, x) => a + x.length, 0) / filled.length : 0
  if (avg && ok.length > LONG_RATIO * avg && ok.length - avg > LONG_GAP) {
    warnings.push('La bonne réponse est nettement plus longue que les mauvaises : elle se devine. Équilibrez les longueurs.')
  }
  if ([ok, ...no].some(x => x.includes('*'))) warnings.push('Pas de mise en forme (**) dans les propositions du QCM.')
  return { errors, warnings }
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
