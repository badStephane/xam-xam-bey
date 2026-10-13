import { describe, expect, test } from 'vitest'
import { killSwitch, storageOrigin } from './buildSw'

describe('storageOrigin', () => {
  test('origine du projet Supabase', () => {
    expect(storageOrigin('https://abc.supabase.co/')).toBe('https://abc.supabase.co')
    expect(storageOrigin(' http://127.0.0.1:55321 ')).toBe('http://127.0.0.1:55321')
  })
  test('absente ou invalide : aucun PDF gardé', () => {
    expect(storageOrigin(undefined)).toBeNull()
    expect(storageOrigin('')).toBeNull()
    expect(storageOrigin('pas une adresse')).toBeNull()
  })
})

describe('killSwitch', () => {
  test('purge uniquement les caches du site, se désinscrit et recharge les onglets', () => {
    const src = killSwitch()
    expect(src).toContain("n.startsWith('xxb-')")
    expect(src).toContain('self.registration.unregister()')
    expect(src).toContain('c.navigate(c.url)')
    expect(src).not.toContain('fetch')
  })
})
