import { describe, expect, test } from 'vitest'
import { dayChanged, msUntilNextDay, nextNow } from './clock'

const at = (h: number, m = 0, day = 12) => new Date(2026, 9, day, h, m)

describe('dayChanged', () => {
  test('même jour civil : faux', () => expect(dayChanged(at(0, 1), at(23, 59))).toBe(false))
  test('passage de minuit : vrai', () => expect(dayChanged(at(23, 59), at(0, 1, 13))).toBe(true))
})

describe('nextNow', () => {
  test('garde la même date tant que le jour ne change pas (pas de rendu inutile)', () => {
    const prev = at(9)
    expect(nextNow(prev, at(18))).toBe(prev)
  })
  test('onglet rouvert le lendemain : nouvelle date', () => {
    const next = at(7, 30, 13)
    expect(nextNow(at(22), next)).toBe(next)
  })
})

describe('msUntilNextDay', () => {
  test('délai jusqu’à minuit, plus une marge', () => {
    const ms = msUntilNextDay(at(23, 59))
    expect(ms).toBeGreaterThan(60_000)
    expect(ms).toBeLessThan(62_000)
    expect(dayChanged(at(23, 59), new Date(at(23, 59).getTime() + ms))).toBe(true)
  })
  test('jamais nul ni négatif', () => expect(msUntilNextDay(new Date(2026, 9, 12, 23, 59, 59, 999))).toBeGreaterThan(0))
})
