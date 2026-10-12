import { describe, expect, test } from 'vitest'
import { demoProgress, demoSession, DEMO_DAILY } from './demo'
import type { Card } from './types'

const cards: Card[] = Array.from({ length: 60 }, (_, i) => ({ id: `t1-${String(i + 1).padStart(2, '0')}`, q: 'q', a: 'a', src: '', note: '', th: 1 }))

describe('démonstration', () => {
  test('progression : 28 cartes acquises, cartes du jour échues, 640 XP', () => {
    const p = demoProgress(cards, 100)
    expect(Object.values(p.cards).filter(c => c[0] >= 4)).toHaveLength(28)
    expect(DEMO_DAILY.every(id => p.cards[id][1] === 100)).toBe(true)
    expect(p.xp).toBe(640)
    expect(p.sessions.filter(s => s.k === 'exam')).toHaveLength(3)
  })
  test('sessions selon la phase', () => {
    expect(demoSession(cards, 'self', 'question', false).session.i).toBe(3)
    expect(demoSession(cards, 'self', 'answer', false).session.rev).toBe(true)
    expect(demoSession(cards, 'self', 'second', false).session.queue[8].second).toBe(true)
    expect(Object.keys(demoSession(cards, 'self', '', true).session.res)).toHaveLength(8)
    const ask = demoSession(cards, 'ask', '', false)
    expect(ask.session.name).toBe('Awa')
    expect(ask.checks).toEqual({ 0: true, 1: true })
    expect(demoSession(cards, 'ask', '', true).session.i).toBe(10)
  })
})
