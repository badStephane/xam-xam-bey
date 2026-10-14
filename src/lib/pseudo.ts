/**
 * Pseudo (16-design C5, contrat L5-2) : vérification de format côté appareil (confort), messages d'erreur exacts,
 * tirage au hasard. Le serveur reste seul juge (mots refusés, unicité, rythme de changement).
 */
export const PSEUDO_MIN = 3
export const PSEUDO_MAX = 20
const MAX_DIGITS = 4

export const PSEUDO_MESSAGES = {
  short: '3 caractères au moins.',
  long: '20 caractères au plus.',
  chars: 'Lettres, chiffres, tiret (-) et tiret bas (_) seulement, sans espace.',
  start: 'Commencez par une lettre.',
  contact: 'Pas de numéro ni d’adresse dans un pseudo.',
  refused: 'Ce pseudo n’est pas accepté. Choisissez-en un autre.',
  tooSoon: 'Un seul changement de pseudo par jour. Réessayez demain.',
  rate: 'Trop d’essais. Réessayez dans une minute.',
  unknown: 'Le pseudo n’a pas pu être enregistré. Vérifiez la connexion puis réessayez.',
} as const

export const takenMessage = (suggestion: string): string => `Ce pseudo est déjà pris. Essayez ${suggestion}.`

const LETTER = /\p{L}/u
const ALLOWED = /^[\p{L}\p{M}0-9_-]+$/u

/** Message d'erreur de format (C5), ou null si le pseudo peut être envoyé. Ordre : contact, longueur, caractères, début. */
export function pseudoFormatError(raw: string): string | null {
  const p = raw.trim()
  if (p.includes('@') || (p.match(/\d/g) ?? []).length > MAX_DIGITS) return PSEUDO_MESSAGES.contact
  const len = [...p].length
  if (len < PSEUDO_MIN) return PSEUDO_MESSAGES.short
  if (len > PSEUDO_MAX) return PSEUDO_MESSAGES.long
  if (!ALLOWED.test(p)) return PSEUDO_MESSAGES.chars
  if (!LETTER.test(p[0])) return PSEUDO_MESSAGES.start
  return null
}

/** Suggestion si le pseudo est pris : chiffres finaux augmentés de 1 (CalaoAgile27 → CalaoAgile28), sinon « 2 » ajouté. */
export function nextPseudo(p: string): string {
  const m = /^(.*?)(\d+)$/.exec(p)
  if (!m) return `${p.slice(0, PSEUDO_MAX - 1)}2`
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0')
  return `${m[1]}${n}`.slice(-PSEUDO_MAX)
}

/** Annexe A2 et A3 de 16-design. */
export const ADJECTIVES = ['Agile', 'Brave', 'Calme', 'Rapide', 'Sage', 'Vif', 'Loyal', 'Patient', 'Curieux', 'Joyeux'] as const
export const ANIMALS = ['Calao', 'Gazelle', 'Lion', 'Lamantin', 'Pélican', 'Faucon', 'Tortue', 'Dauphin', 'Héron', 'Guépard'] as const

/** Animal + adjectif + 2 chiffres : CalaoAgile27. */
export function randomPseudo(rand: () => number = Math.random): string {
  const pick = <T,>(l: readonly T[]): T => l[Math.min(l.length - 1, Math.floor(rand() * l.length))]
  const animal = pick(ANIMALS)
  const adjective = pick(ADJECTIVES)
  return `${animal}${adjective}${String(Math.floor(rand() * 90) + 10)}`
}

/** Raison de PSEUDO_INVALID (`details`, contrat L5-2) vers le message C5. */
const INVALID_REASONS: Record<string, string> = {
  too_short: PSEUDO_MESSAGES.short, too_long: PSEUDO_MESSAGES.long, chars: PSEUDO_MESSAGES.chars,
  first_char: PSEUDO_MESSAGES.start, digits: PSEUDO_MESSAGES.contact,
}

const suggestionOf = (hint: string | undefined, tried: string): string => (hint?.trim() && !pseudoFormatError(hint) ? hint.trim() : nextPseudo(tried.trim()))

/** Erreur du RPC set_pseudo traduite (le texte du serveur n'est jamais affiché). */
export function pseudoErrorMessage(error: { code?: string; message?: string; details?: string; hint?: string } | null, tried: string): string {
  switch (error?.message) {
    case 'PSEUDO_INVALID': return INVALID_REASONS[error.details ?? ''] ?? pseudoFormatError(tried) ?? PSEUDO_MESSAGES.chars
    case 'PSEUDO_REFUSED': return PSEUDO_MESSAGES.refused
    case 'PSEUDO_TAKEN': return takenMessage(suggestionOf(error.hint, tried))
    case 'PSEUDO_TOO_SOON': return PSEUDO_MESSAGES.tooSoon
    case 'RATE_LIMITED': return PSEUDO_MESSAGES.rate
    default: return error?.code === '23505' ? takenMessage(suggestionOf(error.hint, tried)) : PSEUDO_MESSAGES.unknown
  }
}

/** Le serveur ne limite pas les essais (L5-2) : 5 envois par minute au plus depuis cet appareil. */
export const PSEUDO_TRIES_PER_MINUTE = 5
const MINUTE_MS = 60_000

/** Essais encore permis : renvoie la nouvelle liste d'horodatages, ou null si la limite est atteinte. */
export function allowTry(stamps: readonly number[], now: number, max: number = PSEUDO_TRIES_PER_MINUTE): number[] | null {
  const recent = stamps.filter(t => now - t < MINUTE_MS)
  return recent.length >= max ? null : [...recent, now]
}
