import { describe, expect, test } from 'vitest'
import { localBadges, newlyEarned, readSeenDates, recordSeenDates, serverBadges } from './badges'
import { EMPTY_PROGRESS } from './srs'
import type { Card, CardProgress, Progress } from './types'

const mem = (): Storage => {
  const m = new Map<string, string>()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: k => { m.delete(k) }, clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size } }
}
const T = 20740
const cards = (zone: number, n: number): Card[] => Array.from({ length: n }, (_, i) => ({ id: `z${zone}-${i}`, q: 'q', a: 'a', src: '', note: '', th: zone }))
const prog = (entries: Record<string, CardProgress>, sessions: Progress['sessions'] = []): Progress => ({ ...EMPTY_PROGRESS, cards: entries, sessions })
const get = (list: ReturnType<typeof localBadges>, id: string) => list.find(b => b.id === id)!

describe('badges locaux (C6)', () => {
  test('progression vide : 10 badges, aucun obtenu, progression chiffrée', () => {
    const l = localBadges(EMPTY_PROGRESS, {})
    expect(l).toHaveLength(10)
    expect(l.every(b => !b.earned)).toBe(true)
    expect(get(l, 'cards100').progress).toEqual([0, 100])
  })

  test('premier pas, cent cartes (somme des vues), séries', () => {
    const p = prog({ a: [1, T, 60, 30, T], b: [1, T, 40, 20, T] }, [T - 2, T - 1, T].map(d => ({ d, n: 1, ok: 1, k: 'daily', l: '' })))
    const l = localBadges(p, {})
    expect(get(l, 'first').earned).toBe(true)
    expect(get(l, 'cards100').earned).toBe(true)
    expect(get(l, 'cards1000').progress).toEqual([100, 1000])
    expect(get(l, 'streak3').earned).toBe(true)
    expect(get(l, 'streak7').progress).toEqual([3, 7])
  })

  test('zone maîtrisée (×n, 10 cartes au moins) et cartographe (6 zones)', () => {
    const z1 = cards(1, 10)
    const z2 = cards(2, 3)
    const entries = Object.fromEntries([...z1, ...z2].map(c => [c.id, [4, T + 10, 5, 5, T] as CardProgress]))
    const l = localBadges(prog(entries), { 1: z1, 2: z2 })
    expect(get(l, 'zone')).toMatchObject({ earned: true, count: 1 })
    expect(get(l, 'cartographer').progress).toEqual([2, 6])
  })

  test('sans faute (daily ≥ 10 sans erreur) et examen parfait (10/10)', () => {
    const l = localBadges(prog({}, [{ d: T, n: 10, ok: 10, k: 'daily', l: '' }, { d: T, n: 10, ok: 9, k: 'exam', l: '' }]), {})
    expect(get(l, 'perfect').earned).toBe(true)
    expect(get(l, 'exam').earned).toBe(false)
  })

  test('nouveaux badges : obtenus ou compteur augmenté pendant la séance', () => {
    const before = localBadges(EMPTY_PROGRESS, {})
    const after = localBadges(prog({ a: [1, T, 1, 1, T] }), {})
    expect(newlyEarned(before, after).map(b => b.id)).toEqual(['first'])
    expect(newlyEarned(after, after)).toEqual([])
  })
})

describe('badges du serveur', () => {
  test('compteurs (défi, podium) et Étoile polaire par la ligue', () => {
    const s = serverBadges([
      { badge: 'challenge', weekStart: '2026-10-05', earnedAt: '2026-10-12T06:00:00Z' },
      { badge: 'challenge', weekStart: '2026-09-28', earnedAt: '2026-10-05T06:00:00Z' },
      { badge: 'podium', weekStart: '2026-10-05', earnedAt: '2026-10-12T06:00:00Z' },
    ], 6)
    expect(s.map(b => [b.id, b.earned, b.count])).toEqual([['challenge', true, 2], ['promoted', false, 0], ['podium', true, 1], ['polar', true, 0]])
    expect(s.every(b => b.server)).toBe(true)
  })
})

describe('dates de premier constat', () => {
  test('datées une fois, jamais réécrites', () => {
    const s = mem()
    const l = localBadges(prog({ a: [1, T, 1, 1, T] }), {})
    expect(recordSeenDates(s, 'u', l, T)).toEqual({ first: T })
    expect(recordSeenDates(s, 'u', l, T + 3)).toEqual({ first: T })
    expect(readSeenDates(s, 'other')).toEqual({})
  })
})
