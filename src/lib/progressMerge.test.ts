import { describe, expect, test } from 'vitest'
import { compareUtf8, MAX_XP, mergeProgress, parseStoredProgress, progressEquals } from './progressMerge'
import { KEPT_SESSIONS } from './constants'
import type { CardProgress, Progress, SessionLog } from './types'

const T = 20000
const s = (d: number, n = 5, ok = 3, k = 'day', l = 'Jour'): SessionLog => ({ d, n, ok, k, l })
const prog = (cards: Record<string, CardProgress>, sessions: SessionLog[] = [], xp = 0): Progress => ({ cards, sessions, xp })

describe('mergeProgress : cartes', () => {
  test('union des clés des deux côtés (téléphone le matin, ordinateur le soir)', () => {
    const phone = prog({ a: [1, T + 1, 1, 1, T] })
    const laptop = prog({ b: [2, T + 3, 2, 2, T] })
    expect(mergeProgress(phone, laptop).cards).toEqual({ a: [1, T + 1, 1, 1, T], b: [2, T + 3, 2, 2, T] })
  })
  test('carte notée des deux côtés : garde le plus grand nombre de vues', () => {
    const a = prog({ x: [3, T + 7, 4, 4, T - 9] })
    const b = prog({ x: [0, T + 1, 5, 3, T - 9] })
    expect(mergeProgress(a, b).cards.x).toEqual([0, T + 1, 5, 3, T - 9])
    expect(mergeProgress(b, a).cards.x).toEqual([0, T + 1, 5, 3, T - 9])
  })
  test('à égalité de vues : garde la plus grande échéance', () => {
    const a = prog({ x: [2, T + 3, 2, 2, T] })
    const b = prog({ x: [1, T + 1, 2, 1, T] })
    expect(mergeProgress(a, b).cards.x).toEqual([2, T + 3, 2, 2, T])
    expect(mergeProgress(b, a).cards.x).toEqual([2, T + 3, 2, 2, T])
  })
  test('à égalité de vues et d’échéance : choix déterministe (commutatif)', () => {
    const a = prog({ x: [2, T + 3, 2, 1, T] })
    const b = prog({ x: [1, T + 3, 2, 2, T] })
    expect(mergeProgress(a, b)).toEqual(mergeProgress(b, a))
  })
})

describe('mergeProgress : séances et XP', () => {
  test('union sans doublon, triée par jour croissant', () => {
    const a = prog({}, [s(T), s(T - 2)])
    const b = prog({}, [s(T - 1), s(T)])
    expect(mergeProgress(a, b).sessions.map(x => x.d)).toEqual([T - 2, T - 1, T])
  })
  test('deux séances différentes le même jour sont toutes deux gardées', () => {
    const merged = mergeProgress(prog({}, [s(T, 5)]), prog({}, [s(T, 10)]))
    expect(merged.sessions).toHaveLength(2)
  })
  test('doublon reconnu quel que soit l’ordre des clés JSON', () => {
    const reordered = { l: 'Jour', k: 'day', ok: 3, n: 5, d: T } as SessionLog
    expect(mergeProgress(prog({}, [s(T)]), prog({}, [reordered])).sessions).toHaveLength(1)
  })
  test('à jour égal : ordre canonique (n, ok en nombres, puis k, l), commun avec le SQL (L1-1)', () => {
    const list = [s(T, 10), s(T, 9), s(T, 9, 4), s(T, 9, 3, 'zone'), s(T, 9, 3, 'day', 'b'), s(T, 9, 3, 'Z')]
    expect(mergeProgress(prog({}, list), prog({}, [])).sessions).toEqual([
      s(T, 9, 3, 'Z'), s(T, 9), s(T, 9, 3, 'day', 'b'), s(T, 9, 3, 'zone'), s(T, 9, 4), s(T, 10),
    ])
  })
  test('coupure à 200 au milieu d’un jour : garde les plus grandes selon l’ordre canonique', () => {
    const older = Array.from({ length: KEPT_SESSIONS - 1 }, (_, i) => s(T + 1, i + 20))
    const merged = mergeProgress(prog({}, older), prog({}, [s(T, 9), s(T, 10)]))
    expect(merged.sessions[0]).toEqual(s(T, 10))
  })
  test('séances identiques sur les 5 champs mais avec un champ en plus : ordre total', () => {
    const extra = { ...s(T), x: 1 } as SessionLog
    expect(mergeProgress(prog({}, [extra]), prog({}, [s(T)]))).toEqual(mergeProgress(prog({}, [s(T)]), prog({}, [extra])))
  })
  test(`garde les ${KEPT_SESSIONS} séances les plus récentes`, () => {
    const many = Array.from({ length: KEPT_SESSIONS + 5 }, (_, i) => s(T + i))
    const merged = mergeProgress(prog({}, many), prog({}, []))
    expect(merged.sessions).toHaveLength(KEPT_SESSIONS)
    expect(merged.sessions[0].d).toBe(T + 5)
  })
  test('XP : le plus grand des deux', () => {
    expect(mergeProgress(prog({}, [], 30), prog({}, [], 10)).xp).toBe(30)
  })
})

