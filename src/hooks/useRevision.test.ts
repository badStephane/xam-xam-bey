// @vitest-environment happy-dom
/**
 * L1-8 (QA lot 2) : le hook qui porte toute la persistance, testé avec un client Supabase simulé.
 * Pas de @testing-library : un rendu minimal avec react-dom/client et act suffit pour un hook.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SAVE_DELAY } from '../lib/constants'
import { localProgressKey, writeLocalProgress } from '../lib/progressSync'
import { readAuthLog } from '../lib/authLog'
import { writeKnownUser } from '../lib/knownUser'
import { gradesQueueKey, readGradesQueue, utcDay, type QueuedGrade } from '../lib/gradeQueue'
import { leagueCacheKey } from '../lib/gameKeys'
import { dailyCards } from '../lib/srs'
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
    session: null as { user: { id: string; email: string }; expires_at?: number } | null,
    sessionError: null as unknown,
    getSession: vi.fn(),
    /** Lignes publiées de la table cards, et échec simulé de la lecture du contenu (base injoignable). */
    cards: [] as unknown[],
    contentError: null as unknown,
    authCb: null as ((event: string, session: unknown) => void) | null,
    progress: vi.fn<(userId: string) => Promise<{ data: unknown; error: unknown }>>(),
    rpc: vi.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>(),
    signOut: vi.fn(async (_args?: unknown) => ({ error: null })),
    signInWithOtp: vi.fn<(args: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
    verifyOtp: vi.fn<(args: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
  }
  function builder(table: string) {
    let userId = ''
    const rows = table === 'revision_content' ? [{ id: 'plan', data: { months: [] } }] : state.cards
    const b = {
      select: () => b,
      eq: (_col: string, v: string) => { userId = v; return b },
      order: () => b,
      maybeSingle: () => state.progress(userId),
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve(state.contentError ? { data: null, error: state.contentError } : { data: rows, error: null }).then(ok, ko),
    }
    return b
  }
  const client = {
    auth: {
      getSession: async () => {
        state.getSession()
        return { data: { session: state.sessionError ? null : state.session }, error: state.sessionError }
      },
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        state.authCb = cb
        return { data: { subscription: { unsubscribe: () => { state.authCb = null } } } }
      },
      signOut: (args?: unknown) => state.signOut(args),
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
let online = true
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })

