import { leagueCacheKey, leagueSeenKey } from './gameKeys'

/**
 * Ligues du lot 5 : lecture validée de get_league_state (contrat L5-3), copie gardée pour le hors ligne (P4),
 * et règles d'affichage de 16-design (C1, C3, §4.1) ajustées par A7 et A8. Fonctions pures, testées.
 */
export const LEAGUES = ['Ligue Piste', 'Ligue Bivouac', 'Ligue Boussole', 'Ligue Feu de camp', 'Ligue Baobab', 'Ligue Étoile polaire'] as const
export const TOP_TIER = LEAGUES.length

export const leagueName = (tier: number): string => LEAGUES[Math.min(TOP_TIER, Math.max(1, Math.round(tier))) - 1]

export type LeagueStatus = 'no_pseudo' | 'reset' | 'opted_out' | 'not_started' | 'pending' | 'active'
const STATUSES: readonly LeagueStatus[] = ['no_pseudo', 'reset', 'opted_out', 'not_started', 'pending', 'active']
export type Zone = 'up' | 'stay' | 'down'

export interface LeagueRow { id: string; pseudo: string; xp: number; rank: number; zone: Zone; isMe: boolean }
export interface LastResult { weekStart: string; rank: number; outcome: -1 | 0 | 1; tierBefore: number; tierAfter: number; size: number | null }
export interface Challenge { kind: string; target: number; progress: number; done: boolean }
export interface ServerBadge { badge: string; weekStart: string | null; earnedAt: string }

export interface LeagueState {
  status: LeagueStatus
  weekStart: string
  weekEnd: string
  pseudo: string | null
  optIn: boolean
  tier: number
  weekXp: number
  /** XP de ligue du jour (plafond A6 : 300), si le serveur la donne. */
  todayXp: number | null
  /** Taille du groupe et places de montée calculées par le serveur (A8), si données. */
  groupSize: number | null
  upCount: number | null
  group: LeagueRow[]
  lastResult: LastResult | null
  challenge: Challenge | null
  badges: ServerBadge[]
  serverTime: string
}

const MAX_ROWS = 30
const MAX_BADGES = 500
const MAX_TEXT = 40
const DATE = /^\d{4}-\d{2}-\d{2}$/

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_TEXT
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v)
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_TEXT && !Number.isNaN(Date.parse(v))
const isTier = (v: unknown): v is number => isInt(v, 1, TOP_TIER)

function parseRow(v: unknown): LeagueRow | null {
  if (!isRecord(v) || !isText(v.id) || !isText(v.pseudo) || !isInt(v.xp, 0, 1e6) || !isInt(v.rank, 1, 1000)) return null
  const zone: Zone = v.zone === 'up' || v.zone === 'down' ? v.zone : 'stay'
  return { id: v.id, pseudo: v.pseudo, xp: v.xp, rank: v.rank, zone, isMe: v.isMe === true }
}

function parseLastResult(v: unknown): LastResult | null {
  if (!isRecord(v) || !isDate(v.weekStart) || !isInt(v.rank, 1, 1000) || !isInt(v.outcome, -1, 1) || !isTier(v.tierBefore) || !isTier(v.tierAfter)) return null
  return { weekStart: v.weekStart, rank: v.rank, outcome: v.outcome as -1 | 0 | 1, tierBefore: v.tierBefore, tierAfter: v.tierAfter, size: isInt(v.groupSize, 1, 1000) ? v.groupSize : isInt(v.size, 1, 1000) ? v.size : null }
}

function parseChallenge(v: unknown): Challenge | null {
  if (!isRecord(v) || !isText(v.kind) || !isInt(v.target, 1, 1e5) || !isInt(v.progress, 0, 1e5)) return null
  return { kind: v.kind, target: v.target, progress: v.progress, done: v.done === true || v.progress >= v.target }
}

