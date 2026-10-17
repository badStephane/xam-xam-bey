import { describe, expect, test } from 'vitest'
import { advance, answerCard, combo, gradeCounts, isLogged, isScored, missedCards, mkSession, positionXp, REDO, replayCount, scoreCurrent, suggestedGrade } from './session'
import type { Card, Session } from './types'

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
  test('ne renote pas et n’est pas journalisée ; une carte sue rapporte un bonus d’XP perso', () => {
    const r = answerCard({ ...mkSession('self', REDO, '', cards), rev: true }, 2)!
    expect(r.graded).toBeNull()
    expect(r.bonus).toBe(2)
    expect(r.session.xp).toBe(2)
    expect(isLogged(r.session)).toBe(false)
  })
  test('une carte encore ratée ou hésitante en reprise ne rapporte rien', () => {
    for (const g of [0, 1] as const) {
      const r = answerCard({ ...mkSession('self', REDO, '', cards), rev: true }, g)!
      expect(r.bonus).toBe(0)
      expect(r.session.xp).toBe(0)
    }
  })
  test('hors reprise, aucun bonus : la note passe par la progression (graded)', () => {
    expect(answerCard({ ...mkSession('self', 'daily', '', cards), rev: true }, 2)!.bonus).toBe(0)
    expect(answerCard(mkSession('ask', 'ask', '', cards, 'Awa'), 2)!.bonus).toBe(0)
  })
  test('positionXp : XP réellement gagnée par la réponse affichée', () => {
    const daily = scoreCurrent({ ...mkSession('self', 'daily', '', cards), rev: true }, 2)!.session
    expect(positionXp(daily)).toBe(10)
    const redo = scoreCurrent({ ...mkSession('self', REDO, '', cards), rev: true }, 2)!.session
    expect(positionXp(redo)).toBe(2)
    // Deuxième chance d'une carte ratée : affichée, jamais comptée.
    const missed = answerCard({ ...mkSession('self', 'daily', '', cards.slice(0, 1)), rev: true }, 0)!.session
    const second = scoreCurrent({ ...missed, rev: true }, 2)!.session
    expect(positionXp(second)).toBe(0)
  })
  test('une session « Je réponds » interrompue après une réponse est journalisée', () => {
    const r = answerCard({ ...mkSession('self', 'daily', '', cards), rev: true }, 1)!
    expect(isLogged(r.session)).toBe(true)
    expect(isLogged(mkSession('self', 'daily', '', cards))).toBe(false)
    expect(isLogged({ ...mkSession('ask', 'ask', '', cards), res: { a: 2 } })).toBe(false)
  })
})

describe('E1 : une réponse compte dès que la correction s’affiche', () => {
  const ch = { options: ['x', 'y'], correct: 0 }
  const qcm = () => ({ ...mkSession('self', 'daily', '', cards), queue: cards.map(c => ({ c, second: false, ch })) })

  test('la note est posée à la correction, sans changer de carte', () => {
    const r = scoreCurrent({ ...qcm(), rev: true, picked: 0 }, 2)!
    expect(r.graded).toEqual({ card: cards[0], grade: 2 })
    expect(r.session.i).toBe(0)
    expect(r.session.res).toEqual({ a: 2 })
    expect(r.session.xp).toBe(10)
    expect(isScored(r.session)).toBe(true)
  })

  test('une carte notée ne peut pas être notée une deuxième fois', () => {
    const r = scoreCurrent({ ...qcm(), rev: true }, 0)!
    expect(scoreCurrent(r.session, 2)).toBeNull()
    expect(r.session.queue).toHaveLength(4)
  })

  test('« Suivant » change de carte sans rien noter', () => {
    const scored = scoreCurrent({ ...qcm(), rev: true, picked: 1 }, 0)!.session
    const moved = advance(scored)!
    expect(moved.session.i).toBe(1)
    expect(moved.session.rev).toBe(false)
    expect(moved.session.picked).toBeNull()
    expect(moved.session.res).toEqual(scored.res)
    expect(moved.session.xp).toBe(scored.xp)
    expect(moved.finished).toBe(false)
  })

  test('« Suivant » refuse une carte pas encore notée', () => {
    expect(advance({ ...qcm(), rev: true })).toBeNull()
  })

  test('answerCard sur une carte déjà notée avance sans renoter (auto-évaluation, interrogation)', () => {
    const scored = scoreCurrent({ ...qcm(), rev: true }, 2)!.session
    const r = answerCard(scored, 0)!
    expect(r.graded).toBeNull()
    expect(r.session.res).toEqual({ a: 2 })
    expect(r.session.hist).toEqual([2])
    expect(r.session.i).toBe(1)
  })

  test('auto-évaluation : la réponse révélée puis notée compte une fois et avance', () => {
    const self = { ...mkSession('self', 'daily', '', cards), queue: cards.map(c => ({ c, second: false, ch: { options: [], correct: -1 } })), rev: true }
    const r = answerCard(self, 2)!
    expect(r.graded).toEqual({ card: cards[0], grade: 2 })
    expect(r.session.i).toBe(1)
    expect(isScored(r.session)).toBe(false)
  })

  test('dernière carte : le bilan vient au passage, pas à la correction', () => {
    let s: Session = { ...qcm(), queue: [{ c: cards[0], second: false, ch }] }
    s = scoreCurrent({ ...s, rev: true }, 2)!.session
    expect(advance(s)!.finished).toBe(true)
  })

  test('interrogation : rien n’est noté dans la progression', () => {
    const r = scoreCurrent(mkSession('ask', 'ask', '', cards, 'Awa'), 1)!
    expect(r.graded).toBeNull()
    expect(r.session.res).toEqual({ a: 1 })
  })
})