/** Coupe ou rétablit le réseau comme le navigateur : `navigator.onLine` puis l'événement. */
function setNetwork(on: boolean, dispatch = false): void {
  online = on
  if (dispatch) act(() => { window.dispatchEvent(new Event(on ? 'online' : 'offline')) })
}
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
  fake.state.sessionError = null
  fake.state.getSession.mockClear()
  fake.state.cards = []
  fake.state.contentError = null
  fake.state.authCb = null
  setNetwork(true)
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

  test('bonus de reprise : XP perso ajoutée et envoyée, sans carte notée ni note de ligue', async () => {
    await signedInAndLoaded(A, row({}, 40))
    fake.state.rpc.mockResolvedValue(ok(null))

    act(() => hook.current.addXp(2))
    expect(hook.current.prog.xp).toBe(42)
    expect(hook.current.prog.cards).toEqual({})
    expect(readGradesQueue(localStorage, A.id)).toEqual([])
    await settle(SAVE_DELAY)
    expect(fake.state.rpc).toHaveBeenCalledWith('save_progress', expect.objectContaining({ p_xp: 42 }))
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

  test('déconnexion choisie : seulement ce téléphone (scope local), sans bandeau de déconnexion imposée', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValue(ok(null))
    act(() => hook.current.signOut())
    await settle()
    expect(fake.state.signOut).toHaveBeenCalledWith({ scope: 'local' })
    act(() => fake.state.authCb!('SIGNED_OUT', null))
    expect(hook.current.forcedOut).toBe(false)
  })

  test('SIGNED_OUT imposé : forcedOut vrai, remis à faux à la reconnexion', async () => {
    await signedInAndLoaded(A)
    expect(hook.current.forcedOut).toBe(false)
    act(() => fake.state.authCb!('SIGNED_OUT', null))
    expect(hook.current.forcedOut).toBe(true)
    fake.state.session = { user: A }
    fake.state.progress.mockResolvedValueOnce(ok(null))
    act(() => fake.state.authCb!('SIGNED_IN', { user: A }))
    await settle()
    expect(hook.current.forcedOut).toBe(false)
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

  test('quête du jour : notes prises après un SIGNED_OUT imposé (séance en cours) gardées et renvoyées à la reconnexion', async () => {
    // c1 est à revoir aujourd'hui ; la séance du jour est ouverte quand le serveur refuse le jeton (retour après ~10 min).
    const due = row({ c1: card(1, T, 3, 2) })
    await signedInAndLoaded(A, due)
    act(() => fake.state.authCb!('SIGNED_OUT', null))
    // L'écran de séance n'est pas gardé par l'état de connexion : le scout continue de répondre.
    act(() => hook.current.grade('c1', 2, T))
    act(() => hook.current.logSession({ d: T, n: 1, ok: 1, k: 'daily', l: 'Session du jour' }))
    await settle(SAVE_DELAY * 2)
    expect(fake.state.rpc).not.toHaveBeenCalled()

    // Reconnexion du même compte : le serveur n'a jamais reçu la note.
    fake.state.session = { user: A }
    fake.state.progress.mockResolvedValueOnce(ok(due))
    fake.state.rpc.mockResolvedValue(ok(null))
    act(() => fake.state.authCb!('SIGNED_IN', { user: A }))
    await settle(SAVE_DELAY * 2)

    const c1 = { id: 'c1', q: 'Q', a: 'R', src: '', note: '', th: 1 }
    expect(dailyCards([c1], hook.current.prog, T, 1).due).toEqual([])
    expect(hook.current.prog.cards.c1[1]).toBeGreaterThan(T)
    expect(lastRpcArgs()!.p_cards.c1[2]).toBe(4)
    expect(hook.current.prog.sessions).toHaveLength(1)
  })

  test('déconnexion choisie : une note arrivée ensuite ne recrée pas la copie locale effacée', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValue(ok(null))
    act(() => hook.current.signOut())
    await settle()
    expect(local(A)).toBeNull()
    act(() => hook.current.grade('c1', 2, T))
    await settle(SAVE_DELAY * 2)
    expect(local(A)).toBeNull()
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

describe('useRevision : révision hors ligne (lot 4, F1)', () => {
  const CARD_ROWS = [
    { id: 'c1', zone: 1, document_id: 7, position: 1, q: 'Q1', a: 'R1', src: '', note: '', qcm: null, status: 'published' },
    { id: 'c2', zone: 1, document_id: null, position: 2, q: 'Q2', a: 'R2', src: '', note: '', qcm: null, status: 'published' },
  ]
  const cardsKey = (u: User) => `xxb.cards.v1.${u.id}`

  /** Premier passage en ligne sur l'appareil : copie des cartes et compte retenus, puis la page est fermée. */
  async function firstVisitOnline(u: User, serverRow: unknown = null): Promise<void> {
    fake.state.cards = CARD_ROWS
    await signedInAndLoaded(u, serverRow)
    act(() => root!.unmount())
    root = null
  }

  /** Rechargement hors réseau. */
  async function reloadOffline(): Promise<void> {
    setNetwork(false)
    fake.state.getSession.mockClear()
    fake.state.progress.mockReset()
    render()
    act(() => hook.current.init())
    await settle()
  }

  test('chargement en ligne : copie des cartes et compte retenus sur l’appareil', async () => {
    await firstVisitOnline(A)
    expect(JSON.parse(localStorage.getItem(cardsKey(A))!)).toMatchObject({ v: 1, user: A.id })
    expect(JSON.parse(localStorage.getItem('xxb.user.v1')!)).toEqual({ id: A.id, email: A.email })
  })

  test('rechargement hors réseau : révision lue depuis l’appareil sans attendre Supabase', async () => {
    await firstVisitOnline(A, row({ old: card(1, T + 1, 1, 1) }, 10))
    await reloadOffline()
    expect(fake.state.getSession).not.toHaveBeenCalled()
    expect(fake.state.progress).not.toHaveBeenCalled()
    expect(hook.current.status).toBe('ready')
    expect(hook.current.localOnly).toBe(true)
    expect(hook.current.userId).toBe(A.id)
    expect(hook.current.email).toBe(A.email)
    expect(hook.current.content.cards[1].map(c => c.id)).toEqual(['c1', 'c2'])
    expect(hook.current.content.cards[1][0].doc).toBe(7)
    // Progression : la copie locale du lot 1.
    expect(hook.current.prog.cards.old).toEqual(card(1, T + 1, 1, 1))
  })

  test('notes hors réseau : copie locale, aucun envoi, aucune erreur ; au retour, un seul envoi après relecture', async () => {
    await firstVisitOnline(A)
    await reloadOffline()
    act(() => hook.current.grade('c1', 2, T))
    act(() => hook.current.grade('c2', 0, T))
    await settle(60_000)
    expect(fake.state.rpc).not.toHaveBeenCalled()
    expect(hook.current.saveErr).toBeNull()
    expect(Object.keys((local(A) as { cards: Record<string, unknown> }).cards).sort()).toEqual(['c1', 'c2'])

    fake.state.progress.mockResolvedValueOnce(ok(row({ other: card(3, T + 7, 4, 4) }, 40)))
    fake.state.rpc.mockResolvedValue(ok([row({ c1: card(1, T + 1, 1, 1), c2: card(0, T + 1, 1, 0), other: card(3, T + 7, 4, 4) }, 50)]))
    setNetwork(true, true)
    await settle()
    // Rechargement discret : jamais l'écran de chargement en pleine séance.
    expect(hook.current.status).toBe('ready')
    expect(fake.state.progress).toHaveBeenCalledTimes(1)
    expect(hook.current.localOnly).toBe(false)
    await settle(SAVE_DELAY)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
    expect(Object.keys(lastRpcArgs()!.p_cards).sort()).toEqual(['c1', 'c2', 'other'])
    expect(hook.current.prog.xp).toBe(50)

    // Autres déclencheurs (second `online`, jeton rafraîchi) : rien de plus à envoyer.
    setNetwork(true, true)
    act(() => fake.state.authCb!('TOKEN_REFRESHED', { user: A }))
    await settle(SAVE_DELAY * 3)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
  })

  test('jeton expiré au retour du réseau : rien avec la clé anon ; envoi après TOKEN_REFRESHED', async () => {
    await firstVisitOnline(A)
    await reloadOffline()
    act(() => hook.current.grade('c1', 2, T))
    fake.state.session = { user: A, expires_at: Math.floor(Date.now() / 1000) - 60 }
    setNetwork(true, true)
    await settle(SAVE_DELAY)
    expect(fake.state.progress).not.toHaveBeenCalled()
    expect(fake.state.rpc).not.toHaveBeenCalled()
    expect(hook.current.localOnly).toBe(true)

    fake.state.session = { user: A, expires_at: Math.floor(Date.now() / 1000) + 3600 }
    fake.state.progress.mockResolvedValueOnce(ok(null))
    fake.state.rpc.mockResolvedValue(ok([row({ c1: card(1, T + 1, 1, 1) }, 10)]))
    act(() => fake.state.authCb!('TOKEN_REFRESHED', fake.state.session))
    await settle(SAVE_DELAY)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
    expect(lastRpcArgs()!.p_cards.c1).toBeDefined()
    // Le nouvel essai programmé ne renvoie rien.
    await settle(30_000)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
  })

  test('jeton toujours pas rafraîchi : nouvel essai toutes les 10 s, sans jamais l’écran de chargement', async () => {
    await firstVisitOnline(A)
    await reloadOffline()
    fake.state.session = { user: A, expires_at: Math.floor(Date.now() / 1000) - 60 }
    setNetwork(true, true)
    await settle()
    const calls = fake.state.getSession.mock.calls.length
    await settle(10_000)
    expect(fake.state.getSession.mock.calls.length).toBeGreaterThan(calls)
    expect(hook.current.status).toBe('ready')
  })

  test('en ligne, note puis coupure : aucun essai ni erreur hors réseau, envoi unique à l’événement online', async () => {
    await signedInAndLoaded(A)
    setNetwork(false, true)
    act(() => hook.current.grade('c1', 2, T))
    await settle(60_000)
    expect(fake.state.rpc).not.toHaveBeenCalled()
    expect(hook.current.saveErr).toBeNull()
    fake.state.rpc.mockResolvedValue(ok([row({ c1: card(1, T + 1, 1, 1) }, 10)]))
    setNetwork(true, true)
    await settle()
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
    await settle(60_000)
    expect(fake.state.rpc).toHaveBeenCalledTimes(1)
  })

  test('jamais connecté sur l’appareil, hors réseau : écran de connexion, aucun appel', async () => {
    setNetwork(false)
    render()
    act(() => hook.current.init())
    await settle()
    expect(hook.current.status).toBe('signedout')
    expect(fake.state.getSession).not.toHaveBeenCalled()
  })

  test('compte retenu mais copie absente ou invalide : indisponible', async () => {
    await firstVisitOnline(A)
    localStorage.setItem(cardsKey(A), '{"v":1,"user":"user-a","cards":"x"}')
    await reloadOffline()
    expect(hook.current.status).toBe('unavailable')
    expect(hook.current.userId).toBeNull()
  })

  test('copie d’un autre compte jamais lue', async () => {
    await firstVisitOnline(A)
    localStorage.setItem('xxb.user.v1', JSON.stringify({ id: B.id, email: B.email }))
    localStorage.setItem(cardsKey(B), localStorage.getItem(cardsKey(A))!)
    await reloadOffline()
    expect(hook.current.status).toBe('unavailable')
  })

  test('réseau annoncé mais session illisible (rafraîchissement en échec) : révision depuis l’appareil', async () => {
    await firstVisitOnline(A)
    fake.state.sessionError = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }
    render()
    act(() => hook.current.init())
    await settle()
    expect(hook.current.status).toBe('ready')
    expect(hook.current.localOnly).toBe(true)
  })

  test('base injoignable au chargement : révision depuis l’appareil ; sans copie : indisponible', async () => {
    await firstVisitOnline(A)
    fake.state.contentError = NETWORK_ERROR
    await signedInAndLoaded(A)
    expect(hook.current.status).toBe('ready')
    expect(hook.current.localOnly).toBe(true)
    act(() => root!.unmount())
    root = null
    localStorage.clear()
    await signedInAndLoaded(A)
    expect(hook.current.status).toBe('unavailable')
  })

  test('déconnexion : compte retenu et copie des cartes oubliés', async () => {
    fake.state.cards = CARD_ROWS
    await signedInAndLoaded(A)
    expect(localStorage.getItem(cardsKey(A))).not.toBeNull()
    act(() => hook.current.signOut())
    await settle()
    expect(localStorage.getItem(cardsKey(A))).toBeNull()
    expect(localStorage.getItem('xxb.user.v1')).toBeNull()
  })

  test('E1 tenu hors réseau : une note par appel, jamais rejouée par le retour du réseau', async () => {
    await firstVisitOnline(A)
    await reloadOffline()
    act(() => hook.current.grade('c1', 2, T))
    fake.state.progress.mockResolvedValueOnce(ok(null))
    fake.state.rpc.mockImplementation(async (_n, args) => ok([args && { cards: (args as { p_cards: unknown }).p_cards, sessions: [], xp: 10 }]))
    setNetwork(true, true)
    await settle(SAVE_DELAY)
    // Vues = 1 : la note n'a été appliquée qu'une fois, malgré la relecture et la fusion.
    expect(lastRpcArgs()!.p_cards.c1[2]).toBe(1)
    expect(hook.current.prog.cards.c1[2]).toBe(1)
  })

  // QA lot 4 (14-qa-lot4.md) : deux comptes sur un appareil, session d'un autre compte, stockage plein.
  test('QA L4 : A puis B sur le même appareil (sans déconnexion) : la copie de A disparaît, B ne voit rien de A hors réseau', async () => {
    await firstVisitOnline(A, row({ secretA: card(2, T + 3, 2, 2) }, 30))
    fake.state.session = { user: A }
    fake.state.progress.mockResolvedValueOnce(ok(row({ secretA: card(2, T + 3, 2, 2) }, 30)))
    render()
    act(() => hook.current.init())
    await settle()
    fake.state.session = { user: B }
    fake.state.progress.mockResolvedValueOnce(ok(null))
    act(() => fake.state.authCb!('SIGNED_IN', { user: B }))
    await settle()
    expect(hook.current.userId).toBe(B.id)
    expect(localStorage.getItem(cardsKey(A))).toBeNull()
    expect(JSON.parse(localStorage.getItem('xxb.user.v1')!)).toEqual({ id: B.id, email: B.email })
    act(() => root!.unmount())
    root = null
    await reloadOffline()
    expect(hook.current.userId).toBe(B.id)
    expect(hook.current.email).toBe(B.email)
    expect(hook.current.prog.cards.secretA).toBeUndefined()
    expect(hook.current.prog.xp).toBe(0)
  })

  test('QA L4 : révision de A depuis l’appareil, session revenue au nom de B : jamais d’envoi des notes de A', async () => {
    await firstVisitOnline(A)
    await reloadOffline()
    act(() => hook.current.grade('c1', 2, T))
    fake.state.session = { user: B, expires_at: Math.floor(Date.now() / 1000) + 3600 }
    fake.state.rpc.mockResolvedValue(ok([row({}, 0)]))
    setNetwork(true, true)
    act(() => fake.state.authCb!('TOKEN_REFRESHED', fake.state.session))
    await settle(SAVE_DELAY + 30_000)
    expect(fake.state.rpc).not.toHaveBeenCalled()
    expect(fake.state.progress).not.toHaveBeenCalled()
    expect((local(A) as { cards: Record<string, unknown> }).cards.c1).toBeDefined()
  })

  test('QA L4 : stockage plein à l’écriture de la copie des cartes : révision prête, rien ne plante', async () => {
    // Pas de vi.spyOn sur localStorage : avec happy-dom, la restauration casse le stockage pour les tests suivants.
    const store = window.localStorage
    const full: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'clear'> & { readonly length: number } = {
      getItem: k => store.getItem(k),
      setItem: (k, v) => {
        if (k.startsWith('xxb.cards.')) throw new DOMException('quota', 'QuotaExceededError')
        store.setItem(k, v)
      },
      removeItem: k => store.removeItem(k),
      key: i => store.key(i),
      clear: () => store.clear(),
      get length() { return store.length },
    }
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => full })
    try {
      fake.state.cards = CARD_ROWS
      await signedInAndLoaded(A)
      expect(hook.current.status).toBe('ready')
      expect(hook.current.localOnly).toBe(false)
      expect(store.getItem(cardsKey(A))).toBeNull()
      // Sans copie, le compte n'est pas retenu : hors réseau, écran honnête plutôt qu'une révision vide.
      expect(store.getItem('xxb.user.v1')).toBeNull()
      act(() => hook.current.grade('c1', 2, T))
      expect(JSON.parse(store.getItem(localProgressKey(A.id))!).cards.c1).toBeDefined()
    } finally {
      if (desc) Object.defineProperty(window, 'localStorage', desc)
    }
  })

  // L4-1 (Mineur) : session absente au chargement en ligne (déconnecté ailleurs, jeton révoqué) : la copie et le compte
  // retenu de l'ancien compte restent ; hors réseau ensuite, sa révision et sa progression locale s'affichent. Passe à
  // `test` quand le correctif est fait (fait : forgetDevice dans init et resetUser).
  test('L4-1 : SIGNED_OUT avant tout chargement : copie et compte retenu oubliés', async () => {
    await firstVisitOnline(A)
    render()
    act(() => fake.state.authCb!('SIGNED_OUT', null))
    await settle()
    expect(localStorage.getItem('xxb.user.v1')).toBeNull()
    expect(localStorage.getItem(cardsKey(A))).toBeNull()
  })

  test('L4-1 : hors réseau ou rafraîchissement en échec : rien n’est oublié', async () => {
    await firstVisitOnline(A)
    await reloadOffline()
    act(() => root!.unmount())
    root = null
    setNetwork(true)
    fake.state.sessionError = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }
    render()
    act(() => hook.current.init())
    await settle()
    expect(hook.current.localOnly).toBe(true)
    expect(localStorage.getItem('xxb.user.v1')).not.toBeNull()
    expect(localStorage.getItem(cardsKey(A))).not.toBeNull()
  })

  test('QA L4-1 : session absente au chargement en ligne : copie des cartes et compte retenu oubliés', async () => {
    await firstVisitOnline(A)
    fake.state.session = null
    render()
    act(() => hook.current.init())
    await settle()
    expect(hook.current.status).toBe('signedout')
    expect(localStorage.getItem('xxb.user.v1')).toBeNull()
    expect(localStorage.getItem(cardsKey(A))).toBeNull()
  })
})

