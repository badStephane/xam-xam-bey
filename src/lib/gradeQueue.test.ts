import { describe, expect, test } from 'vitest'
import { clearGradesQueue, enqueueGrade, gradedToday, gradesBatch, gradesQueueKey, MAX_GRADES_PER_CALL, parseGradesQueue, readGradesQueue, removeSentGrades, type QueuedGrade } from './gradeQueue'

const mem = (): Storage => {
  const m = new Map<string, string>()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: k => { m.delete(k) }, clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size } }
}
const T = 20740
const U = 'user-a'

describe('file des notes de ligue (L5-1, A11)', () => {
  test('une entrée par carte et par jour : la première note compte, le texte du QCM est gardé', () => {
    const s = mem()
    enqueueGrade(s, U, { c: 't1-01', d: T, g: 2, a: 'Baden-Powell' }, T)
    enqueueGrade(s, U, { c: 't1-01', d: T, g: 0, a: 'Autre' }, T)
    enqueueGrade(s, U, { c: 't1-02', d: T, g: 1 }, T)
    expect(readGradesQueue(s, U)).toEqual([{ c: 't1-01', d: T, g: 2, a: 'Baden-Powell' }, { c: 't1-02', d: T, g: 1 }])
  })

  test('purge des notes de plus de 8 jours', () => {
    const s = mem()
    enqueueGrade(s, U, { c: 'a', d: T - 9, g: 2 }, T - 9)
    enqueueGrade(s, U, { c: 'b', d: T - 8, g: 2 }, T - 8)
    enqueueGrade(s, U, { c: 'c', d: T, g: 2 }, T)
    expect(readGradesQueue(s, U).map(q => q.c)).toEqual(['b', 'c'])
  })

  test('après envoi : retire les notes envoyées, garde celles ajoutées pendant l’appel', () => {
    const s = mem()
    enqueueGrade(s, U, { c: 'a', d: T, g: 2 }, T)
    const sent = gradesBatch(readGradesQueue(s, U))
    enqueueGrade(s, U, { c: 'b', d: T, g: 1 }, T)
    expect(removeSentGrades(s, U, sent)).toEqual([{ c: 'b', d: T, g: 1 }])
    expect(readGradesQueue(s, U)).toEqual([{ c: 'b', d: T, g: 1 }])
  })

  test('500 notes au plus par appel, les plus anciennes d’abord', () => {
    const items: QueuedGrade[] = Array.from({ length: 620 }, (_, i) => ({ c: `c${i}`, d: T, g: 2 }))
    const batch = gradesBatch(items)
    expect(batch).toHaveLength(MAX_GRADES_PER_CALL)
    expect(batch[0].c).toBe('c0')
  })

  test('cartes distinctes notées aujourd’hui, même après envoi ; remis à zéro le lendemain', () => {
    const s = mem()
    enqueueGrade(s, U, { c: 'a', d: T, g: 2 }, T)
    enqueueGrade(s, U, { c: 'b', d: T, g: 0 }, T)
    removeSentGrades(s, U, readGradesQueue(s, U))
    enqueueGrade(s, U, { c: 'a', d: T, g: 2 }, T)
    expect(gradedToday(s, U, T)).toBe(2)
    expect(gradedToday(s, U, T + 1)).toBe(0)
  })

  test('lecture validée : autre compte, autre version, entrées invalides ou en double ignorées', () => {
    const raw = { v: 1, user: U, items: [{ c: 'a', d: T, g: 2 }, { c: 'a', d: T, g: 1 }, { c: '', d: T, g: 2 }, { c: 'b', d: -1, g: 2 }, { c: 'c', d: T, g: 3 }, { c: 'd', d: T, g: 2, a: 7 }], today: { d: T, ids: ['a', 'a', 5] } }
    expect(parseGradesQueue(raw, U).items).toEqual([{ c: 'a', d: T, g: 2 }])
    expect(parseGradesQueue(raw, U).today).toEqual({ d: T, ids: ['a'] })
    expect(parseGradesQueue(raw, 'other').items).toEqual([])
    expect(parseGradesQueue({ ...raw, v: 2 }, U).items).toEqual([])
    const s = mem()
    s.setItem(gradesQueueKey(U), '{oops')
    expect(readGradesQueue(s, U)).toEqual([])
  })

  test('effacée à la déconnexion ; stockage absent ou plein : rien ne plante', () => {
    const s = mem()
    enqueueGrade(s, U, { c: 'a', d: T, g: 2 }, T)
    clearGradesQueue(s, U)
    expect(s.getItem(gradesQueueKey(U))).toBeNull()
    const full = { ...mem(), setItem: () => { throw new Error('quota') } } as Storage
    expect(() => enqueueGrade(full, U, { c: 'a', d: T, g: 2 }, T)).not.toThrow()
    expect(() => enqueueGrade(null, U, { c: 'a', d: T, g: 2 }, T)).not.toThrow()
  })
})

describe('heure de la note (t, limite du dimanche 20:00)', () => {
  test('gardée si entière et positive, sinon l’entrée est rejetée', async () => {
    const { parseQueuedGrade } = await import('./gradeQueue')
    expect(parseQueuedGrade({ c: 'a', d: T, g: 2, t: 1792000000 })).toEqual({ c: 'a', d: T, g: 2, t: 1792000000 })
    expect(parseQueuedGrade({ c: 'a', d: T, g: 2, t: 1.5 })).toBeNull()
  })
})

describe('jour UTC des notes (QA L5-1)', () => {
  test('juste après minuit à l’est (UTC+1) : jour UTC de la veille, jamais « demain »', async () => {
    const { utcDay } = await import('./gradeQueue')
    expect(utcDay(Date.parse('2026-10-15T23:30:00Z'))).toBe(utcDay(Date.parse('2026-10-15T00:00:00Z')))
    expect(utcDay(Date.parse('2026-10-16T00:00:00Z')) - utcDay(Date.parse('2026-10-15T00:00:00Z'))).toBe(1)
  })
})
