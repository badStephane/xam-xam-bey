import { ACQUIRED_LV } from './constants'
import { badgesSeenKey } from './gameKeys'
import { TOP_TIER, type ServerBadge } from './league'
import { bestStreak } from './srs'
import type { Card, Progress } from './types'

/**
 * Badges du lot 5 (16-design C6) : 10 calculés sur l'appareil depuis la progression (disponibles hors ligne),
 * 4 attribués par le serveur (get_league_state, mis en cache). Aucun badge lié à l'heure.
 */
export interface BadgeStatus {
  id: string
  name: string
  rule: string
  earned: boolean
  /** Compteur des badges répétables (×n), 0 sinon. */
  count: number
  /** Progression vers le badge verrouillé : [valeur, cible]. */
  progress: readonly [number, number]
  server: boolean
}

const MIN_ZONE_CARDS = 10
const CARTOGRAPHER_ZONES = 6
const PERFECT_DAILY_MIN = 10
const EXAM_CARDS = 10

const views = (p: Progress): number => Object.values(p.cards).reduce((s, c) => s + c[2], 0)
const acquired = (p: Progress, id: string): boolean => (p.cards[id]?.[0] ?? 0) >= ACQUIRED_LV

function zones(p: Progress, byZone: Record<number, Card[]>): { mastered: number; bestShare: readonly [number, number]; touched: number } {
  const list = Object.values(byZone)
  const eligible = list.filter(cs => cs.length >= MIN_ZONE_CARDS)
  const counts = eligible.map(cs => [cs.filter(c => acquired(p, c.id)).length, cs.length] as const)
  const bestShare = counts.reduce<readonly [number, number]>((b, c) => (c[0] / c[1] > b[0] / b[1] ? c : b), [0, MIN_ZONE_CARDS])
  return {
    mastered: counts.filter(([a, n]) => a === n).length,
    bestShare,
    touched: list.filter(cs => cs.some(c => acquired(p, c.id))).length,
  }
}

const status = (id: string, name: string, rule: string, value: number, target: number, count = 0): BadgeStatus =>
  ({ id, name, rule, earned: value >= target, count, progress: [Math.min(value, target), target], server: false })

/** Les 10 badges personnels, dans l'ordre de C6. `byZone` : cartes publiées par zone. */
export function localBadges(p: Progress, byZone: Record<number, Card[]>): BadgeStatus[] {
  const v = views(p)
  const best = bestStreak(p)
  const z = zones(p, byZone)
  const perfectDaily = p.sessions.some(s => s.k === 'daily' && s.n >= PERFECT_DAILY_MIN && s.ok === s.n)
  const perfectExam = p.sessions.some(s => s.k === 'exam' && s.n === EXAM_CARDS && s.ok === EXAM_CARDS)
  return [
    status('first', 'Premier pas', 'Noter une première carte.', v, 1),
    status('cards100', 'Cent cartes', 'Noter 100 cartes (chaque révision compte).', v, 100),
    status('cards1000', 'Mille cartes', 'Noter 1 000 cartes (chaque révision compte).', v, 1000),
    status('streak3', 'Série de 3', 'Réviser 3 jours de suite.', best, 3),
    status('streak7', 'Série de 7', 'Réviser 7 jours de suite.', best, 7),
    status('streak30', 'Série de 30', 'Réviser 30 jours de suite.', best, 30),
    z.mastered
      ? status('zone', 'Zone maîtrisée', 'Acquérir toutes les cartes d’une zone (10 cartes au moins).', 1, 1, z.mastered)
      : status('zone', 'Zone maîtrisée', 'Acquérir toutes les cartes d’une zone (10 cartes au moins).', z.bestShare[0], z.bestShare[1]),
    status('cartographer', 'Cartographe', 'Acquérir au moins une carte dans 6 zones différentes.', z.touched, CARTOGRAPHER_ZONES),
    status('perfect', 'Sans faute', 'Réussir une session du jour d’au moins 10 cartes sans erreur.', perfectDaily ? 1 : 0, 1),
    status('exam', 'Examen parfait', 'Réussir un mini-examen 10 sur 10.', perfectExam ? 1 : 0, 1),
  ]
}

/** Les 4 badges du serveur (challenge, promoted, podium, polar_star) ; « Étoile polaire » aussi déduit de la ligue actuelle. */
export function serverBadges(list: readonly ServerBadge[], tier: number): BadgeStatus[] {
  const n = (code: string): number => list.filter(b => b.badge === code).length
  const srv = (s: BadgeStatus): BadgeStatus => ({ ...s, server: true })
  const polar = n('polar_star') > 0 || tier >= TOP_TIER
  return [
    srv(n('challenge') ? status('challenge', 'Défi relevé', 'Relever le défi de la semaine.', 1, 1, n('challenge')) : status('challenge', 'Défi relevé', 'Relever le défi de la semaine.', 0, 1)),
    srv(status('promoted', 'Première montée', 'Monter de ligue une fois.', n('promoted') ? 1 : 0, 1)),
    srv(n('podium') ? status('podium', 'Podium', 'Finir 1er à 3e d’un groupe d’au moins 5 scouts.', 1, 1, n('podium')) : status('podium', 'Podium', 'Finir 1er à 3e d’un groupe d’au moins 5 scouts.', 0, 1)),
    srv(status('polar', 'Étoile polaire', 'Atteindre la Ligue Étoile polaire.', polar ? 1 : 0, 1)),
  ]
}

/** Badges obtenus (ou dont le compteur a augmenté) entre deux états : ce que le bilan annonce. */
export function newlyEarned(before: readonly BadgeStatus[], after: readonly BadgeStatus[]): BadgeStatus[] {
  return after.filter(a => {
    const b = before.find(x => x.id === a.id)
    return a.earned && (!b || !b.earned || a.count > b.count)
  })
}

/** Date du premier constat sur l'appareil, par badge (jour depuis 1970). */
export type SeenDates = Record<string, number>

export function readSeenDates(store: Pick<Storage, 'getItem'> | null, userId: string): SeenDates {
  try {
    const raw = store?.getItem(badgesSeenKey(userId))
    const v: unknown = raw ? JSON.parse(raw) : null
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {}
    return Object.fromEntries(Object.entries(v).filter(([k, d]) => k.length <= 20 && Number.isInteger(d) && (d as number) > 0)) as SeenDates
  } catch {
    return {}
  }
}

/** Ajoute la date du jour aux badges obtenus pas encore datés ; renvoie les dates à jour (sans écrire si rien ne change). */
export function recordSeenDates(store: Pick<Storage, 'getItem' | 'setItem'> | null, userId: string, badges: readonly BadgeStatus[], today: number): SeenDates {
  const seen = readSeenDates(store, userId)
  const fresh = badges.filter(b => b.earned && !seen[b.id])
  if (!fresh.length) return seen
  const next = { ...seen, ...Object.fromEntries(fresh.map(b => [b.id, today])) }
  try { store?.setItem(badgesSeenKey(userId), JSON.stringify(next)) } catch { /* stockage plein : dates non gardées */ }
  return next
}
