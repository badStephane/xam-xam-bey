import { describe, expect, test } from 'vitest'
import { leagueCacheKey } from './gameKeys'
import { challengeCount, challengeTitle, countdownLabel, lastResultText, leagueName, parseLeagueState, promotedCount, readLeagueCache, rowName, weekLabel, writeLeagueCache } from './league'

const mem = (): Storage => {
  const m = new Map<string, string>()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: k => { m.delete(k) }, clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size } }
}

const RAW = {
  status: 'active', weekStart: '2026-10-12', weekEnd: '2026-10-18', deadline: '2026-10-19T06:00:00Z',
  pseudo: 'Élodie_K', pseudoState: 'ok', optIn: true, tier: 2, weekXp: 230,
  group: [
    { id: 'm2', pseudo: 'Élodie_K', xp: 230, rank: 2, zone: 'up', isMe: true },
    { id: 'm1', pseudo: 'Moussa7', xp: 400, rank: 1, zone: 'up', isMe: false },
    { id: 'bad', pseudo: 'x', xp: -1, rank: 3, zone: 'down', isMe: false },
  ],
  lastResult: { weekStart: '2026-10-05', rank: 3, outcome: 1, tierBefore: 1, tierAfter: 2 },
  challenge: { kind: 'active_days', target: 4, progress: 2, done: false },
  badges: [{ badge: 'promoted', weekStart: '2026-10-05', earnedAt: '2026-10-12T06:05:00Z' }],
  serverTime: '2026-10-14T10:00:00Z',
}

describe('get_league_state validé (L5-3)', () => {
  test('forme du contrat : lignes triées par rang, lignes invalides retirées', () => {
    const s = parseLeagueState(RAW)!
    expect(s.group.map(r => r.id)).toEqual(['m1', 'm2'])
    expect(s.lastResult?.tierAfter).toBe(2)
    expect(s.challenge).toEqual({ kind: 'active_days', target: 4, progress: 2, done: false })
    expect(s.badges).toHaveLength(1)
  })

  test('statut inconnu, ligue hors borne ou dates invalides : refusé', () => {
    expect(parseLeagueState({ ...RAW, status: 'nope' })).toBeNull()
    expect(parseLeagueState({ ...RAW, tier: 7 })).toBeNull()
    expect(parseLeagueState({ ...RAW, weekStart: 'lundi' })).toBeNull()
    expect(parseLeagueState(null)).toBeNull()
  })

  test('hors statut actif : aucun groupe affiché', () => {
    expect(parseLeagueState({ ...RAW, status: 'no_pseudo', pseudo: null })!.group).toEqual([])
  })

  test('copie gardée : relue pour le même compte seulement, revalidée, une seule par appareil', () => {
    const s = mem()
    const state = parseLeagueState(RAW)!
    writeLeagueCache(s, 'a', state, 1000)
    expect(readLeagueCache(s, 'a')).toEqual({ state, at: 1000 })
    expect(readLeagueCache(s, 'b')).toBeNull()
    writeLeagueCache(s, 'b', state, 2000)
    expect(s.getItem(leagueCacheKey('a'))).toBeNull()
    s.setItem(leagueCacheKey('b'), JSON.stringify({ v: 1, user: 'b', at: 1, state: { ...RAW, status: 'hacked' } }))
    expect(readLeagueCache(s, 'b')).toBeNull()
    s.setItem(leagueCacheKey('b'), '{')
    expect(readLeagueCache(s, 'b')).toBeNull()
  })
})

describe('règles d’affichage', () => {
  test('A8 : montent min(5, ⌊n/3⌋), personne en Étoile polaire', () => {
    expect(promotedCount(20, 2)).toBe(5)
    expect(promotedCount(9, 2)).toBe(3)
    expect(promotedCount(2, 1)).toBe(0)
    expect(promotedCount(20, 6)).toBe(0)
  })

  test('compte à rebours en jours seulement', () => {
    expect(countdownLabel(new Date('2026-10-14T10:00:00Z'), '2026-10-18')).toBe('FIN DANS 4 JOURS')
    expect(countdownLabel(new Date('2026-10-17T10:00:00Z'), '2026-10-18')).toBe('FIN DEMAIN')
    expect(countdownLabel(new Date('2026-10-18T10:00:00Z'), '2026-10-18')).toBe('DERNIER JOUR DE LA SEMAINE')
  })

  test('libellés de semaine, défi, ligne et résultat', () => {
    expect(weekLabel('2026-10-12', '2026-10-18')).toBe('SEMAINE DU 12 AU 18 OCT')
    expect(weekLabel('2026-09-28', '2026-10-04')).toBe('SEMAINE DU 28 SEPT AU 4 OCT')
    expect(challengeTitle({ kind: 'active_days', target: 4 })).toBe('Réviser 4 jours différents')
    expect(challengeCount({ kind: 'active_days', target: 4, progress: 3 })).toBe('3/4 JOURS')
    expect(challengeCount({ kind: 'cards', target: 60, progress: 80 })).toBe('60/60 CARTES')
    expect(rowName({ id: 'x', pseudo: 'CalaoAgile27', xp: 240, rank: 6, zone: 'stay', isMe: true })).toBe('6e, CalaoAgile27, 240 XP, vous')
    expect(lastResultText({ weekStart: '2026-10-05', rank: 3, outcome: 1, tierBefore: 2, tierAfter: 3, size: 17 })).toBe('3e sur 17 en Ligue Bivouac. Vous passez en Ligue Boussole !')
    expect(lastResultText({ weekStart: '2026-10-05', rank: 15, outcome: -1, tierBefore: 3, tierAfter: 2, size: null })).toBe('15e en Ligue Boussole. Vous continuez en Ligue Bivouac.')
    expect(leagueName(6)).toBe('Ligue Étoile polaire')
  })
})

describe('champs ajoutés par le back', () => {
  test('XP du jour, taille du groupe, places de montée, taille du groupe de la semaine passée', () => {
    const s = parseLeagueState({ ...RAW, todayXp: 300, groupSize: 18, upCount: 5, lastResult: { ...RAW.lastResult, groupSize: 17 } })!
    expect([s.todayXp, s.groupSize, s.upCount, s.lastResult?.size]).toEqual([300, 18, 5, 17])
    expect(parseLeagueState(RAW)!.todayXp).toBeNull()
  })
})
