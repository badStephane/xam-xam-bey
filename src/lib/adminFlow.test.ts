import { describe, expect, test, vi } from 'vitest'
import { createRequestCounter, runLatest, runThenReload } from './adminFlow'

describe('runThenReload', () => {
  test('succès : recharge puis renvoie null', async () => {
    const reload = vi.fn(async () => undefined)
    expect(await runThenReload(async () => undefined, reload)).toBeNull()
    expect(reload).toHaveBeenCalledOnce()
  })
  test('échec après suppression de la ligne : recharge quand même et renvoie le message', async () => {
    const reload = vi.fn(async () => undefined)
    const msg = await runThenReload(async () => { throw new Error('fichier resté en ligne') }, reload)
    expect(msg).toBe('fichier resté en ligne')
    expect(reload).toHaveBeenCalledOnce()
  })
  test('erreur non Error : message générique ; échec du rechargement sans masquer l’erreur', async () => {
    const msg = await runThenReload(async () => { throw 'x' }, async () => { throw new Error('réseau') })
    expect(msg).toMatch(/\S/)
  })
  test('rechargement en échec après un succès : message du rechargement', async () => {
    expect(await runThenReload(async () => undefined, async () => { throw new Error('réseau') })).toBe('réseau')
  })
})

function deferred<T>() {
  let resolve: (v: T) => void = () => undefined
  let reject: (e: unknown) => void = () => undefined
  const promise = new Promise<T>((ok, ko) => { resolve = ok; reject = ko })
  return { promise, resolve, reject }
}

describe('runLatest (FE-4 : jeton de requête par zone)', () => {
  test('une réponse de zone dépassée est ignorée', async () => {
    const counter = createRequestCounter()
    const zone1 = deferred<string[]>()
    const zone2 = deferred<string[]>()
    const shown: string[][] = []
    const onValue = (rows: string[]) => { shown.push(rows) }
    const first = runLatest(counter, () => zone1.promise, onValue, () => undefined)
    const second = runLatest(counter, () => zone2.promise, onValue, () => undefined)
    zone2.resolve(['z2-001'])
    await second
    zone1.resolve(['z1-001'])
    expect(await first).toBe(false)
    expect(shown).toEqual([['z2-001']])
  })
  test('une erreur dépassée est ignorée aussi ; la requête courante remonte son erreur', async () => {
    const counter = createRequestCounter()
    const old = deferred<number>()
    const errors: unknown[] = []
    const first = runLatest(counter, () => old.promise, () => undefined, e => { errors.push(e) })
    const second = runLatest(counter, () => Promise.reject(new Error('réseau')), () => undefined, e => { errors.push(e) })
    expect(await second).toBe(true)
    old.reject(new Error('ancienne'))
    expect(await first).toBe(false)
    expect(errors.map(e => (e as Error).message)).toEqual(['réseau'])
  })
  test('invalidate() rend toute requête en vol périmée (démontage)', async () => {
    const counter = createRequestCounter()
    const onValue = vi.fn()
    const run = runLatest(counter, async () => 1, onValue, () => undefined)
    counter.invalidate()
    expect(await run).toBe(false)
    expect(onValue).not.toHaveBeenCalled()
  })
})