describe('mergeProgress : propriétés', () => {
  const a = prog({ x: [1, T + 1, 1, 1, T], y: [2, T + 3, 3, 2, T - 4] }, [s(T), s(T - 1)], 40)
  const b = prog({ x: [2, T + 3, 2, 2, T], z: [0, T + 1, 1, 0, T] }, [s(T), s(T - 3, 2)], 25)
  const c = prog({ y: [0, T + 1, 4, 2, T - 4], z: [1, T + 1, 1, 1, T] }, [s(T + 1)], 60)

  test('commutative', () => expect(mergeProgress(a, b)).toEqual(mergeProgress(b, a)))
  test('idempotente', () => {
    const ab = mergeProgress(a, b)
    expect(mergeProgress(ab, ab)).toEqual(ab)
    expect(mergeProgress(ab, b)).toEqual(ab)
  })
  test('associative', () => expect(mergeProgress(mergeProgress(a, b), c)).toEqual(mergeProgress(a, mergeProgress(b, c))))
  test('ne modifie pas les entrées', () => {
    const before = JSON.stringify([a, b])
    mergeProgress(a, b)
    expect(JSON.stringify([a, b])).toBe(before)
  })
})

describe('parseStoredProgress', () => {
  test('valeurs non objet : progression vide', () => {
    for (const bad of [null, undefined, 42, 'x', []]) expect(parseStoredProgress(bad)).toEqual({ cards: {}, sessions: [], xp: 0 })
  })
  test('ignore les entrées de cartes invalides (QA-9)', () => {
    const p = parseStoredProgress({
      cards: { ok: [1, T, 1, 1, T], short: [1, T], neg: [1, T, -1, 0, T], frac: [1, T, 1.5, 0, T], nul: [3, T, null, null, T], str: 'x' },
      sessions: [], xp: 10,
    })
    expect(p.cards).toEqual({ ok: [1, T, 1, 1, T] })
  })
  test('cartes non objet : aucune carte', () => {
    expect(parseStoredProgress({ cards: [[1, T, 1, 1, T]], sessions: [], xp: 0 }).cards).toEqual({})
  })
  test('ignore les séances invalides', () => {
    const p = parseStoredProgress({ cards: {}, sessions: [s(T), null, { d: 'x' }, { ...s(T), k: 3 }], xp: 0 })
    expect(p.sessions).toEqual([s(T)])
  })
  test('XP absente ou invalide : recalculée depuis les séances', () => {
    expect(parseStoredProgress({ cards: {}, sessions: [s(T, 5, 3)] }).xp).toBe(30)
    expect(parseStoredProgress({ cards: {}, sessions: [s(T, 5, 2)], xp: -4 }).xp).toBe(20)
    expect(parseStoredProgress({ cards: {}, sessions: 'x', xp: 'x' })).toEqual({ cards: {}, sessions: [], xp: 0 })
  })
  test('XP plafonnée et arrondie', () => {
    expect(parseStoredProgress({ cards: {}, sessions: [], xp: MAX_XP + 1 }).xp).toBe(MAX_XP)
    expect(parseStoredProgress({ cards: {}, sessions: [], xp: 12.7 }).xp).toBe(12)
  })
})

describe('progressEquals', () => {
  test('vrai pour deux copies identiques, faux sinon', () => {
    const a = prog({ x: [1, T, 1, 1, T] }, [s(T)], 10)
    expect(progressEquals(a, JSON.parse(JSON.stringify(a)))).toBe(true)
    expect(progressEquals(a, { ...a, xp: 11 })).toBe(false)
    expect(progressEquals(a, { ...a, cards: {} })).toBe(false)
    expect(progressEquals(a, { ...a, cards: { x: [1, T, 2, 1, T] } })).toBe(false)
    expect(progressEquals(a, { ...a, sessions: [] })).toBe(false)
  })
})

describe('L1-13 : ordre des libellés en octets UTF-8 (comme collate "C")', () => {
  const EMOJI = '\u{1F600}' // F0 9F 98 80 en UTF-8, paire de substitution D83D DE00 en UTF-16
  const FULLWIDTH = '\uFF01' // EF BC 81 en UTF-8
  test('un emoji (hors BMP) se range après U+FF01, comme en SQL', () => {
    expect(compareUtf8(EMOJI, FULLWIDTH)).toBeGreaterThan(0)
    expect(compareUtf8(FULLWIDTH, EMOJI)).toBeLessThan(0)
  })
  test('cas simples : égalité, préfixe, ASCII avant accents, majuscules avant minuscules', () => {
    expect(compareUtf8('daily', 'daily')).toBe(0)
    expect(compareUtf8('da', 'daily')).toBeLessThan(0)
    expect(compareUtf8('Zone', 'daily')).toBeLessThan(0)
    expect(compareUtf8('éval', 'zone')).toBeGreaterThan(0)
  })
  test('mergeProgress range les séances du même rang par k puis l en octets UTF-8', () => {
    const a = prog({}, [s(T, 5, 3, EMOJI), s(T, 5, 3, 'x', EMOJI)])
    const b = prog({}, [s(T, 5, 3, FULLWIDTH), s(T, 5, 3, 'x', FULLWIDTH)])
    expect(mergeProgress(a, b).sessions.map(x => [x.k, x.l])).toEqual([['x', FULLWIDTH], ['x', EMOJI], [FULLWIDTH, 'Jour'], [EMOJI, 'Jour']])
  })
})
