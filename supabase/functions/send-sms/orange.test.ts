import { describe, expect, test } from 'vitest'
import { basicAuth, ORANGE_SEND_URL, parseToken, sendBody, senegalRecipient, smsText, tokenValid, TOKEN_MARGIN_MS, validSenderName } from './orange'

describe('API SMS Orange (Sénégal)', () => {
  test('URL d’envoi : expéditeur tel:+2210000 encodé dans le chemin', () => {
    expect(ORANGE_SEND_URL).toBe('https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2210000/requests')
  })

  test('destinataire : mobile sénégalais seulement, quel que soit l’opérateur', () => {
    expect(senegalRecipient('221771234567')).toBe('+221771234567')
    expect(senegalRecipient('+221 76 555 44 33')).toBe('+221765554433')
    expect(senegalRecipient('221701234567')).toBe('+221701234567')
    for (const p of ['221338210000', '33612345678', '2250712345678', '22177123456', '']) expect(senegalRecipient(p), p).toBeNull()
  })

  test('texte du SMS : un seul SMS, alphabet GSM (pas de ë)', () => {
    const t = smsText('123456')
    expect(t).toContain('123456')
    expect(t.length).toBeLessThanOrEqual(160)
    expect(t).toMatch(/^[A-Za-z0-9 .,:']+$/)
  })

  test('nom d’expéditeur : 11 caractères alphanumériques ou espaces, sinon nom par défaut', () => {
    expect(validSenderName('XamXamBey')).toBe('XamXamBey')
    expect(validSenderName(' XamXamBey ')).toBe('XamXamBey')
    expect(validSenderName('Xam Xam Bëy')).toBeNull()
    expect(validSenderName('XamXamBey2026')).toBeNull()
    expect(validSenderName(undefined)).toBeNull()
  })

  test('corps de la requête, avec et sans nom d’expéditeur', () => {
    expect(sendBody('+221771234567', 'Bonjour', 'XamXamBey')).toEqual({
      outboundSMSMessageRequest: { address: 'tel:+221771234567', senderAddress: 'tel:+2210000', senderName: 'XamXamBey', outboundSMSTextMessage: { message: 'Bonjour' } },
    })
    expect(sendBody('+221771234567', 'Bonjour', null)).toEqual({
      outboundSMSMessageRequest: { address: 'tel:+221771234567', senderAddress: 'tel:+2210000', outboundSMSTextMessage: { message: 'Bonjour' } },
    })
  })

  test('jeton : en-tête Basic, durée lue, renouvelé une minute avant l’expiration', () => {
    expect(basicAuth('id', 'secret')).toBe(`Basic ${btoa('id:secret')}`)
    const now = 1_000_000
    const t = parseToken({ token_type: 'Bearer', access_token: 'abc', expires_in: 3600 }, now)
    expect(t).toEqual({ value: 'abc', expiresAt: now + 3_600_000 - TOKEN_MARGIN_MS })
    expect(tokenValid(t, now)).toBe(true)
    expect(tokenValid(t, now + 3_600_000 - TOKEN_MARGIN_MS)).toBe(false)
    expect(parseToken({ access_token: 'abc', expires_in: '3600' }, now)?.expiresAt).toBe(now + 3_600_000 - TOKEN_MARGIN_MS)
    expect(parseToken({ error: 'invalid_client' }, now)).toBeNull()
    expect(tokenValid(null, now)).toBe(false)
  })
})
