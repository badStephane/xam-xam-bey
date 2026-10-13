import { afterEach, describe, expect, test, vi } from 'vitest'
import { isTimed, timeoutSignal, withTimeout } from './fetchTimeout'

const API = 'https://x.supabase.co/rest/v1/progress'

/** fetch simulé qui ne répond jamais, sauf si le signal l'interrompt. */
const hangingFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
  init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('abort')))
}))

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); hangingFetch.mockClear() })

describe('withTimeout', () => {
  test('une requête qui ne répond pas échoue après le délai', async () => {
    // AbortSignal.timeout natif ne suit pas les minuteurs simulés : délai réel court.
    const started = Date.now()
    await expect(withTimeout(hangingFetch, 50)(API)).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(Date.now() - started).toBeGreaterThanOrEqual(40)
  })

  test('une requête rapide passe, avec un signal posé', async () => {
    const base = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok'))
    const res = await withTimeout(base, 1000)(API, { method: 'GET' })
    expect(await res.text()).toBe('ok')
    expect(base.mock.calls[0][1]).toMatchObject({ method: 'GET' })
    expect(base.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  test('le stockage (envoi de PDF) n’est jamais limité', async () => {
    const base = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok'))
    const init = { method: 'POST' }
    await withTimeout(base, 1)('https://x.supabase.co/storage/v1/object/documents/a.pdf', init)
    expect(base).toHaveBeenCalledWith('https://x.supabase.co/storage/v1/object/documents/a.pdf', init)
    expect(isTimed(API)).toBe(true)
  })

  test('l’annulation de l’appelant reste effective', async () => {
    const ctrl = new AbortController()
    const p = withTimeout(hangingFetch, 60_000)(new URL(API), { signal: ctrl.signal })
    ctrl.abort(new Error('annulé'))
    await expect(p).rejects.toThrow('annulé')
  })
})

describe('timeoutSignal', () => {
  test('repli sans AbortSignal.timeout : le signal expire quand même', async () => {
    vi.useFakeTimers()
    const original = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true })
    try {
      const s = timeoutSignal(500)
      expect(s.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(500)
      expect(s.aborted).toBe(true)
      expect((s.reason as DOMException).name).toBe('TimeoutError')
    } finally {
      if (original) Object.defineProperty(AbortSignal, 'timeout', original)
    }
  })
})
