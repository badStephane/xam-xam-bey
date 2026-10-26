import { afterEach, describe, expect, test, vi } from 'vitest'
import { isCheckDue, LATE_PURGE_DELAYS_MS, unregisterAll, UPDATE_CHECK_MS } from './register'

/** Faux CacheStorage : un ensemble de noms, et une écriture tardive simulée entre deux purges. */
function fakeCaches(initial: string[]) {
  const names = new Set(initial)
  return {
    names,
    api: {
      keys: async () => [...names],
      delete: async (n: string) => names.delete(n),
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('unregisterAll (secours VITE_SW=off)', () => {
  test('désinscrit, purge tout de suite, puis repurge un cache recréé par un ancien worker', async () => {
    const store = fakeCaches(['xxb-shell-v1', 'xxb-rt-v1', 'xxb-pdf-v1', 'autre-site'])
    const unregister = vi.fn(async () => true)
    vi.stubGlobal('caches', store.api)
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [{ unregister }] } })
    const waits: number[] = []
    const wait = async (ms: number): Promise<void> => {
      waits.push(ms)
      // L'ancien worker finit d'écrire un fichier après la première purge.
      if (waits.length === 1) store.names.add('xxb-rt-v1')
    }

    await unregisterAll(wait)

    expect(unregister).toHaveBeenCalledOnce()
    expect([...store.names]).toEqual(['autre-site'])
    expect(waits.reduce((a, b) => a + b, 0)).toBe(LATE_PURGE_DELAYS_MS[LATE_PURGE_DELAYS_MS.length - 1])
  })

  test('idempotent : sans worker ni cache du site, aucune erreur, rien d’autre touché', async () => {
    const store = fakeCaches(['autre-site'])
    vi.stubGlobal('caches', store.api)
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [] } })
    await unregisterAll(async () => undefined)
    await unregisterAll(async () => undefined)
    expect([...store.names]).toEqual(['autre-site'])
  })

  test('ne touche jamais au localStorage (xxb.progress.* conservé)', async () => {
    const storage = new Map([['xxb.progress.v1.u1', '{"cards":{}}']])
    vi.stubGlobal('localStorage', { removeItem: (k: string) => storage.delete(k), clear: () => storage.clear() })
    vi.stubGlobal('caches', fakeCaches(['xxb-rt-v1']).api)
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [] } })
    await unregisterAll(async () => undefined)
    expect(storage.get('xxb.progress.v1.u1')).toBe('{"cards":{}}')
  })
})

describe('isCheckDue (nouvelle version cherchée au retour sur l’appli)', () => {
  test('au plus une vérification par heure', () => {
    const last = 1_000_000
    expect(isCheckDue(last, last + UPDATE_CHECK_MS - 1)).toBe(false)
    expect(isCheckDue(last, last + UPDATE_CHECK_MS)).toBe(true)
  })
  test('horloge reculée (réglage du téléphone) : vérification permise', () => {
    expect(isCheckDue(1_000_000, 0)).toBe(true)
  })
})
