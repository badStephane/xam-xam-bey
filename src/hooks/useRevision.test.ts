// @vitest-environment happy-dom
/**
 * L1-8 (QA lot 2) : le hook qui porte toute la persistance, testé avec un client Supabase simulé.
 * Pas de @testing-library : un rendu minimal avec react-dom/client et act suffit pour un hook.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SAVE_DELAY } from '../lib/constants'
import { localProgressKey } from '../lib/progressSync'
import type { CardProgress } from '../lib/types'
import { useRevision, type Revision } from './useRevision'

interface Res { data: unknown; error: unknown }
interface User { id: string; email: string }
interface Deferred<T> { promise: Promise<T>; resolve(v: T): void }

function deferred<T>(): Deferred<T> {
  let resolve: (v: T) => void = () => undefined
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

const fake = vi.hoisted(() => {
  const state = {
    session: null as { user: { id: string; email: string } } | null,
    authCb: null as ((event: string, session: unknown) => void) | null,
    progress: vi.fn<(userId: string) => Promise<{ data: unknown; error: unknown }>>(),
    rpc: vi.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>(),
    signOut: vi.fn(async () => ({ error: null })),
    signInWithOtp: vi.fn<(args: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
    verifyOtp: vi.fn<(args: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
  }
  function builder(table: string) {
    let userId = ''
    const rows = table === 'revision_content' ? [{ id: 'plan', data: { zones: [] } }] : []
    const b = {
      select: () => b,
      eq: (_col: string, v: string) => { userId = v; return b },
      order: () => b,
      maybeSingle: () => state.progress(userId),
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, ko),
    }
    return b
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        state.authCb = cb
        return { data: { subscription: { unsubscribe: () => { state.authCb = null } } } }
      },
      signOut: () => state.signOut(),
      signInWithOtp: (args: unknown) => state.signInWithOtp(args),
      verifyOtp: (args: unknown) => state.verifyOtp(args),
    },
    from: (table: string) => builder(table),
    rpc: (name: string, args: unknown) => state.rpc(name, args),
  }
  return { state, client }
})

vi.mock('../lib/supabase', () => ({
  supabase: fake.client,
  isValidEmail: (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()),
  magicLinkRedirect: () => 'http://localhost:5173/?screen=revision',
}))

const T = 20739
const A: User = { id: 'user-a', email: 'a@example.com' }
const B: User = { id: 'user-b', email: 'b@example.com' }
const card = (lv: number, due: number, views: number, ok: number): CardProgress => [lv, due, views, ok, T - 10]
const ok = (data: unknown = null): Res => ({ data, error: null })
const row = (cards: Record<string, CardProgress>, xp = 0) => ({ cards, sessions: [], xp })
const NETWORK_ERROR = { code: '', message: 'TypeError: Failed to fetch' }

let root: Root | null = null
const hook = { current: null as unknown as Revision }

function render(): void {
  function Probe() { hook.current = useRevision(false); return null }
  root = createRoot(document.createElement('div'))
  act(() => root!.render(createElement(Probe)))
}

/** Laisse passer `ms` (minuteurs simulés) et toutes les promesses en attente, dans act. */
async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  })
}

const local = (u: User): unknown => {
  const raw = localStorage.getItem(localProgressKey(u.id))
  return raw ? JSON.parse(raw) : null
}

async function signedInAndLoaded(u: User, serverRow: unknown = null): Promise<void> {
  fake.state.session = { user: u }
  fake.state.progress.mockResolvedValueOnce(ok(serverRow))
  render()
  act(() => hook.current.init())
  await settle()
}

