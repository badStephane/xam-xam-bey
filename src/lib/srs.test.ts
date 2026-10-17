import { describe, expect, test } from 'vitest'
import { allCards, applyGrade, cardsByZone, bestStreak, dailyCards, EMPTY_PROGRESS, levelBuckets, newCards, readProgress, seenCurve, streak, streakState, validCards, validDocId, xpLevel, zoneStats } from './srs'
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
  test('raté fait baisser de 2 niveaux (minimum 0) et revient le lendemain', () => {
    const p = applyGrade(applyGrade(applyGrade(EMPTY_PROGRESS, 't1', 2, T), 't1', 2, T + 1), 't1', 0, T + 1)
    expect(p.cards.t1.slice(0, 2)).toEqual([0, T + 2])
    const known: Progress = { cards: { t1: [5, T, 9, 9, T - 90] }, sessions: [], xp: 0 }
    expect(applyGrade(known, 't1', 0, T).cards.t1.slice(0, 2)).toEqual([3, T + 1])
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
  test('D2 : « Raté » fait toujours baisser de 2 niveaux et revenir demain, même hors calendrier', () => {
    const start: Progress = { cards: { t1: [4, T + 15, 6, 6, T - 30] }, sessions: [], xp: 0 }
    expect(applyGrade(start, 't1', 0, T).cards.t1).toEqual([2, T + 1, 7, 6, T - 30])
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

describe('gel de série', () => {
  const prog = (days: number[]): Progress => ({ cards: {}, sessions: days.map(d => ({ d, n: 1, ok: 1, k: 'daily', l: '' })), xp: 0 })
  const run = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i)

  test('moins de 7 jours de suite : aucun gel, un jour manqué casse la série', () => {
    expect(streakState(prog(run(T - 6, T - 2)), T)).toEqual({ current: 0, best: 5, freezes: 0, frozeYesterday: false })
  })
  test('7 jours de suite donnent un gel, utilisé automatiquement pour un jour manqué', () => {
    // Révisé de T-8 à T-2 (7 jours), rien hier (T-1), journée en cours aujourd'hui.
    expect(streakState(prog(run(T - 8, T - 2)), T)).toEqual({ current: 7, best: 7, freezes: 0, frozeYesterday: true })
    // Révision aujourd'hui : la série reprend, le jour gelé ne compte pas.
    expect(streakState(prog([...run(T - 8, T - 2), T]), T)).toMatchObject({ current: 8, freezes: 0, frozeYesterday: true })
  })
  test('deux jours manqués avec un seul gel : la série repart à zéro', () => {
    expect(streakState(prog(run(T - 9, T - 3)), T)).toMatchObject({ current: 0, best: 7, freezes: 0 })
  })
  test('réserve plafonnée à 2 gels ; deux jours manqués couverts', () => {
    expect(streakState(prog(run(T - 21, T)), T)).toMatchObject({ current: 22, freezes: 2 })
    expect(streakState(prog(run(T - 23, T - 3)), T)).toMatchObject({ current: 21, freezes: 0, frozeYesterday: true })
  })
  test('aujourd’hui n’est pas manqué tant que la journée n’est pas finie', () => {
    expect(streakState(prog(run(T - 7, T - 1)), T)).toEqual({ current: 7, best: 7, freezes: 1, frozeYesterday: false })
  })
  test('streak et bestStreak suivent la règle du gel', () => {
    const days = [...run(1, 7), 9, 10]
    expect(bestStreak(prog(days))).toBe(9)
    expect(streak(prog(run(T - 8, T - 2)), T)).toBe(7)
  })
  test('aucune séance : série nulle', () => {
    expect(streakState(prog([]), T)).toEqual({ current: 0, best: 0, freezes: 0, frozeYesterday: false })
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

describe('document relié à une carte (E4)', () => {
  const row = (document_id: unknown) => ({ id: 't1-01', zone: 1, document_id, position: 1, q: 'q', a: 'a', src: 's', note: '', qcm: null, status: 'published' as const })

  test('document_id valide : la carte garde son document', () => {
    expect(cardsByZone([row(12) as never])[1][0].doc).toBe(12)
  })

  test.each([null, 0, -3, 1.5, '12', undefined])('document_id %s ignoré : carte sans document, sans erreur', v => {
    const [card] = cardsByZone([row(v) as never])[1]
    expect(card).toBeDefined()
    expect('doc' in card).toBe(false)
  })

  test('validDocId', () => {
    expect(validDocId(7)).toBe(7)
    expect(validDocId(NaN)).toBeNull()
  })
})

describe('paliers de difficulté', () => {
  const tiered = (id: string, tier: number, th = 1): Card => ({ ...card(id, th), ...(tier > 1 ? { tier } : {}) })
  const basics = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10'].map(id => tiered(id, 1))
  const hard = [tiered('h1', 2), tiered('h2', 2), tiered('x1', 3)]
  const atLevel = (ids: string[], lv: number): Progress =>
    ({ cards: Object.fromEntries(ids.map(id => [id, [lv, T + 30, 3, 3, T - 30]])), sessions: [], xp: 0 })

  test('validCards lit le palier (1 à 3) ; absent ou invalide : palier 1', () => {
    const [a, b, c] = validCards([{ id: 'a', q: 'q', a: 'a', tier: 3 }, { id: 'b', q: 'q', a: 'a', tier: 9 }, { id: 'c', q: 'q', a: 'a' }], 1)
    expect(a.tier).toBe(3)
    expect(b.tier).toBeUndefined()
    expect(c.tier).toBeUndefined()
  })
  test('cardsByZone garde le palier de la ligne', () => {
    const row = { id: 'h1', zone: 1, document_id: null, position: 1, q: 'q', a: 'a', src: '', note: '', qcm: null, status: 'published' as const, tier: 2 }
    expect(cardsByZone([row])[1][0].tier).toBe(2)
  })
  test('palier 2 fermé tant que moins de 70 % du palier 1 de la zone est au niveau 2', () => {
    const prog = atLevel(['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], 2)
    expect(newCards([...basics, ...hard], prog, 1, 10).map(c => c.id)).toEqual(['b7', 'b8', 'b9', 'b10'])
  })
  test('palier 2 ouvert à 70 % ; palier 3 encore fermé', () => {
    const prog = atLevel(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'], 2)
    expect(newCards([...basics, ...hard], prog, 1, 10).map(c => c.id)).toEqual(['b8', 'b9', 'b10', 'h1', 'h2'])
  })
  test('palier 3 ouvert quand le palier 2 l’est aussi à 70 %', () => {
    const prog = atLevel([...basics.map(c => c.id), 'h1', 'h2'], 3)
    expect(newCards([...basics, ...hard], prog, 1, 10).map(c => c.id)).toEqual(['x1'])
  })
  test('chaque zone a ses propres paliers', () => {
    const prog = atLevel(basics.map(c => c.id), 2)
    const zone2 = [tiered('z2a', 1, 2), tiered('z2h', 2, 2)]
    expect(newCards([...basics, ...hard, ...zone2], prog, 2, 10).map(c => c.id)).toEqual(['h1', 'h2', 'z2a'])
  })
  test('zone sans question de palier 1 : le palier 2 est ouvert', () => {
    expect(newCards([tiered('h1', 2)], EMPTY_PROGRESS, 1, 10).map(c => c.id)).toEqual(['h1'])
  })
})
