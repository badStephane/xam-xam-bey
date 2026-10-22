import { ISO_DAY, isCount, isRow, rows, type Row } from './adminStats'

/** Suivi d'un scout par l'admin (RPC admin_find_scouts, admin_scout_progress, admin_list_views, 2026-10-22). */
export interface ScoutHit { userId: string; email: string; pseudo: string | null; lastActive: string | null }
export interface ScoutWeek { week: string; answers: number; correct: number; days: number }
export interface ScoutZone { zone: number; total: number; seen: number; acquired: number }
/** Séance : jour (depuis 1970), cartes, réussies, libellé. */
export interface ScoutSession { d: number; n: number; ok: number; l: string }
export interface ScoutProgress {
  email: string; pseudo: string | null; createdAt: string | null; lastActive: string | null; xp: number
  weeks: ScoutWeek[]; zones: ScoutZone[]; sessions: ScoutSession[]
}
/** Entrée du journal : une fiche ouverte (targetEmail) ou une recherche (search). */
export interface AdminView { viewedAt: string; adminEmail: string; targetEmail: string | null; search: string | null }

const LABEL_MAX = 60

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null)

const toHit = (r: Row): ScoutHit[] =>
  typeof r.user_id === 'string' && typeof r.email === 'string'
    ? [{ userId: r.user_id, email: r.email, pseudo: text(r.pseudo), lastActive: text(r.last_active) }] : []

const toWeek = (r: Row): ScoutWeek[] =>
  typeof r.week === 'string' && ISO_DAY.test(r.week) && isCount(r.answers) && isCount(r.correct) && r.correct <= r.answers && isCount(r.days)
    ? [{ week: r.week, answers: r.answers, correct: r.correct, days: r.days }] : []

const toZone = (r: Row): ScoutZone[] =>
  isCount(r.zone) && r.zone > 0 && isCount(r.total) && isCount(r.seen) && isCount(r.acquired) && r.acquired <= r.seen
    ? [{ zone: r.zone, total: r.total, seen: r.seen, acquired: r.acquired }] : []

const toSession = (r: Row): ScoutSession[] =>
  isCount(r.d) && isCount(r.n) && isCount(r.ok) && r.ok <= r.n ? [{ d: r.d, n: r.n, ok: r.ok, l: (text(r.l) ?? '').slice(0, LABEL_MAX) }] : []

const toView = (r: Row): AdminView[] => {
  const targetEmail = text(r.target_email)
  const search = text(r.search)
  return typeof r.viewed_at === 'string' && typeof r.admin_email === 'string' && (targetEmail === null) !== (search === null)
    ? [{ viewedAt: r.viewed_at, adminEmail: r.admin_email, targetEmail, search }] : []
}

export const parseScoutHits = (d: unknown): ScoutHit[] | null => rows(d, toHit)

export const parseAdminViews = (d: unknown): AdminView[] | null => rows(d, toView)

/** Fiche validée ; une ligne mal formée est écartée, une fiche sans e-mail ou sans ses listes est refusée (null). */
export function parseScoutProgress(d: unknown): ScoutProgress | null {
  if (!isRow(d) || typeof d.email !== 'string' || !isCount(d.xp)) return null
  const weeks = rows(d.weeks, toWeek)
  const zones = rows(d.zones, toZone)
  const sessions = rows(d.sessions, toSession)
  if (!weeks || !zones || !sessions) return null
  return { email: d.email, pseudo: text(d.pseudo), createdAt: text(d.createdAt), lastActive: text(d.lastActive), xp: d.xp, weeks, zones, sessions }
}
