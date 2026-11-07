import { describe, expect, test } from 'vitest'
import { accountLabel, formatPhone, normalizePhone } from './phone'

describe('normalizePhone (numéro saisi → format international)', () => {
  test('les écritures courantes d’un mobile sénégalais donnent +221 suivi des 9 chiffres', () => {
    for (const s of ['771234567', '77 123 45 67', '77-123-45-67', '+221 77 123 45 67', '00221771234567', '221771234567', ' (+221) 77.123.45.67 ']) {
      expect(normalizePhone(s), s).toBe('+221771234567')
    }
    expect(normalizePhone('70 000 00 01')).toBe('+221700000001')
    expect(normalizePhone('76 555 44 33')).toBe('+221765554433')
  })

  test('refusés : fixe, trop court, trop long, autre pays, vide', () => {
    for (const s of ['33 821 00 00', '77 123 45 6', '77 123 45 678', '+33 6 12 34 56 78', '+225 07 12 34 56 78', '', 'abc']) {
      expect(normalizePhone(s), s).toBeNull()
    }
  })
})

describe('formatPhone (affichage)', () => {
  test('format de Supabase Auth (sans +) et format international donnent la même écriture', () => {
    expect(formatPhone('221771234567')).toBe('+221 77 123 45 67')
    expect(formatPhone('+221771234567')).toBe('+221 77 123 45 67')
  })

  test('autre format : rendu tel quel, avec + devant des chiffres seuls', () => {
    expect(formatPhone('33612345678')).toBe('+33612345678')
    expect(formatPhone('+33 6 12')).toBe('+33 6 12')
  })
})

describe('accountLabel (identifiant affiché)', () => {
  test('e-mail d’abord, sinon numéro, sinon null', () => {
    expect(accountLabel({ email: 'a@example.com', phone: '221771234567' })).toBe('a@example.com')
    expect(accountLabel({ email: '', phone: '221771234567' })).toBe('+221 77 123 45 67')
    expect(accountLabel({ email: null, phone: null })).toBeNull()
    expect(accountLabel({})).toBeNull()
  })
})