describe('useRevision : notes de ligue (lot 5, L5-1, A11)', () => {
  const argsAt = (i: number) => fake.state.rpc.mock.calls[i]?.[1] as Record<string, unknown>

  test('QCM : la proposition choisie part dans p_grades, la file est vidée après succès, XP de la semaine lue', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValue(ok([{ ...row({ c1: card(1, T + 1, 1, 1) }, 10), week_xp: 10, grades_counted: 1 }]))
    act(() => hook.current.grade('c1', 2, T, 'Baden-Powell'))
    act(() => hook.current.grade('c2', 1, T))
    expect(readGradesQueue(localStorage, A.id)).toHaveLength(2)
    expect(hook.current.isSyncPending()).toBe(true)
    await settle(SAVE_DELAY)
    expect(argsAt(0).p_grades).toEqual([{ c: 'c1', d: utcDay(Date.now()), g: 2, t: expect.any(Number), a: 'Baden-Powell' }, { c: 'c2', d: utcDay(Date.now()), g: 1, t: expect.any(Number) }])
    expect(readGradesQueue(localStorage, A.id)).toEqual([])
    expect(hook.current.weekSync).toEqual({ seq: 1, weekXp: 10, counted: 1 })
    expect(hook.current.isSyncPending()).toBe(false)
  })

  test('GRADES_INVALID : file abandonnée, la progression repart aussitôt à 3 clés', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'GRADES_INVALID' } })
    fake.state.rpc.mockResolvedValue(ok([row({ c1: card(1, T + 1, 1, 1) }, 10)]))
    act(() => hook.current.grade('c1', 2, T))
    await settle(SAVE_DELAY)
    expect(fake.state.rpc).toHaveBeenCalledTimes(2)
    expect(argsAt(1).p_grades).toBeUndefined()
    expect(readGradesQueue(localStorage, A.id)).toEqual([])
    expect(hook.current.saveErr).toBeNull()
  })

  test('base sans p_grades (PGRST202) : renvoi à 3 clés, file gardée', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    fake.state.rpc.mockResolvedValue(ok([row({ c1: card(1, T + 1, 1, 1) }, 10)]))
    act(() => hook.current.grade('c1', 2, T))
    await settle(SAVE_DELAY)
    expect(fake.state.rpc).toHaveBeenCalledTimes(2)
    expect(argsAt(1).p_grades).toBeUndefined()
    expect(readGradesQueue(localStorage, A.id)).toHaveLength(1)
  })

  test('erreur réseau : la même file est renvoyée au nouvel essai', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValueOnce({ data: null, error: NETWORK_ERROR })
    fake.state.rpc.mockResolvedValue(ok([row({ c1: card(1, T + 1, 1, 1) }, 10)]))
    act(() => hook.current.grade('c1', 2, T))
    await settle(SAVE_DELAY)
    await settle(10_000)
    expect(argsAt(1).p_grades).toEqual(argsAt(0).p_grades)
    expect(readGradesQueue(localStorage, A.id)).toEqual([])
  })

  test('hors réseau : note gardée dans la file, aucun envoi', async () => {
    await signedInAndLoaded(A)
    setNetwork(false)
    act(() => hook.current.grade('c1', 0, T, 'Faux'))
    await settle(SAVE_DELAY * 2)
    expect(fake.state.rpc).not.toHaveBeenCalled()
    expect(readGradesQueue(localStorage, A.id)).toEqual([{ c: 'c1', d: utcDay(Date.now()), g: 0, t: expect.any(Number), a: 'Faux' }])
  })

  // QA lot 5 (18-qa-lot5.md) : file de notes de A en attente, B se connecte sur le même appareil sans déconnexion.
  test('QA L5 : A puis B sur le même appareil : les notes de A ne partent jamais au nom de B', async () => {
    await signedInAndLoaded(A)
    setNetwork(false)
    act(() => hook.current.grade('c1', 2, T, 'Réponse de A'))
    expect(readGradesQueue(localStorage, A.id)).toHaveLength(1)
    fake.state.session = { user: B }
    fake.state.progress.mockResolvedValueOnce(ok(null))
    act(() => fake.state.authCb!('SIGNED_IN', { user: B }))
    await settle()
    expect(hook.current.userId).toBe(B.id)
    setNetwork(true)
    fake.state.rpc.mockResolvedValue(ok([row({ c2: card(1, T + 1, 1, 1) }, 5)]))
    act(() => hook.current.grade('c2', 1, T))
    await settle(SAVE_DELAY)
    const sentGrades = fake.state.rpc.mock.calls.flatMap(c => ((c[1] ?? {}) as { p_grades?: QueuedGrade[] }).p_grades ?? [])
    expect(sentGrades.map(g => g.c)).toEqual(['c2'])
    expect(readGradesQueue(localStorage, B.id)).toEqual([])
    // La file de A ne fuit pas vers B ; elle n'est pas lisible sous la clé de B.
    expect(localStorage.getItem(gradesQueueKey(B.id)) ?? '').not.toContain('Réponse de A')
    // Comme la copie de progression du lot 4, la file de A reste à A (envoyée à son retour, effacée à sa déconnexion).
    expect(readGradesQueue(localStorage, A.id).map(g => g.c)).toEqual(['c1'])
  })

  test('déconnexion : file et classement gardé effacés', async () => {
    await signedInAndLoaded(A)
    setNetwork(false)
    act(() => hook.current.grade('c1', 2, T))
    localStorage.setItem(leagueCacheKey(A.id), '{}')
    setNetwork(true)
    fake.state.rpc.mockResolvedValue(ok([row({ c1: card(1, T + 1, 1, 1) }, 10)]))
    act(() => hook.current.signOut())
    await settle()
    expect(localStorage.getItem(gradesQueueKey(A.id))).toBeNull()
    expect(localStorage.getItem(leagueCacheKey(A.id))).toBeNull()
  })
})

