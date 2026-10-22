import { shortDate } from './format'

/** Statistiques globales de l'Admin (RPC admin_stats, 2026-10-22). Agrégats seulement : aucun compte n'est identifiable. */
export interface WeekStat { week: string; scouts: number; answers: number; correct: number }
export interface ZoneStat { zone: number; scouts: number; seen: number; acquired: number }
export interface HardQuestion { id: string; zone: number; q: string; answers: number; correct: number }
export interface AdminStats { accounts: number; weeks: WeekStat[]; zones: ZoneStat[]; hardest: HardQuestion[] }

type Row = Record<string, unknown>

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)

const toWeek = (r: Row): WeekStat[] =>
  typeof r.week === 'string' && ISO_DAY.test(r.week) && isCount(r.scouts) && isCount(r.answers) && isCount(r.correct) && r.correct <= r.answers
    ? [{ week: r.week, scouts: r.scouts, answers: r.answers, correct: r.correct }] : []

const toZone = (r: Row): ZoneStat[] =>
  isCount(r.zone) && r.zone > 0 && isCount(r.scouts) && isCount(r.seen) && isCount(r.acquired) && r.acquired <= r.seen
    ? [{ zone: r.zone, scouts: r.scouts, seen: r.seen, acquired: r.acquired }] : []

const toHard = (r: Row): HardQuestion[] =>
  typeof r.id === 'string' && typeof r.q === 'string' && isCount(r.zone) && isCount(r.answers) && r.answers > 0
    && isCount(r.correct) && r.correct <= r.answers
    ? [{ id: r.id, zone: r.zone, q: r.q, answers: r.answers, correct: r.correct }] : []

const rows = <T>(v: unknown, to: (r: Row) => T[]): T[] | null => (Array.isArray(v) ? v.filter(isRow).flatMap(to) : null)

/** Réponse du serveur validée ; une ligne mal formée est écartée, une réponse sans sa structure est refusée (null). */
export function parseAdminStats(d: unknown): AdminStats | null {
  if (!isRow(d) || !isCount(d.accounts)) return null
  const weeks = rows(d.weeks, toWeek)
  const zones = rows(d.zones, toZone)
  const hardest = rows(d.hardest, toHard)
  return weeks && zones && hardest ? { accounts: d.accounts, weeks, zones, hardest } : null
}

/** Pourcentage arrondi, ou null sans réponse. */
export const successRate = (correct: number, answers: number): number | null =>
  (answers > 0 ? Math.round((100 * correct) / answers) : null)

/** Lundi de la semaine (AAAA-MM-JJ) au format court des autres dates. */
export const weekLabel = (iso: string): string => shortDate(Math.floor(Date.parse(`${iso}T00:00:00Z`) / 864e5))
