import { describe, expect, test, vi } from 'vitest'
import { KEEPALIVE_MAX_BYTES, withKeepalive } from './keepalive'

const RPC = 'https://p.supabase.co/rest/v1/rpc/save_progress'

describe('withKeepalive', () => {
  test('ajoute keepalive à l’enregistrement de la progression', async () => {
    const base = vi.fn<typeof fetch>(async () => new Response('[]'))
    await withKeepalive(base)(RPC, { method: 'POST', body: '{"p_xp":1}' })
    expect(base).toHaveBeenCalledWith(RPC, { method: 'POST', body: '{"p_xp":1}', keepalive: true })
  })
  test('accepte une URL objet', async () => {
    const base = vi.fn<typeof fetch>(async () => new Response('[]'))
    await withKeepalive(base)(new URL(RPC), { method: 'POST', body: '{}' })
    expect(base.mock.calls[0][1]).toMatchObject({ keepalive: true })
  })
  test('laisse passer les autres requêtes sans les modifier', async () => {
    const base = vi.fn<typeof fetch>(async () => new Response('[]'))
    const init = { method: 'GET' }
    await withKeepalive(base)('https://p.supabase.co/rest/v1/progress?select=*', init)
    await withKeepalive(base)(RPC, init)
    await withKeepalive(base)(RPC)
    expect(base.mock.calls.map(c => c[1])).toEqual([init, init, undefined])
  })
  test('pas de keepalive au-delà du quota du navigateur (requête sinon refusée)', async () => {
    const base = vi.fn<typeof fetch>(async () => new Response('[]'))
    const body = 'x'.repeat(KEEPALIVE_MAX_BYTES + 1)
    await withKeepalive(base)(RPC, { method: 'POST', body })
    expect(base.mock.calls[0][1]).toEqual({ method: 'POST', body })
  })
  test('Request en entrée : lue par son url', async () => {
    const base = vi.fn<typeof fetch>(async () => new Response('[]'))
    await withKeepalive(base)(new Request(RPC, { method: 'POST' }), { method: 'POST', body: '{}' })
    expect(base.mock.calls[0][1]).toMatchObject({ keepalive: true })
  })
})