function parseBadge(v: unknown): ServerBadge | null {
  if (!isRecord(v) || !isText(v.badge) || !isIso(v.earnedAt)) return null
  return { badge: v.badge, weekStart: isDate(v.weekStart) ? v.weekStart : null, earnedAt: v.earnedAt }
}

const present = <T,>(x: T | null): x is T => x !== null

/** Réponse de get_league_state validée, ou null si sa forme n'est pas celle du contrat (jamais affichée telle quelle). */
export function parseLeagueState(raw: unknown): LeagueState | null {
  if (!isRecord(raw) || !STATUSES.includes(raw.status as LeagueStatus)) return null
  if (!isDate(raw.weekStart) || !isDate(raw.weekEnd) || !isTier(raw.tier) || !isInt(raw.weekXp, 0, 1e6) || !isIso(raw.serverTime)) return null
  const group = Array.isArray(raw.group) ? raw.group.slice(0, MAX_ROWS).map(parseRow).filter(present).sort((a, b) => a.rank - b.rank) : []
  return {
    status: raw.status as LeagueStatus,
    weekStart: raw.weekStart,
    weekEnd: raw.weekEnd,
    pseudo: isText(raw.pseudo) ? raw.pseudo : null,
    optIn: raw.optIn !== false,
    tier: raw.tier,
    weekXp: raw.weekXp,
    todayXp: isInt(raw.todayXp, 0, 1e6) ? raw.todayXp : null,
    groupSize: isInt(raw.groupSize, 0, 1000) ? raw.groupSize : null,
    upCount: isInt(raw.upCount, 0, 100) ? raw.upCount : null,
    group: raw.status === 'active' ? group : [],
    lastResult: parseLastResult(raw.lastResult),
    challenge: parseChallenge(raw.challenge),
    badges: Array.isArray(raw.badges) ? raw.badges.slice(0, MAX_BADGES).map(parseBadge).filter(present) : [],
    serverTime: raw.serverTime,
  }
}

/** Copie gardée de la dernière réponse (un seul compte par appareil), relue et revalidée à la lecture. */
export interface CachedLeague { state: LeagueState; at: number }
type CacheStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>
const CACHE_PREFIX = leagueCacheKey('')

export function readLeagueCache(store: Pick<Storage, 'getItem'> | null, userId: string): CachedLeague | null {
  try {
    const raw = store?.getItem(leagueCacheKey(userId))
    if (!raw) return null
    const v: unknown = JSON.parse(raw)
    if (!isRecord(v) || v.v !== 1 || v.user !== userId || !isInt(v.at, 0, Number.MAX_SAFE_INTEGER)) return null
    const state = parseLeagueState(v.state)
    return state ? { state, at: v.at } : null
  } catch {
    return null
  }
}

export function writeLeagueCache(store: CacheStore | null, userId: string, state: LeagueState, at: number): void {
  if (!store || !userId) return
  try {
    const others = Array.from({ length: store.length }, (_, i) => store.key(i))
      .filter((k): k is string => !!k && k.startsWith(CACHE_PREFIX) && k !== leagueCacheKey(userId))
    others.forEach(k => store.removeItem(k))
    store.setItem(leagueCacheKey(userId), JSON.stringify({ v: 1, user: userId, at, state }))
  } catch {
    // Stockage plein : pas de classement hors ligne, rien d'autre ne change.
  }
}

/** Semaine passée déjà montrée (le résultat ne s'affiche qu'une fois). */
export function readSeenResult(store: Pick<Storage, 'getItem'> | null, userId: string): string | null {
  try { return store?.getItem(leagueSeenKey(userId)) ?? null } catch { return null }
}
export function writeSeenResult(store: Pick<Storage, 'setItem'> | null, userId: string, weekStart: string): void {
  try { store?.setItem(leagueSeenKey(userId), weekStart) } catch { /* stockage bloqué : le résultat reviendra */ }
}

/** A8 : montent les min(5, ⌊n/3⌋) premiers (personne en Étoile polaire). */
export const promotedCount = (n: number, tier: number): number => (tier >= TOP_TIER ? 0 : Math.min(5, Math.floor(n / 3)))

