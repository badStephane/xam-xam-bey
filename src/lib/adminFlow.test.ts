import { describe, expect, test, vi } from 'vitest'
import { runThenReload } from './adminFlow'

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
