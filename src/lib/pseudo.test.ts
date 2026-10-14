import { describe, expect, test } from 'vitest'
import { ADJECTIVES, ANIMALS, nextPseudo, PSEUDO_MESSAGES, pseudoErrorMessage, pseudoFormatError, randomPseudo, takenMessage } from './pseudo'

describe('pseudo (C5)', () => {
  test('formats acceptés', () => {
    ['CalaoAgile27', 'Élodie_K', 'Gazelle-Calme', 'abc', 'Abcdefghijklmnopqrst'].forEach(p => expect(pseudoFormatError(p), p).toBeNull())
  })

  test('messages exacts de C5', () => {
    expect(pseudoFormatError('ab')).toBe(PSEUDO_MESSAGES.short)
    expect(pseudoFormatError('Abcdefghijklmnopqrstu')).toBe(PSEUDO_MESSAGES.long)
    expect(pseudoFormatError('Calao Agile')).toBe(PSEUDO_MESSAGES.chars)
    expect(pseudoFormatError('Calao.Agile')).toBe(PSEUDO_MESSAGES.chars)
    expect(pseudoFormatError('7Calao')).toBe(PSEUDO_MESSAGES.start)
    expect(pseudoFormatError('_Calao')).toBe(PSEUDO_MESSAGES.start)
    expect(pseudoFormatError('Calao77123')).toBe(PSEUDO_MESSAGES.contact)
    expect(pseudoFormatError('a@b.sn')).toBe(PSEUDO_MESSAGES.contact)
    expect(PSEUDO_MESSAGES.short).toBe('3 caractères au moins.')
  })

  test('suggestion si pris : chiffres finaux augmentés', () => {
    expect(nextPseudo('CalaoAgile27')).toBe('CalaoAgile28')
    expect(nextPseudo('Calao09')).toBe('Calao10')
    expect(nextPseudo('Calao')).toBe('Calao2')
    expect(takenMessage('CalaoAgile28')).toBe('Ce pseudo est déjà pris. Essayez CalaoAgile28.')
  })

  test('tirage : animal + adjectif + 2 chiffres, toujours valide', () => {
    const p = randomPseudo(() => 0.27)
    expect(p).toBe(`${ANIMALS[2]}${ADJECTIVES[2]}34`)
    for (let i = 0; i < 50; i++) expect(pseudoFormatError(randomPseudo())).toBeNull()
  })

  test('erreurs du serveur traduites, jamais affichées telles quelles', () => {
    expect(pseudoErrorMessage({ code: '22023', message: 'PSEUDO_REFUSED' }, 'x')).toBe(PSEUDO_MESSAGES.refused)
    expect(pseudoErrorMessage({ code: '23505', message: 'PSEUDO_TAKEN' }, 'Lion07')).toBe('Ce pseudo est déjà pris. Essayez Lion08.')
    expect(pseudoErrorMessage({ code: 'P0001', message: 'PSEUDO_TOO_SOON' }, 'x')).toBe(PSEUDO_MESSAGES.tooSoon)
    expect(pseudoErrorMessage({ code: 'P0001', message: 'RATE_LIMITED' }, 'x')).toBe(PSEUDO_MESSAGES.rate)
    expect(pseudoErrorMessage({ code: 'network', message: 'NETWORK' }, 'x')).toBe(PSEUDO_MESSAGES.unknown)
    expect(pseudoErrorMessage({ code: '22023', message: 'PSEUDO_INVALID' }, 'Calao.Agile')).toBe(PSEUDO_MESSAGES.chars)
  })
})

describe('contrat final L5-2', () => {
  test('raison de PSEUDO_INVALID et suggestion du serveur', async () => {
    const { allowTry } = await import('./pseudo')
    expect(pseudoErrorMessage({ code: '22023', message: 'PSEUDO_INVALID', details: 'first_char' }, 'x')).toBe(PSEUDO_MESSAGES.start)
    expect(pseudoErrorMessage({ code: '22023', message: 'PSEUDO_INVALID', details: 'digits' }, 'x')).toBe(PSEUDO_MESSAGES.contact)
    expect(pseudoErrorMessage({ code: '23505', message: 'PSEUDO_TAKEN', hint: 'LionVif42' }, 'Lion07')).toBe('Ce pseudo est déjà pris. Essayez LionVif42.')
    expect(pseudoErrorMessage({ code: '23505', message: 'PSEUDO_TAKEN', hint: '' }, 'Lion07')).toBe('Ce pseudo est déjà pris. Essayez Lion08.')
    expect(pseudoFormatError('Ŋaañ')).toBeNull()
    const five = [1, 2, 3, 4, 5].map(i => i * 1000)
    expect(allowTry(five, 10_000)).toBeNull()
    expect(allowTry(five, 61_500)).toEqual([2000, 3000, 4000, 5000, 61_500])
  })
})
