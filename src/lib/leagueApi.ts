import { parseAdminStats, type AdminStats } from './adminStats'
import { parseLeagueState, type LeagueState } from './league'
import { supabase } from './supabase'

/**
 * Appels du lot 5 (contrat L5-2 à L5-5). Les erreurs gardent `code` (SQLSTATE) et `message` (code métier stable) :
 * le front les traduit, n'affiche jamais le texte du serveur.
 */
export interface RpcError { code?: string; message?: string; details?: string; hint?: string }

export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: RpcError }

const NOT_CONFIGURED: RpcError = { code: 'client', message: 'NOT_CONFIGURED' }

async function call<T>(fn: string, args: Record<string, unknown>, parse: (d: unknown) => T | null): Promise<RpcResult<T>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED }
  try {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) return { ok: false, error: { code: error.code, message: error.message, details: error.details ?? undefined, hint: error.hint ?? undefined } }
    const parsed = parse(data)
    return parsed === null ? { ok: false, error: { code: 'client', message: 'BAD_RESPONSE' } } : { ok: true, data: parsed }
  } catch (err) {
    console.error(`[xxb] ${fn} impossible`, err)
    return { ok: false, error: { code: 'network', message: 'NETWORK' } }
  }
}

const done = (): true => true

export const getLeagueState = (): Promise<RpcResult<LeagueState>> => call('get_league_state', {}, parseLeagueState)

export const setPseudo = (pseudo: string | null): Promise<RpcResult<string | null>> =>
  call('set_pseudo', { p_pseudo: pseudo }, d => {
    const p = (d as { pseudo?: unknown } | null)?.pseudo
    return typeof p === 'string' ? p : pseudo === null ? null : pseudo
  })

export const setLeagueOptIn = (optIn: boolean): Promise<RpcResult<true>> => call('set_league_opt_in', { p_in: optIn }, done)

export const reportPseudo = (memberId: string): Promise<RpcResult<true>> => call('report_pseudo', { p_member: memberId }, done)

/** Ligne de la liste admin (contrat L5-5). Aucun e-mail, aucun nom. */
export interface AdminPseudo { userId: string; pseudo: string; tier: number | null; changedAt: string | null; reports: number; cursor: string | null }

const parseAdminRows = (d: unknown): AdminPseudo[] | null => {
  if (!Array.isArray(d)) return null
  return d.flatMap(r => {
    const x = r as Record<string, unknown>
    if (typeof x?.user_id !== 'string' || typeof x.pseudo !== 'string') return []
    return [{
      userId: x.user_id, pseudo: x.pseudo, tier: typeof x.tier === 'number' ? x.tier : null,
      changedAt: typeof x.changed_at === 'string' ? x.changed_at : null, reports: typeof x.reports === 'number' ? x.reports : 0,
      cursor: typeof x.cursor === 'string' ? x.cursor : null,
    }]
  })
}

export const ADMIN_PAGE = 50

export const adminListPseudos = (search: string, after: string | null): Promise<RpcResult<AdminPseudo[]>> =>
  call('admin_list_pseudos', { p_search: search.trim() || null, p_after: after, p_limit: ADMIN_PAGE }, parseAdminRows)

/** `ignore` : signalements écartés, pseudo gardé. */
export type ModerationAction = 'reset' | 'refuse' | 'ignore'

/** Mots refusés (A10) : jamais affichés aux scouts. */
export interface BlockedWord { word: string; exact: boolean }

export const adminListBlockedWords = (): Promise<RpcResult<BlockedWord[]>> =>
  call('admin_list_blocked_words', {}, d => (Array.isArray(d)
    ? d.flatMap(r => (typeof r?.word === 'string' ? [{ word: r.word as string, exact: r.exact === true }] : []))
    : null))

export const adminSetBlockedWord = (word: string, exact: boolean): Promise<RpcResult<string>> =>
  call('admin_set_blocked_word', { p_word: word, p_exact: exact }, d => (typeof d === 'string' ? d : null))

export const adminRemoveBlockedWord = (word: string): Promise<RpcResult<true>> => call('admin_remove_blocked_word', { p_word: word }, done)

export const adminStats = (): Promise<RpcResult<AdminStats>> => call('admin_stats', {}, parseAdminStats)

export const adminModeratePseudo =(userId: string, action: ModerationAction): Promise<RpcResult<true>> =>
  call('admin_moderate_pseudo', { p_user: userId, p_action: action }, done)