describe('useRevision : journal de connexion de l’appareil (diagnostic)', () => {
  const kinds = () => readAuthLog(localStorage).map(e => e.k)

  test('SIGNED_OUT imposé, puis reconnexion : « forced » puis « signed_in »', async () => {
    await signedInAndLoaded(A)
    act(() => fake.state.authCb!('SIGNED_OUT', null))
    fake.state.session = { user: A }
    fake.state.progress.mockResolvedValueOnce(ok(null))
    act(() => fake.state.authCb!('SIGNED_IN', { user: A }))
    await settle()
    expect(kinds().slice(-2)).toEqual(['forced', 'signed_in'])
  })

  test('« Se déconnecter » : « chosen », jamais « forced »', async () => {
    await signedInAndLoaded(A)
    fake.state.rpc.mockResolvedValue(ok(null))
    act(() => hook.current.signOut())
    await settle()
    act(() => fake.state.authCb!('SIGNED_OUT', null))
    expect(kinds()).toContain('chosen')
    expect(kinds()).not.toContain('forced')
  })

  test('jeton rafraîchi : noté', async () => {
    await signedInAndLoaded(A)
    act(() => fake.state.authCb!('TOKEN_REFRESHED', { user: A }))
    await settle()
    expect(kinds()).toContain('refreshed')
  })

  test('ouverture sans session alors qu’un compte était connu sur l’appareil : « absent »', async () => {
    writeKnownUser(localStorage, { id: A.id, email: A.email })
    fake.state.session = null
    render()
    act(() => hook.current.init())
    await settle()
    expect(kinds()).toEqual(['absent'])
  })

  test('ouverture sans session sur un appareil jamais connecté : rien de noté', async () => {
    fake.state.session = null
    render()
    act(() => hook.current.init())
    await settle()
    expect(kinds()).toEqual([])
  })
})