const lastRpcArgs = () => fake.state.rpc.mock.calls.at(-1)?.[1] as { p_cards: Record<string, CardProgress>; p_xp: number } | undefined

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  localStorage.clear()
  fake.state.session = null
  fake.state.authCb = null
  fake.state.progress.mockReset()
  fake.state.rpc.mockReset()
  fake.state.signOut.mockClear()
  fake.state.signInWithOtp.mockClear()
  fake.state.verifyOtp.mockClear()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useRevision : chargement', () => {
  test('sans session : écran de connexion, aucune lecture de progression', async () => {
    render()
    act(() => hook.current.init())
    await settle()
    expect(hook.current.status).toBe('signedout')
    expect(fake.state.progress).not.toHaveBeenCalled()
  })

  test('fusionne la ligne serveur et la copie locale, puis renvoie au serveur ce qu’il n’a pas', async () => {
    localStorage.setItem(localProgressKey(A.id), JSON.stringify(row({ c2: card(1, T + 1, 1, 1) }, 10)))
    fake.state.rpc.mockResolvedValue(ok([row({ c1: card(2, T + 3, 2, 2), c2: card(1, T + 1, 1, 1) }, 20)]))
    await signedInAndLoaded(A, row({ c1: card(2, T + 3, 2, 2) }, 20))

    expect(fake.state.progress).toHaveBeenCalledWith(A.id)
    expect(hook.current.status).toBe('ready')
    expect(hook.current.email).toBe(A.email)
    expect(Object.keys(hook.current.prog.cards).sort()).toEqual(['c1', 'c2'])
    expect(fake.state.rpc).not.toHaveBeenCalled()
    await settle(SAVE_DELAY)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
    expect(Object.keys(lastRpcArgs()!.p_cards).sort()).toEqual(['c1', 'c2'])
  })

  test('copie locale identique au serveur : aucun enregistrement', async () => {
    const r = row({ c1: card(2, T + 3, 2, 2) }, 20)
    localStorage.setItem(localProgressKey(A.id), JSON.stringify(r))
    await signedInAndLoaded(A, r)
    await settle(SAVE_DELAY * 5)
    expect(fake.state.rpc).not.toHaveBeenCalled()
  })

  test('lecture de la progression en échec : indisponible, et aucune écriture permise', async () => {
    fake.state.session = { user: A }
    fake.state.progress.mockResolvedValueOnce({ data: null, error: NETWORK_ERROR })
    render()
    act(() => hook.current.init())
    await settle()
    expect(hook.current.status).toBe('unavailable')
    act(() => hook.current.grade('c1', 2, T))
    await settle(SAVE_DELAY * 2)
    expect(fake.state.rpc).not.toHaveBeenCalled()
  })

  test('QA-12 : SIGNED_IN du même compte pendant le chargement ne relance pas de lecture', async () => {
    const first = deferred<Res>()
    fake.state.session = { user: A }
    fake.state.progress.mockReturnValueOnce(first.promise)
    render()
    act(() => hook.current.init())
    await settle()
    act(() => fake.state.authCb!('SIGNED_IN', { user: A }))
    await settle()
    expect(fake.state.progress).toHaveBeenCalledTimes(1)
    first.resolve(ok(null))
    await settle()
    expect(hook.current.status).toBe('ready')
  })
})

describe('useRevision : note puis enregistrement', () => {
  test('la note s’affiche tout de suite, est copiée en local, puis part après le délai', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValue(ok([row({ c1: card(1, T + 1, 1, 1), other: card(3, T + 7, 4, 4) }, 60)]))

    act(() => hook.current.grade('c1', 2, T))
    expect(hook.current.prog.cards.c1).toEqual([1, T + 1, 1, 1, T])
    expect(hook.current.prog.xp).toBe(10)
    expect((local(A) as { cards: Record<string, unknown> }).cards.c1).toEqual([1, T + 1, 1, 1, T])

    await settle(SAVE_DELAY - 1)
    expect(fake.state.rpc).not.toHaveBeenCalled()
    await settle(1)
    expect(fake.state.rpc).toHaveBeenCalledWith('save_progress', expect.objectContaining({ p_xp: 10 }))
    // État fusionné du serveur (autre appareil) adopté.
    expect(hook.current.prog.cards.other).toEqual(card(3, T + 7, 4, 4))
    expect(hook.current.prog.xp).toBe(60)
    expect(hook.current.saveErr).toBeNull()
  })

  test('plusieurs notes rapprochées : un seul envoi', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValue(ok([row({})]))
    act(() => hook.current.grade('c1', 2, T))
    await settle(SAVE_DELAY / 2)
    act(() => hook.current.grade('c2', 0, T))
    await settle(SAVE_DELAY)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
    expect(Object.keys(lastRpcArgs()!.p_cards).sort()).toEqual(['c1', 'c2'])
  })

  test('une note prise pendant l’envoi part dans un second envoi et n’est pas écrasée par la réponse', async () => {
    await signedInAndLoaded(A)
    const inFlight = deferred<Res>()
    fake.state.rpc.mockReturnValueOnce(inFlight.promise).mockResolvedValue(ok([row({})]))
    act(() => hook.current.logSession({ d: T, n: 1, ok: 1, k: 'day', l: 'Jour' }))
    await settle()
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
    act(() => hook.current.grade('c9', 2, T))
    await settle(SAVE_DELAY)
    inFlight.resolve(ok([row({}, 0)]))
    await settle()
    expect(hook.current.prog.cards.c9).toBeDefined()
    await settle(SAVE_DELAY)
    expect(fake.state.rpc).toHaveBeenCalledTimes(2)
    expect(lastRpcArgs()!.p_cards.c9).toBeDefined()
  })
})

