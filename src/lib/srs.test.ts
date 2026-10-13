import { describe, expect, test } from 'vitest'
import { allCards, applyGrade, cardsByZone, bestStreak, dailyCards, EMPTY_PROGRESS, levelBuckets, readProgress, seenCurve, streak, validCards, xpLevel, zoneStats } from './srs'
import type { Card, Progress } from './types'

const T = 20000
const card = (id: string, th = 1): Card => ({ id, q: 'q', a: 'a', src: '', note: '', th })

describe('applyGrade', () => {
  test('su sur une carte neuve passe au niveau 1 et revient à J+1', () => {
    const p = applyGrade(EMPTY_PROGRESS, 't1', 2, T)
    expect(p.cards.t1).toEqual([1, T + 1, 1, 1, T])
    expect(p.xp).toBe(10)
  })
  test('su successifs, chacun à l’échéance, suivent les intervalles et plafonnent au niveau 5', () => {
    let p: Progress = EMPTY_PROGRESS
    const dues: number[] = []
    for (let i = 0; i < 7; i++) {
      const day = p.cards.t1?.[1] ?? T
      p = applyGrade(p, 't1', 2, day)
      dues.push(p.cards.t1[1] - day)
    }
    expect(dues).toEqual([1, 3, 7, 21, 60, 60, 60])
    expect(p.cards.t1[0]).toBe(5)
  })
  test('raté remet au niveau 0 et revient le lendemain', () => {
    const p = applyGrade(applyGrade(applyGrade(EMPTY_PROGRESS, 't1', 2, T), 't1', 2, T + 1), 't1', 0, T + 1)
    expect(p.cards.t1.slice(0, 2)).toEqual([0, T + 2])
  })
  test('D2 : 5 « Su » le même jour ne donnent qu’un seul niveau (QA-3)', () => {
    let p: Progress = EMPTY_PROGRESS
    for (let i = 0; i < 5; i++) p = applyGrade(p, 't1', 2, T)
    expect(p.cards.t1).toEqual([1, T + 1, 5, 5, T])
    expect(p.xp).toBe(50)
  })
  test('D2 : hors calendrier, vues, réussites et XP comptent ; niveau et échéance ne bougent pas', () => {
    const start: Progress = { cards: { t1: [3, T + 5, 4, 3, T - 20] }, sessions: [], xp: 100 }
    expect(applyGrade(start, 't1', 2, T)).toEqual({ ...start, cards: { t1: [3, T + 5, 5, 4, T - 20] }, xp: 110 })
    expect(applyGrade(start, 't1', 1, T)).toEqual({ ...start, cards: { t1: [3, T + 5, 5, 3, T - 20] }, xp: 105 })
  })
  test('D2 : « Raté » remet toujours à zéro, même hors calendrier', () => {
    const start: Progress = { cards: { t1: [4, T + 15, 6, 6, T - 30] }, sessions: [], xp: 0 }
    expect(applyGrade(start, 't1', 0, T).cards.t1).toEqual([0, T + 1, 7, 6, T - 30])
  })
  test('D2 : une carte due (échéance passée) monte d’un niveau', () => {
    const start: Progress = { cards: { t1: [2, T - 2, 3, 3, T - 10] }, sessions: [], xp: 0 }
    expect(applyGrade(start, 't1', 2, T).cards.t1).toEqual([3, T + 7, 4, 4, T - 10])
  })
  test('hésitant garde le niveau (minimum 1) et rapporte 5 XP', () => {
    const p = applyGrade(EMPTY_PROGRESS, 't1', 1, T)
    expect(p.cards.t1[0]).toBe(1)
    expect(p.xp).toBe(5)
  })
  test('ne modifie pas la progression d’origine', () => {
    const before = readProgress({})
    applyGrade(before, 't1', 2, T)
    expect(before.cards).toEqual({})
  })
})

describe('readProgress', () => {
  test('reconstitue l’XP des anciennes progressions à partir des sessions', () => {
    expect(readProgress({ sessions: [{ d: 1, n: 5, ok: 3, k: 'daily', l: '' }] }).xp).toBe(30)
  })
  test('garde l’XP enregistrée', () => {
    expect(readProgress({ xp: 640 }).xp).toBe(640)
  })
  test('QA-9 : une entrée de carte corrompue est ignorée, les autres sont gardées', () => {
    const p = readProgress({ cards: { ok: [1, T, 1, 1, T], bad: [3, T, null, null, T], short: [1, 2], txt: 'x' } as never, xp: 10 })
    expect(p.cards).toEqual({ ok: [1, T, 1, 1, T] })
    expect(applyGrade(p, 'bad', 2, T).cards.bad).toEqual([1, T + 1, 1, 1, T])
  })
  test('QA-9 : séances invalides ignorées, contenu non objet donne une progression vide', () => {
    expect(readProgress({ sessions: [{ d: 1, n: 5, ok: 3, k: 'daily', l: '' }, null, { d: 'x' }] as never }).sessions).toHaveLength(1)
    expect(readProgress(null as never)).toEqual(EMPTY_PROGRESS)
  })
})

