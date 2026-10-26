import { describe, expect, test } from 'vitest'
import { installOffer, type Device } from './install'

const ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'

const device = (over: Partial<Device>): Device => ({ userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5, standalone: false, ...over })

describe('installOffer', () => {
  test('Chrome a proposé l’installation : bouton « Installer »', () => {
    // Arrange
    const d = device({})
    // Act
    const offer = installOffer(d, true)
    // Assert
    expect(offer).toBe('prompt')
  })

  test('Android sans proposition du navigateur (déjà installée, navigateur intégré d’une appli) : rien', () => {
    expect(installOffer(device({}), false)).toBeNull()
  })

  test('iPhone dans Safari : marche à suivre « Partager, puis Sur l’écran d’accueil »', () => {
    expect(installOffer(device({ userAgent: IPHONE, platform: 'iPhone' }), false)).toBe('ios')
  })

  test('iPad en mode bureau (se présente comme un Mac, mais tactile) : marche à suivre iOS', () => {
    expect(installOffer(device({ userAgent: IPAD_DESKTOP, platform: 'MacIntel', maxTouchPoints: 5 }), false)).toBe('ios')
  })

  test('Mac de bureau (Safari, sans écran tactile) : rien', () => {
    expect(installOffer(device({ userAgent: IPAD_DESKTOP, platform: 'MacIntel', maxTouchPoints: 0 }), false)).toBeNull()
  })

  test('application déjà ouverte depuis l’écran d’accueil : jamais rien, même si une proposition traîne', () => {
    expect(installOffer(device({ standalone: true }), true)).toBeNull()
    expect(installOffer(device({ userAgent: IPHONE, platform: 'iPhone', standalone: true }), false)).toBeNull()
  })
})
