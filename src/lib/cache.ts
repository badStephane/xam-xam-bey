import type { DocumentRow } from './types'

/** Clés versionnées des caches de l'appareil (préfixe xxb. ajouté par storage.ts). Changer de forme = changer de version. */
export const CACHE_KEYS = { catalog: 'catalog.v1', seen: 'seen.v1', theme: 'theme.v1' } as const

/** Anciennes clés sans version (lot 1) : relues une fois si valides, puis effacées. */
export const LEGACY_KEYS = { catalog: 'catalog', seen: 'seen', theme: 'theme' } as const

const PREFIX = 'xxb.'
/** Copies locales de progression non encore envoyées : jamais purgées par l'écran de secours. */
const KEEP_PREFIX = 'xxb.progress.'

export type Theme = 'dark' | 'light'

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const isStr = (s: unknown): s is string => typeof s === 'string'
const isBool = (b: unknown): b is boolean => typeof b === 'boolean'

/** Une ligne de la table documents, telle que docsFromRows l'attend. */
export function isDocumentRow(v: unknown): v is DocumentRow {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return isInt(r.id) && isInt(r.zone) && r.zone >= 1 && r.zone <= 12
    && isStr(r.title) && isStr(r.folder) && isStr(r.file_name) && isStr(r.storage_path) && r.storage_path.length > 0
    && typeof r.size === 'number' && Number.isFinite(r.size) && r.size >= 0
    && (r.pages === null || isInt(r.pages)) && isBool(r.essential) && isBool(r.scan)
}

/** Catalogue lu (cache ou réseau) : la liste entière si chaque ligne est valide, sinon null (repli). */
export function parseRows(v: unknown): DocumentRow[] | null {
  return Array.isArray(v) && v.length > 0 && v.every(isDocumentRow) ? v : null
}

/** Pièces consultées : identifiants entiers positifs, sans doublon. */
export function parseSeen(v: unknown): number[] | null {
  if (!Array.isArray(v) || !v.every(n => isInt(n) && n > 0)) return null
  return [...new Set(v as number[])]
}

export const parseTheme = (v: unknown): Theme | null => (v === 'dark' || v === 'light' ? v : null)

/** Clés à effacer depuis l'écran de secours : caches du site seulement, jamais la progression. */
export const purgeableKeys = (keys: readonly string[]): string[] =>
  keys.filter(k => k.startsWith(PREFIX) && !k.startsWith(KEEP_PREFIX))