const MONTHS = ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC']
const utcDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`)

/** « SEMAINE DU 12 AU 18 OCT » (ou « DU 28 SEPT AU 4 OCT »). */
export function weekLabel(weekStart: string, weekEnd: string): string {
  const a = utcDate(weekStart)
  const b = utcDate(weekEnd)
  const from = a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}` : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`
  return `SEMAINE DU ${from} AU ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
}

const DAY_MS = 864e5

/** Compte à rebours en jours seulement (bien-être, 16-design §7) : « FIN DANS 4 JOURS », dimanche « DERNIER JOUR DE LA SEMAINE ». */
export function countdownLabel(now: Date, weekEnd: string): string {
  const today = Math.floor(now.getTime() / DAY_MS)
  const end = Math.floor(utcDate(weekEnd).getTime() / DAY_MS)
  const left = end - today
  if (left <= 0) return 'DERNIER JOUR DE LA SEMAINE'
  return left === 1 ? 'FIN DEMAIN' : `FIN DANS ${left} JOURS`
}

const UNIT: Record<string, readonly [string, string]> = {
  active_days: ['JOUR', 'JOURS'], cards: ['CARTE', 'CARTES'], zone_cards: ['CARTE', 'CARTES'], su: ['« SU »', '« SU »'],
}

/** Libellé du défi (C4) ; un type inconnu garde un libellé neutre. */
export function challengeTitle(c: Pick<Challenge, 'kind' | 'target'>): string {
  switch (c.kind) {
    case 'active_days': return `Réviser ${c.target} jours différents`
    case 'cards': return `Noter ${c.target} cartes`
    case 'zone_cards': return `Noter ${c.target} cartes de la zone du mois`
    case 'su': return `Obtenir ${c.target} « Su »`
    default: return `Atteindre ${c.target}`
  }
}

/** « 3/4 JOURS » */
export function challengeCount(c: Pick<Challenge, 'kind' | 'target' | 'progress'>): string {
  const [one, many] = UNIT[c.kind] ?? ['', '']
  const shown = Math.min(c.progress, c.target)
  return `${shown}/${c.target}${one ? ` ${c.target > 1 ? many : one}` : ''}`
}

/** Carte « Semaine passée » : jamais « relégué » ni « perdu » (16-design §7). */
export function lastResultText(r: LastResult): string {
  const where = `${r.rank === 1 ? '1er' : `${r.rank}e`}${r.size ? ` sur ${r.size}` : ''} en ${leagueName(r.tierBefore)}.`
  if (r.outcome > 0) return `${where} Vous passez en ${leagueName(r.tierAfter)} !`
  if (r.outcome < 0) return `${where} Vous continuez en ${leagueName(r.tierAfter)}.`
  return `${where} Vous restez en ${leagueName(r.tierAfter)}.`
}

export const ordinal = (n: number): string => (n === 1 ? '1er' : `${n}e`)

/** Nom accessible d'une ligne : « 6e, CalaoAgile27, 240 XP, vous ». */
export const rowName = (r: LeagueRow): string => `${ordinal(r.rank)}, ${r.pseudo}, ${r.xp} XP${r.isMe ? ', vous' : ''}`

/** Teinte stable déduite du pseudo, pour l'avatar (initiale sur carré teinté). */
export function pseudoHue(pseudo: string): number {
  return [...pseudo].reduce((h, ch) => (h * 31 + (ch.codePointAt(0) ?? 0)) % 360, 7)
}

/** Heure de la copie gardée : « lundi 14 h 05 ». */
export function cacheTimeLabel(at: number): string {
  const d = new Date(at)
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  return `${days[d.getDay()]} ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`
}

/** Place du scout dans son groupe, ou null. */
export const myRow = (s: LeagueState): LeagueRow | null => s.group.find(r => r.isMe) ?? null
