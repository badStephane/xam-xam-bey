import { describe, expect, test } from 'vitest'
import { ALL_ZONES, gapCards, isGap, selectCards, zoneReport } from './practice'
import { seeded } from './qcm'
import type { Card, Progress } from './types'

const card = (id: string, th: number): Card => ({ id, q: 'q', a: 'a', src: '', note: '', th })
const cards = [card('a', 1), card('b', 1), card('c', 1), card('d', 2), card('e', 2), card('f', 1)]
// [niveau, échéance, vues, réussites, premier jour]
const prog: Progress = {
  cards: { a: [0, 1, 3, 1, 1], b: [4, 1, 5, 5, 1], c: [3, 1, 5, 2, 1], d: [1, 1, 1, 0, 1], f: [1, 1, 4, 3, 1] },
  sessions: [], xp: 0,
}

describe('lacunes', () => {
  test('D3 : lacune = vues > réussites et niveau ≤ GAP_MAX_LEVEL', () => {
    expect(isGap(prog.cards.a)).toBe(true)
    expect(isGap(prog.cards.b)).toBe(false)
    expect(isGap(prog.cards.c)).toBe(false)
    expect(isGap(prog.cards.d)).toBe(true)
    expect(isGap(prog.cards.f)).toBe(true)
    expect(isGap(undefined)).toBe(false)
  })
  test('D3 (QA-4) : une carte réussie du premier coup n’est pas une lacune', () => {
    expect(isGap([1, 2, 1, 1, 1])).toBe(false)
  })
  test('gapCards trie de la plus faible à la moins faible', () => {
    expect(gapCards(cards, prog).map(c => c.id)).toEqual(['a', 'd', 'f'])
  })
})

describe('selectCards', () => {
  test('toutes les zones ou une seule', () => {
    expect(selectCards(cards, prog, ALL_ZONES, 'all', 99, seeded(1))).toHaveLength(6)
    expect(selectCards(cards, prog, 2, 'all', 99, seeded(1)).map(c => c.th)).toEqual([2, 2])
  })
  test('lacunes d’une zone, limitées au nombre demandé et choisies parmi les plus faibles', () => {
    expect(selectCards(cards, prog, 1, 'gaps', 99, seeded(2)).map(c => c.id).sort()).toEqual(['a', 'f'])
    expect(selectCards(cards, prog, ALL_ZONES, 'gaps', 2, seeded(2)).map(c => c.id).sort()).toEqual(['a', 'd'])
  })
  test('jamais vues', () => {
    expect(selectCards(cards, prog, ALL_ZONES, 'new', 99, seeded(3)).map(c => c.id)).toEqual(['e'])
  })
})

describe('zoneReport', () => {
  test('compte les cartes vues, les lacunes et le taux de réussite', () => {
    expect(zoneReport(cards, prog, 1)).toEqual({ zone: 1, cards: 4, seen: 4, gaps: 2, rate: 11 / 17 })
    expect(zoneReport(cards, { cards: {}, sessions: [], xp: 0 }, 2).rate).toBeNull()
  })
})
