import { describe, expect, test } from 'vitest'
import { ALL_ZONES, gapCards, isGap, selectCards, zoneReport } from './practice'
import { seeded } from './qcm'
import type { Card, Progress } from './types'

const card = (id: string, th: number): Card => ({ id, q: 'q', a: 'a', src: '', note: '', th })
const cards = [card('a', 1), card('b', 1), card('c', 1), card('d', 2), card('e', 2)]
// [niveau, échéance, vues, réussites, premier jour]
const prog: Progress = {
  cards: { a: [0, 1, 3, 1, 1], b: [4, 1, 5, 5, 1], c: [3, 1, 5, 2, 1], d: [1, 1, 1, 0, 1] },
  sessions: [], xp: 0,
}

describe('lacunes', () => {
  test('isGap : ratée récemment, ou réussie moins de 60 % du temps', () => {
    expect(isGap(prog.cards.a)).toBe(true)
    expect(isGap(prog.cards.b)).toBe(false)
    expect(isGap(prog.cards.c)).toBe(true)
    expect(isGap(undefined)).toBe(false)
  })
  test('gapCards trie de la plus faible à la moins faible', () => {
    expect(gapCards(cards, prog).map(c => c.id)).toEqual(['a', 'd', 'c'])
  })
})

describe('selectCards', () => {
  test('toutes les zones ou une seule', () => {
    expect(selectCards(cards, prog, ALL_ZONES, 'all', 99, seeded(1))).toHaveLength(5)
    expect(selectCards(cards, prog, 2, 'all', 99, seeded(1)).map(c => c.th)).toEqual([2, 2])
  })
  test('lacunes d’une zone, limitées au nombre demandé et choisies parmi les plus faibles', () => {
    expect(selectCards(cards, prog, 1, 'gaps', 99, seeded(2)).map(c => c.id).sort()).toEqual(['a', 'c'])
    expect(selectCards(cards, prog, ALL_ZONES, 'gaps', 2, seeded(2)).map(c => c.id).sort()).toEqual(['a', 'd'])
  })
  test('jamais vues', () => {
    expect(selectCards(cards, prog, ALL_ZONES, 'new', 99, seeded(3)).map(c => c.id)).toEqual(['e'])
  })
})

describe('zoneReport', () => {
  test('compte les cartes vues, les lacunes et le taux de réussite', () => {
    expect(zoneReport(cards, prog, 1)).toEqual({ zone: 1, cards: 3, seen: 3, gaps: 2, rate: 8 / 13 })
    expect(zoneReport(cards, { cards: {}, sessions: [], xp: 0 }, 2).rate).toBeNull()
  })
})
