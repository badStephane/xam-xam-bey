import { describe, expect, test } from 'vitest'
import { isCostlyNetwork, openMode, shouldKeepOnOpen } from './openMode'

describe('openMode', () => {
  test('en ligne : lecteur du téléphone sur mobile, aperçu du site sur ordinateur', () => {
    expect(openMode({ mobile: true, offline: false, kept: false })).toBe('native')
    expect(openMode({ mobile: true, offline: false, kept: true })).toBe('native')
    expect(openMode({ mobile: false, offline: false, kept: false })).toBe('inApp')
  })
  test('hors ligne et PDF gardé : aperçu du site, sur téléphone comme sur ordinateur', () => {
    expect(openMode({ mobile: true, offline: true, kept: true })).toBe('inApp')
    expect(openMode({ mobile: false, offline: true, kept: true })).toBe('inApp')
  })
  test('hors ligne et PDF absent : indisponible, aucun lien', () => {
    expect(openMode({ mobile: true, offline: true, kept: false })).toBe('unavailable')
    expect(openMode({ mobile: false, offline: true, kept: false })).toBe('unavailable')
  })
})

describe('shouldKeepOnOpen', () => {
  test('worker actif, réseau correct : demande envoyée (garde, ou revalidation si déjà gardé)', () => {
    expect(shouldKeepOnOpen({ workerActive: true })).toBe(true)
    expect(shouldKeepOnOpen({ workerActive: true, connection: { effectiveType: '3g' } })).toBe(true)
  })
  test('sans worker : rien', () => {
    expect(shouldKeepOnOpen({ workerActive: false })).toBe(false)
  })
  test('économie de données ou 2G : ni second téléchargement, ni revalidation', () => {
    expect(shouldKeepOnOpen({ workerActive: true, connection: { saveData: true, effectiveType: '4g' } })).toBe(false)
    expect(shouldKeepOnOpen({ workerActive: true, connection: { effectiveType: '2g' } })).toBe(false)
    expect(shouldKeepOnOpen({ workerActive: true, connection: { effectiveType: 'slow-2g' } })).toBe(false)
  })
})

describe('isCostlyNetwork', () => {
  test('économie de données ou 2G : coûteux ; 3G, 4G ou indication absente : non', () => {
    expect(isCostlyNetwork({ saveData: true })).toBe(true)
    expect(isCostlyNetwork({ effectiveType: '2g' })).toBe(true)
    expect(isCostlyNetwork({ effectiveType: 'slow-2g' })).toBe(true)
    expect(isCostlyNetwork({ effectiveType: '3g', saveData: false })).toBe(false)
    expect(isCostlyNetwork({ effectiveType: '4g' })).toBe(false)
    expect(isCostlyNetwork(undefined)).toBe(false)
  })
})
