import { describe, expect, test } from 'vitest'
import { codeErrorMessage, isValidCode, normalizeCode, resendRemaining, sendErrorMessage, TOO_MANY } from './signin'

describe('resendRemaining (minuteur de renvoi)', () => {
  const sentAt = 1_000_000

  test('60 s affichées juste après l’envoi, puis décompte à la seconde supérieure', () => {
    expect(resendRemaining(sentAt, sentAt)).toBe(60)
    expect(resendRemaining(sentAt, sentAt + 500)).toBe(60)
    expect(resendRemaining(sentAt, sentAt + 59_001)).toBe(1)
  })

  test('bouton actif à 60 s pile et après, ou sans envoi connu', () => {
    expect(resendRemaining(sentAt, sentAt + 60_000)).toBe(0)
    expect(resendRemaining(sentAt, sentAt + 600_000)).toBe(0)
    expect(resendRemaining(undefined, sentAt)).toBe(0)
  })

  test('horloge reculée : jamais plus que le délai', () => {
    expect(resendRemaining(sentAt, sentAt - 5_000, 60_000)).toBe(65)
  })
})

describe('code à 6 chiffres', () => {
  test('garde les chiffres d’un code collé', () => {
    expect(normalizeCode(' 123-456 ')).toBe('123456')
    expect(normalizeCode('1234567')).toBe('123456')
    expect(normalizeCode('abc')).toBe('')
  })

  test('valide exactement 6 chiffres', () => {
    expect(isValidCode('123456')).toBe(true)
    expect(isValidCode('12345')).toBe(false)
    expect(isValidCode('12345a')).toBe(false)
  })
})

describe('messages d’erreur', () => {
  test('limite d’envoi : message dédié', () => {
    expect(sendErrorMessage({ status: 429, message: 'x' })).toBe(TOO_MANY)
    expect(sendErrorMessage({ code: 'over_email_send_rate_limit' })).toBe(TOO_MANY)
    expect(codeErrorMessage({ message: 'Email rate limit exceeded' })).toBe(TOO_MANY)
  })

  test('réseau coupé ou délai dépassé', () => {
    expect(sendErrorMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toMatch(/réseau/)
    expect(codeErrorMessage({ name: 'TimeoutError' })).toMatch(/réseau/)
  })

  test('code expiré ou faux, et erreur inconnue', () => {
    expect(codeErrorMessage({ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' })).toMatch(/incorrect ou expiré.*déjà servi par le lien : demandez-en un nouveau/)
    expect(sendErrorMessage(null)).toMatch(/n’a pas pu être envoyé/)
  })
})
