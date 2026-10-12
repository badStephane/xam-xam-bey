import { FIRST_MONTH, MONTH_NAMES, YEAR0, ZONES } from './constants'

export const p2 = (n: number): string => String(n).padStart(2, '0')
export const p3 = (n: number): string => String(n).padStart(3, '0')
export const mo = (bytes: number): string => (bytes / 1e6).toFixed(1).replace('.', ',')
export const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`
export const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const plain = (s: string | undefined): string => String(s || '').replace(/\*+/g, '')
export const zoneColor = (n: number): string => `oklch(0.72 0.12 ${ZONES[n - 1][3]})`
export const zoneYear = (n: number): number => YEAR0 + Math.floor((FIRST_MONTH + n - 1) / 12)

export function cleanTitle(raw: string): string {
  const spaced = raw.includes(' ') ? raw : raw.replace(/[-_]+/g, ' ')
  const t = spaced.replace(/\s*\(z-lib\.org\)/i, '').replace(/\(\d\)$/, '').replace(/\s+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const dayNum = (d: Date): number => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5)
export const dayDate = (n: number): Date => new Date(n * 864e5)
export function shortDate(n: number): string {
  const d = dayDate(n)
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 4)}.`
}
/** Zone en cours (1 à 12) pour une date donnée, bornée à l'année du plan. */
export const currentZone = (d: Date): number =>
  Math.min(12, Math.max(1, (d.getFullYear() - YEAR0) * 12 + (d.getMonth() - FIRST_MONTH) + 1))

export interface MdSpan { t: string; bold: boolean; italic: boolean }
/** Découpe le markdown minimal des fiches (**gras**, *italique*) en segments. */
export function mdSpans(s: string | undefined): MdSpan[] {
  return String(s || '').split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean).map(p =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? { t: p.slice(2, -2), bold: true, italic: false }
      : p.startsWith('*') && p.endsWith('*') && p.length > 2 ? { t: p.slice(1, -1), bold: false, italic: true }
        : { t: p, bold: false, italic: false })
}

/** Points clés attendus d'une réponse : les passages en gras, sinon les premières propositions. */
export function keyPoints(a: string): string[] {
  const bold = (a.match(/\*\*([^*]+)\*\*/g) || []).map(x => x.slice(2, -2))
  if (bold.length >= 2) return bold.slice(0, 4)
  return plain(a).split(/[.;:]\s+/).map(x => x.trim()).filter(x => x.length > 2).slice(0, 3)
}

export function shuffle<T>(a: readonly T[], rand: () => number = Math.random): T[] {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
