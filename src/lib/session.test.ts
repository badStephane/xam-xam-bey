import { describe, expect, test } from 'vitest'
import { answerCard, combo, gradeCounts, isLogged, missedCards, mkSession, REDO, replayCount, suggestedGrade } from './session'
import type { Card } from './types'

const cards: Card[] = ['a', 'b', 'c'].map(id => ({ id, q: 'q ' + id, a: 'a', src: '', note: '', th: 1 }))

describe('answerCard en mode « Je réponds »', () => {
  test('refuse de noter une carte non retournée', () => {
    expect(answerCard(mkSession('self', 'daily', '', cards), 2)).toBeNull()
  })
  test('une carte ratée revient une fois en deuxième chance, sans être renotée', () => {
    let s = { ...mkSession('self', 'daily', '', cards), rev: true }
    const r1 = answerCard(s, 0)!
    expect(r1.graded).toEqual({ card: cards[0], grade: 0 })
    expect(r1.session.queue).toHaveLength(4)
    s = r1.session
    for (const g of [2, 2] as const) s = answerCard({ ...s, rev: true }, g)!.session
    const last = answerCard({ ...s, rev: true }, 2)!
    expect(last.graded).toBeNull()
    expect(last.finished).toBe(true)
    expect(last.session.res).toEqual({ a: 0, b: 2, c: 2 })
    expect(last.session.xp).toBe(20)
    expect(replayCount(r1.session)).toBe(1)
  })
})

describe('answerCard en mode « J’interroge »', () => {
  test('ne touche pas la progression et laisse la réponse visible', () => {
    const r = answerCard(mkSession('ask', 'ask', '', cards, 'Awa'), 1)!
    expect(r.graded).toBeNull()
    expect(r.session.rev).toBe(true)
    expect(r.session.queue).toHaveLength(3)
    expect(r.session.xp).toBe(0)
  })
})

describe('bilans', () => {
  const s = { ...mkSession('self', 'daily', '', cards), res: { a: 2 as const, b: 0 as const, c: 1 as const }, hist: [0, 1, 2, 2] as Array<0 | 1 | 2> }
  test('gradeCounts', () => expect(gradeCounts(s.res)).toEqual([1, 1, 1]))
  test('missedCards garde les ratées et hésitantes', () => expect(missedCards(s).map(c => c.id)).toEqual(['b', 'c']))
  test('combo compte les « su » finaux', () => expect(combo(s)).toBe(2))
  test('suggestedGrade', () => {
    expect(suggestedGrade(0, 0)).toBeNull()
    expect(suggestedGrade(3, 3)).toBe(2)
    expect(suggestedGrade(3, 1)).toBe(1)
    expect(suggestedGrade(3, 0)).toBe(0)
  })
})

describe('reprise des cartes à retravailler', () => {
  test('ne renote pas, ne rapporte pas d’XP et n’est pas journalisée', () => {
    const r = answerCard({ ...mkSession('self', REDO, '', cards), rev: true }, 2)!
    expect(r.graded).toBeNull()
    expect(r.session.xp).toBe(0)
    expect(isLogged(r.session)).toBe(false)
  })
  test('une session « Je réponds » interrompue après une réponse est journalisée', () => {
    const r = answerCard({ ...mkSession('self', 'daily', '', cards), rev: true }, 1)!
    expect(isLogged(r.session)).toBe(true)
    expect(isLogged(mkSession('self', 'daily', '', cards))).toBe(false)
    expect(isLogged({ ...mkSession('ask', 'ask', '', cards), res: { a: 2 } })).toBe(false)
  })
})
