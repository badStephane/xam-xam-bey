import { describe, expect, test } from 'vitest'
import { gradeFloorKey, gradeIndex, gradeInfo, initialGradeFloor, legacyGradeIndex, levelFill, readGradeFloor, writeGradeFloor } from './grades'
import { EMPTY_PROGRESS } from './srs'

const mem = (): Storage => {
  const m = new Map<string, string>()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: k => { m.delete(k) }, clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size } }
}

describe('grades (C2, A1)', () => {
  test('seuils du nouveau barème', () => {
    expect([0, 199, 200, 499, 500, 999, 1000, 1999, 2000, 3500, 6000, 9999, 10000, 1e7].map(gradeIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 6, 7, 7])
  })

  test('ancien barème : un grade par niveau de 200 XP, Ancien dès 1 400 XP', () => {
    expect(legacyGradeIndex(0)).toBe(0)
    expect(legacyGradeIndex(640)).toBe(3)
    expect(legacyGradeIndex(1400)).toBe(7)
  })

  test('A1 : jamais plus bas que le plancher retenu', () => {
    expect(gradeInfo(640, 3).name).toBe('Éclaireur')
    expect(gradeInfo(640, 0).name).toBe('Campeur')
    expect(gradeInfo(1500, 7)).toEqual({ index: 7, name: 'Ancien', next: null })
    expect(gradeInfo(2500, 1).name).toBe('Guide')
    expect(gradeInfo(2500, 1).next).toEqual({ name: 'Pionnier', from: 3500 })
  })

  test('plancher initial : ancien grade seulement si le compte a révisé avant la date limite', () => {
    const old = { ...EMPTY_PROGRESS, xp: 1240, sessions: [{ d: 100, n: 1, ok: 1, k: 'daily', l: '' }] }
    expect(initialGradeFloor(old, 200)).toBe(6)
    expect(initialGradeFloor(old, 50)).toBe(0)
    expect(initialGradeFloor({ ...EMPTY_PROGRESS, xp: 1240 }, 200)).toBe(0)
  })

  test('annexe A1 : la barre se remplit dans le niveau en cours', () => {
    expect(levelFill(0)).toBe(0)
    expect(levelFill(100)).toBe(10)
    expect(levelFill(1240)).toBe(4)
    expect(levelFill(1399)).toBe(20)
  })

  test('plancher gardé par compte, valeur invalide ignorée', () => {
    const s = mem()
    expect(readGradeFloor(s, 'u1')).toBeNull()
    writeGradeFloor(s, 'u1', 5)
    expect(readGradeFloor(s, 'u1')).toBe(5)
    expect(readGradeFloor(s, 'u2')).toBeNull()
    s.setItem(gradeFloorKey('u1'), '99')
    expect(readGradeFloor(s, 'u1')).toBeNull()
    expect(readGradeFloor(null, 'u1')).toBeNull()
  })
})