describe('useRevision : erreurs d’enregistrement', () => {
  test('refus définitif (22023) : pas de boucle, copie locale gardée, RÉESSAYER relance', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'p_cards' } })
    act(() => hook.current.grade('c1', 2, T))
    await settle(SAVE_DELAY)
    expect(hook.current.saveErr).toBe('rejected')
    await settle(60_000)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
    expect((local(A) as { cards: Record<string, unknown> }).cards.c1).toBeDefined()

    fake.state.rpc.mockResolvedValueOnce(ok([row({ c1: card(1, T + 1, 1, 1) }, 10)]))
    act(() => hook.current.retrySave())
    await settle()
    expect(fake.state.rpc).toHaveBeenCalledTimes(2)
    expect(hook.current.saveErr).toBeNull()
  })

  test('erreur réseau : nouvel essai automatique après 10 s, puis retour au vert', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValueOnce({ data: null, error: NETWORK_ERROR }).mockResolvedValue(ok([row({ c1: card(1, T + 1, 1, 1) }, 10)]))
    act(() => hook.current.grade('c1', 2, T))
    await settle(SAVE_DELAY)
    expect(hook.current.saveErr).toBe('retry')
    await settle(9_999)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
    await settle(1)
    expect(fake.state.rpc).toHaveBeenCalledTimes(2)
    expect(hook.current.saveErr).toBeNull()
  })
})

describe('useRevision : changement de compte et déconnexion', () => {
  test('L1-5 : SIGNED_IN d’un autre compte abandonne l’envoi en attente de A et n’importe pas ses notes chez B', async () => {
    await signedInAndLoaded(A)
    act(() => hook.current.grade('a1', 2, T))
    const loadB = deferred<Res>()
    fake.state.progress.mockReturnValueOnce(loadB.promise)
    act(() => fake.state.authCb!('SIGNED_IN', { user: B }))
    await settle(SAVE_DELAY * 3)
    expect(fake.state.rpc).not.toHaveBeenCalled()

    loadB.resolve(ok(row({ b1: card(1, T + 1, 1, 1) })))
    await settle(SAVE_DELAY * 3)
    expect(hook.current.email).toBe(B.email)
    expect(Object.keys(hook.current.prog.cards)).toEqual(['b1'])
    expect(fake.state.rpc).not.toHaveBeenCalled()
    // Les notes de A restent dans sa copie locale, rien n'a été écrit dans celle de B.
    expect((local(A) as { cards: Record<string, unknown> }).cards.a1).toBeDefined()
    expect((local(B) as { cards: Record<string, unknown> }).cards.a1).toBeUndefined()
  })

  test('réponse en vol de A reçue après le passage à B : ignorée', async () => {
    await signedInAndLoaded(A)
    const inFlight = deferred<Res>()
    fake.state.rpc.mockReturnValueOnce(inFlight.promise)
    act(() => hook.current.logSession({ d: T, n: 1, ok: 1, k: 'day', l: 'Jour' }))
    await settle()
    fake.state.progress.mockResolvedValueOnce(ok(row({ b1: card(1, T + 1, 1, 1) })))
    act(() => fake.state.authCb!('SIGNED_IN', { user: B }))
    await settle()
    inFlight.resolve(ok([row({ a9: card(5, T + 60, 9, 9) }, 999)]))
    await settle(SAVE_DELAY * 3)
    expect(Object.keys(hook.current.prog.cards)).toEqual(['b1'])
    expect(hook.current.prog.xp).toBe(0)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
  })

  test('déconnexion avec une note en attente : envoyée d’abord, copie locale effacée seulement après succès', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValue(ok([row({ c1: card(1, T + 1, 1, 1) }, 10)]))
    act(() => hook.current.grade('c1', 2, T))
    act(() => hook.current.signOut())
    await settle()
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
    expect(fake.state.signOut).toHaveBeenCalledTimes(1)
    expect(local(A)).toBeNull()
    expect(hook.current.status).toBe('signedout')
    expect(hook.current.prog.cards).toEqual({})
  })

  test('déconnexion hors réseau : copie locale gardée, plus aucun envoi ensuite', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValue({ data: null, error: NETWORK_ERROR })
    act(() => hook.current.grade('c1', 2, T))
    act(() => hook.current.signOut())
    await settle()
    expect(fake.state.signOut).toHaveBeenCalledTimes(1)
    expect((local(A) as { cards: Record<string, unknown> }).cards.c1).toBeDefined()
    await settle(60_000)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
  })

  test('déconnexion pendant un envoi en vol : copie locale gardée, réponse ignorée', async () => {
    await signedInAndLoaded(A)
    const inFlight = deferred<Res>()
    fake.state.rpc.mockReturnValueOnce(inFlight.promise)
    act(() => hook.current.logSession({ d: T, n: 1, ok: 1, k: 'day', l: 'Jour' }))
    await settle()
    act(() => hook.current.signOut())
    await settle()
    expect(hook.current.status).toBe('signedout')
    expect(local(A)).not.toBeNull()
    inFlight.resolve(ok([row({ z: card(1, T + 1, 1, 1) }, 10)]))
    await settle(60_000)
    expect(hook.current.prog.cards).toEqual({})
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
  })

  test('SIGNED_OUT venu d’un autre onglet : état remis à zéro sans envoi', async () => {
    await signedInAndLoaded(A, row({ c1: card(1, T + 1, 1, 1) }))
    act(() => fake.state.authCb!('SIGNED_OUT', null))
    await settle(SAVE_DELAY * 2)
    expect(hook.current.status).toBe('signedout')
    expect(hook.current.email).toBeNull()
    expect(fake.state.rpc).not.toHaveBeenCalled()
  })
})

