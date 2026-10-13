import { describe, expect, test } from 'vitest'
import { mkSession } from './session'
import { SELF_CHECK, buildChoices, gradeOf, isSelfCheck, seeded, shortAnswer, withChoices } from './qcm'
import { validCards } from './srs'
import type { Card } from './types'

const card = (id: string, a: string, th = 1, qcm?: Card['qcm']): Card => ({ id, q: 'q ' + id, a, src: '', note: '', th, ...(qcm ? { qcm } : {}) })
const pool = [
  card('a', 'Le **22 février 1857**, à Londres.', 1, { ok: '22 février 1857', no: ['8 janvier 1941', '29 juillet 1907', '22 février 1857'] }),
  card('b', 'En **1958**.'), card('c', 'À **Brownsea**. Vingt jeunes.'), card('d', 'Saint Georges.'), card('e', 'Autre zone.', 2),
]

describe('buildChoices', () => {
  test('QCM rédigé : 3 propositions distinctes plus la bonne réponse', () => {
    const ch = buildChoices(pool[0], pool, seeded(1))
    expect(ch.options).toHaveLength(3)
    expect(ch.options[ch.correct]).toBe('22 février 1857')
    expect(new Set(ch.options).size).toBe(3)
  })
  test('sans QCM : distracteurs tirés de la même zone uniquement', () => {
    const ch = buildChoices(pool[1], pool, seeded(2))
    expect(ch.options).toHaveLength(4)
    expect(ch.options[ch.correct]).toBe('En 1958')
    expect(ch.options).not.toContain('Autre zone')
  })
  test('IM-6 : zone sans autres cartes, leurres pris dans les autres zones', () => {
    const ch = buildChoices(pool[4], pool, seeded(3))
    expect(ch.options).toHaveLength(4)
    expect(ch.options[ch.correct]).toBe('Autre zone')
  })
  test('IM-6 : moins de 3 leurres dans la zone, complétés par les autres zones, zone d’abord', () => {
    const small = [card('m', 'Un.', 3), card('n', 'Deux.', 3), card('o', 'Trois.', 4), card('p', 'Quatre.', 5), card('q', 'Cinq.', 6)]
    const ch = buildChoices(small[0], small, seeded(4))
    expect(ch.options).toHaveLength(4)
    expect(ch.options).toContain('Deux')
    expect(new Set(ch.options).size).toBe(4)
  })
  test('IM-6 : aucun leurre nulle part, auto-évaluation (jamais une seule proposition)', () => {
    const lone = card('z', 'Seule.', 7)
    expect(buildChoices(lone, [lone], seeded(5))).toEqual(SELF_CHECK)
    expect(buildChoices(lone, [lone, card('y', 'seule', 2)], seeded(5))).toEqual(SELF_CHECK)
    expect(isSelfCheck(SELF_CHECK)).toBe(true)
  })
  test('QCM rédigé dont tous les leurres sont des doublons de la bonne (donnée ancienne) : repli', () => {
    const bad = card('w', 'Paris.', 1, { ok: 'Paris', no: ['paris'] })
    const ch = buildChoices(bad, [bad, ...pool], seeded(6))
    expect(ch.options.length).toBeGreaterThan(1)
    expect(ch.options[ch.correct]).toBe('Paris')
  })
  test('QCM rédigé à un seul leurre : gardé tel quel (deux propositions)', () => {
    const two = card('v', 'Oui.', 1, { ok: 'Oui', no: ['Non'] })
    expect(buildChoices(two, [two, ...pool], seeded(7)).options.sort()).toEqual(['Non', 'Oui'])
  })
})

describe('shortAnswer', () => {
  test('garde la première phrase sans markdown', () => expect(shortAnswer('À **Brownsea**. Vingt jeunes.')).toBe('À Brownsea'))
  test('tronque les phrases trop longues', () => expect(shortAnswer('x'.repeat(200)).length).toBe(110))
})

describe('validation', () => {
  test('gradeOf : bonne réponse = 2, mauvaise = 0, rien choisi = null', () => {
    const s = withChoices(mkSession('self', 'daily', '', pool.slice(0, 2)), pool, seeded(4))
    const ok = s.queue[0].ch!.correct
    expect(gradeOf(s)).toBeNull()
    expect(gradeOf({ ...s, picked: ok })).toBe(2)
    expect(gradeOf({ ...s, picked: (ok + 1) % s.queue[0].ch!.options.length })).toBe(0)
  })
  test('withChoices ne remplace pas des propositions existantes', () => {
    const s = withChoices(mkSession('self', 'daily', '', pool.slice(0, 1)), pool, seeded(5))
    expect(withChoices(s, pool, seeded(9)).queue[0].ch).toBe(s.queue[0].ch)
  })
  test('seeded est reproductible', () => expect(seeded(7)()).toBe(seeded(7)()))
})

describe('validCards et QCM', () => {
  test('garde un QCM valide et écarte un QCM mal formé', () => {
    const [ok, bad, none] = validCards([
      { id: 'x', q: 'q', a: 'a', qcm: { ok: 'Oui', no: ['Non', 3, '', 'Oui'] } },
      { id: 'y', q: 'q', a: 'a', qcm: { ok: '', no: ['Non'] } },
      { id: 'z', q: 'q', a: 'a', qcm: 'texte' },
    ], 1)
    expect(ok.qcm).toEqual({ ok: 'Oui', no: ['Non'] })
    expect(bad.qcm).toBeUndefined()
    expect(none.qcm).toBeUndefined()
  })
})
