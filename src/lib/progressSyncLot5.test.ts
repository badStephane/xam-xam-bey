import { describe, expect, test } from 'vitest'
import { isGradesRejected, isGradesUnsupported, saveArgs, weekOfSaveResult } from './progressSync'
import { EMPTY_PROGRESS } from './srs'

describe('save_progress lot 5 (L5-1)', () => {
  test('sans note en attente : appel à 3 clés, identique au lot 4', () => {
    expect(Object.keys(saveArgs(EMPTY_PROGRESS))).toEqual(['p_cards', 'p_sessions', 'p_xp'])
  })

  test('avec des notes : 4e clé p_grades', () => {
    const args = saveArgs(EMPTY_PROGRESS, [{ c: 't1-01', d: 20744, g: 2, a: 'Baden-Powell' }])
    expect(args.p_grades).toEqual([{ c: 't1-01', d: 20744, g: 2, a: 'Baden-Powell' }])
  })

  test('XP de ligue et notes comptées lues dans la réponse ; base du lot 4 : null', () => {
    expect(weekOfSaveResult([{ xp: 1, week_xp: 240, grades_counted: 3 }])).toEqual({ weekXp: 240, counted: 3 })
    expect(weekOfSaveResult([{ xp: 1 }])).toBeNull()
    expect(weekOfSaveResult(null)).toBeNull()
  })

  test('erreurs propres à la file : refus en bloc, base sans p_grades', () => {
    expect(isGradesRejected({ code: '22023', message: 'GRADES_INVALID' })).toBe(true)
    expect(isGradesRejected({ code: '22023', message: 'autre' })).toBe(false)
    expect(isGradesUnsupported({ code: 'PGRST202', message: 'x' })).toBe(true)
    expect(isGradesUnsupported(null)).toBe(false)
  })
})