describe('useRevision : réessayer', () => {
  test('pendant le chargement : la lecture dépassée n’installe rien', async () => {
    const stale = deferred<Res>()
    const fresh = deferred<Res>()
    fake.state.session = { user: A }
    fake.state.progress.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
    render()
    act(() => hook.current.init())
    await settle()
    expect(hook.current.status).toBe('loading')

    act(() => hook.current.retry())
    await settle()
    expect(fake.state.progress).toHaveBeenCalledTimes(2)
    fresh.resolve(ok(row({ fresh: card(1, T + 1, 1, 1) }, 10)))
    await settle()
    expect(hook.current.status).toBe('ready')

    stale.resolve(ok(row({ stale: card(5, T + 60, 9, 9) }, 999)))
    await settle(SAVE_DELAY * 2)
    expect(Object.keys(hook.current.prog.cards)).toEqual(['fresh'])
    expect(hook.current.prog.xp).toBe(10)
    expect(hook.current.status).toBe('ready')
  })

  test('après « indisponible » : la révision se charge', async () => {
    fake.state.session = { user: A }
    fake.state.progress.mockResolvedValueOnce({ data: null, error: NETWORK_ERROR }).mockResolvedValueOnce(ok(null))
    render()
    act(() => hook.current.init())
    await settle()
    expect(hook.current.status).toBe('unavailable')
    act(() => hook.current.retry())
    await settle()
    expect(hook.current.status).toBe('ready')
  })
})

describe('useRevision : connexion par lien ou code (D4)', () => {
  async function sent(): Promise<void> {
    render()
    act(() => hook.current.init())
    await settle()
    act(() => hook.current.requestLink(' a@example.com '))
    await settle()
  }

  test('demande de lien : adresse nettoyée, création de compte permise, écran « Lien envoyé »', async () => {
    await sent()
    expect(fake.state.signInWithOtp).toHaveBeenCalledWith({ email: 'a@example.com', options: { emailRedirectTo: 'http://localhost:5173/?screen=revision', shouldCreateUser: true } })
    expect(hook.current.signIn.step).toBe('sent')
    expect(hook.current.signIn.email).toBe('a@example.com')
  })

  test('adresse invalide : erreur sans appel', async () => {
    render()
    act(() => hook.current.requestLink('pas-une-adresse'))
    expect(hook.current.signIn).toEqual({ step: 'error', message: 'Adresse e-mail invalide.' })
    expect(fake.state.signInWithOtp).not.toHaveBeenCalled()
  })

  test('code de 5 chiffres refusé sans appel ; code expiré : message clair', async () => {
    await sent()
    act(() => hook.current.verifyCode('12345'))
    expect(hook.current.signIn.code).toEqual({ status: 'error', message: 'Le code compte 6 chiffres.' })
    expect(fake.state.verifyOtp).not.toHaveBeenCalled()

    fake.state.verifyOtp.mockResolvedValueOnce({ error: { status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' } })
    act(() => hook.current.verifyCode('123456'))
    expect(hook.current.signIn.code?.status).toBe('verifying')
    await settle()
    expect(fake.state.verifyOtp).toHaveBeenCalledWith({ email: 'a@example.com', token: '123456', type: 'email' })
    expect(hook.current.signIn.code?.message).toMatch(/Code incorrect ou expiré/)
  })

  test('code accepté : SIGNED_IN charge la progression et remet la connexion à zéro', async () => {
    await sent()
    fake.state.progress.mockResolvedValueOnce(ok(null))
    act(() => hook.current.verifyCode('123456'))
    act(() => fake.state.authCb!('SIGNED_IN', { user: A }))
    await settle()
    expect(hook.current.signIn).toEqual({ step: 'idle' })
    expect(hook.current.status).toBe('ready')
    expect(hook.current.email).toBe(A.email)
  })

  test('renvoi : même adresse, notice annoncée, code effacé', async () => {
    await sent()
    act(() => hook.current.verifyCode('1'))
    act(() => hook.current.resendLink())
    await settle()
    expect(fake.state.signInWithOtp).toHaveBeenCalledTimes(2)
    expect(hook.current.signIn.notice).toEqual({ kind: 'ok', text: 'Nouveau lien envoyé à a@example.com.' })
    expect(hook.current.signIn.code).toBeUndefined()
  })
})
