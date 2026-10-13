import { describe, expect, test } from 'vitest'
import { forgetKnownUser, KNOWN_USER_KEY, parseKnownUser, readKnownUser, writeKnownUser } from './knownUser'

function memoryStore(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const data = new Map<string, string>()
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: k => { data.delete(k) } }
}

describe('compte retenu sur l’appareil (F1)', () => {
  test('aller-retour, adresse absente acceptée', () => {
    const store = memoryStore()
    writeKnownUser(store, { id: 'u1', email: 'a@example.com' })
    expect(readKnownUser(store)).toEqual({ id: 'u1', email: 'a@example.com' })
    writeKnownUser(store, { id: 'u2', email: null })
    expect(readKnownUser(store)).toEqual({ id: 'u2', email: null })
  })

  test('entrée illisible ou mal formée : aucun compte', () => {
    const store = memoryStore()
    store.setItem(KNOWN_USER_KEY, '{x')
    expect(readKnownUser(store)).toBeNull()
    expect(parseKnownUser({ id: '' })).toBeNull()
    expect(parseKnownUser({ id: 3 })).toBeNull()
    expect(parseKnownUser('u1')).toBeNull()
    expect(parseKnownUser({ id: 'u1', email: 4 })).toEqual({ id: 'u1', email: null })
    expect(readKnownUser(null)).toBeNull()
  })

  test('oublié pour son propre compte seulement', () => {
    const store = memoryStore()
    writeKnownUser(store, { id: 'u1', email: null })
    forgetKnownUser(store, 'u2')
    expect(readKnownUser(store)?.id).toBe('u1')
    forgetKnownUser(store, 'u1')
    expect(readKnownUser(store)).toBeNull()
  })
})