describe('validCards et allCards', () => {
  test('écarte les cartes incomplètes et trie par zone', () => {
    const c2 = validCards([{ id: 'b', q: 'q', a: 'a' }], 2)
    const c1 = validCards([{ id: 'a', q: 'q', a: 'a' }, { id: 'x' }, null, 'bad'], 1)
    expect(allCards({ plan: null, fiches: {}, cards: { 2: c2, 1: c1 } }).map(c => c.id)).toEqual(['a', 'b'])
    expect(validCards('pas une liste', 1)).toEqual([])
  })
})

describe('session du jour', () => {
  test('mélange cartes échues et nouvelles, sans dépasser 10 nouvelles par jour', () => {
    const cards = Array.from({ length: 15 }, (_, i) => card('c' + i))
    const prog: Progress = { cards: { c0: [1, T, 1, 1, T - 3] }, sessions: [], xp: 0 }
    const { due, fresh } = dailyCards(cards, prog, T, 1)
    expect(due.map(c => c.id)).toEqual(['c0'])
    expect(fresh).toHaveLength(10)
  })
  test('n’introduit pas les cartes des zones futures', () => {
    const { fresh } = dailyCards([card('a', 1), card('b', 2)], EMPTY_PROGRESS, T, 1)
    expect(fresh.map(c => c.id)).toEqual(['a'])
  })
})

describe('séries', () => {
  const prog = (days: number[]): Progress => ({ cards: {}, sessions: days.map(d => ({ d, n: 1, ok: 1, k: 'daily', l: '' })), xp: 0 })
  test('compte les jours consécutifs jusqu’à hier si rien aujourd’hui', () => {
    expect(streak(prog([T - 3, T - 2, T - 1]), T)).toBe(3)
    expect(streak(prog([T - 3]), T)).toBe(0)
  })
  test('meilleure série', () => {
    expect(bestStreak(prog([1, 2, 3, 7, 8]))).toBe(3)
    expect(bestStreak(prog([]))).toBe(0)
  })
})

describe('statistiques', () => {
  const prog: Progress = { cards: { a: [4, T, 1, 1, T - 2], b: [1, T, 1, 0, T] }, sessions: [{ d: T, n: 1, ok: 1, k: 'daily', l: '' }], xp: 0 }
  test('zoneStats compte les cartes acquises (niveau 4 et plus)', () => {
    expect(zoneStats([card('a'), card('b'), card('c')], prog)).toEqual({ cards: 3, acq: 1 })
    expect(zoneStats(undefined, prog)).toEqual({ cards: 0, acq: 0 })
  })
  test('levelBuckets sépare les cartes jamais vues', () => {
    expect(levelBuckets([card('a'), card('b'), card('c')], prog)).toEqual([1, 0, 1, 0, 0, 1, 0])
  })
  test('seenCurve cumule les premières vues', () => {
    expect(seenCurve(prog, T, 3)).toEqual([{ d: T - 2, v: 1, on: false }, { d: T - 1, v: 1, on: false }, { d: T, v: 2, on: true }])
  })
  test('xpLevel : 640 XP = niveau 4, Éclaireur, 640/800', () => {
    expect(xpLevel(640)).toEqual({ lv: 4, rank: 'Éclaireur', xp: 640, next: 800, fill: 16 })
    expect(xpLevel(99999).rank).toBe('Ancien')
  })
})

describe('cardsByZone', () => {
  test('ne garde que les cartes publiées, par zone et dans l’ordre', () => {
    const row = (id: string, zone: number, position: number, status: 'draft' | 'published') =>
      ({ id, zone, position, status, document_id: null, q: 'q', a: 'a', src: '', note: '', qcm: null })
    const out = cardsByZone([row('b', 1, 2, 'published'), row('a', 1, 1, 'published'), row('d', 1, 3, 'draft'), row('c', 2, 1, 'published')])
    expect(Object.keys(out)).toEqual(['1', '2'])
    expect(out[1].map(c => c.id)).toEqual(['a', 'b'])
    expect(out[2][0].th).toBe(2)
  })
})