describe('useRevision : deux onglets du même compte', () => {
  const setVisibility = (v: DocumentVisibilityState) => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
  afterEach(() => setVisibility('visible'))

  test('retour au premier plan : les notes de l’autre onglet (copie locale) sont relues', async () => {
    await signedInAndLoaded(A, row({ c1: card(1, T, 1, 1) }))
    // L'autre onglet note c1 (échéance demain) et l'écrit dans la copie locale.
    writeLocalProgress(localStorage, A.id, { cards: { c1: card(1, T + 1, 2, 2) }, sessions: [], xp: 10 })
    setVisibility('visible')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(hook.current.prog.cards.c1).toEqual(card(1, T + 1, 2, 2))
    expect(hook.current.prog.xp).toBe(10)
  })

  test('événement storage de la copie locale du compte : relue tout de suite', async () => {
    await signedInAndLoaded(A)
    writeLocalProgress(localStorage, A.id, { cards: { c2: card(1, T + 1, 1, 1) }, sessions: [], xp: 10 })
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: localProgressKey(A.id) })) })
    expect(hook.current.prog.cards.c2).toEqual(card(1, T + 1, 1, 1))
  })

  test('copie locale d’un autre compte : ignorée', async () => {
    await signedInAndLoaded(A)
    writeLocalProgress(localStorage, B.id, { cards: { c3: card(1, T + 1, 1, 1) }, sessions: [], xp: 10 })
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: localProgressKey(B.id) })) })
    expect(hook.current.prog.cards.c3).toBeUndefined()
  })
})
