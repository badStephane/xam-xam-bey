/**
 * Enquête « déconnexion mobile » (lot 4) : le vrai client supabase-js (auth-js 2.117.x), avec notre fetch (délai, keepalive),
 * face à un serveur Auth simulé qui suit les règles relevées sur GoTrue v2.197 (pile locale, voir 05-build) :
 * - un jeton présenté devient « parent » ; le parent du jeton actif est accepté à tout moment et rend le jeton actif ;
 * - un jeton plus ancien (grand-parent), hors fenêtre de réutilisation : 400 refresh_token_already_used.
 * Échelle de temps réduite : délai du client 50 ms, première réponse en 120 ms, fenêtre de réutilisation 100 ms.
 */
import { createClient, type AuthChangeEvent } from '@supabase/supabase-js'
import { afterEach, describe, expect, test } from 'vitest'
import { withTimeout } from './fetchTimeout'
import { withKeepalive } from './keepalive'

const URL_BASE = 'https://projet.supabase.co'
const CLIENT_TIMEOUT_MS = 50
const SERVER_DELAY_MS = 120
const REUSE_INTERVAL_MS = 100
const STORAGE_KEY = 'test-auth'
const USER = { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'a@example.com' }

const clients: Array<{ auth: { stopAutoRefresh(): Promise<void> } }> = []
afterEach(async () => { await Promise.all(clients.splice(0).map(c => c.auth.stopAutoRefresh())) })

const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (exp: number): string => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, exp, role: 'authenticated' })}.sig`

function sessionFor(refreshToken: string, expiresAt: number) {
  return { access_token: jwt(expiresAt), token_type: 'bearer', expires_in: expiresAt - Math.floor(Date.now() / 1000), expires_at: expiresAt, refresh_token: refreshToken, user: USER }
}

/** Serveur Auth simulé : la rotation a lieu dès réception ; la première réponse part après `SERVER_DELAY_MS`. */
function fakeGoTrue() {
  let current = 'rt-1'
  let parent: string | null = null
  let n = 1
  const revokedAt = new Map<string, number>()
  const calls: string[] = []
  const json = (status: number, body: object): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const issue = (): Response => json(200, sessionFor(current, Math.floor(Date.now() / 1000) + 3600))

  const fetchFn = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.includes('/auth/v1/token?grant_type=refresh_token')) return Promise.resolve(json(404, { msg: 'inattendu' }))
    const token = (JSON.parse(String(init?.body)) as { refresh_token: string }).refresh_token
    calls.push(token)
    const revoked = revokedAt.get(token)
    let response: Response
    if (token === current) {
      revokedAt.set(current, Date.now())
      parent = current
      n += 1
      current = `rt-${n}`
      response = issue()
    } else if (token === parent || (revoked !== undefined && Date.now() - revoked < REUSE_INTERVAL_MS)) {
      response = issue()
    } else {
      response = json(400, { code: 400, error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' })
    }
    return new Promise((resolve, reject) => {
      // Seule la première réponse est lente (radio du téléphone qui se réveille) ; les suivantes partent aussitôt.
      const timer = setTimeout(() => resolve(response), calls.length === 1 ? SERVER_DELAY_MS : 0)
      init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal?.reason) })
    })
  }
  /** Simule un autre appareil ou contexte qui a déjà fait tourner le jeton deux fois. */
  const rotateTwiceElsewhere = (): void => { revokedAt.set('rt-1', 0); revokedAt.set('rt-2', 0); parent = 'rt-2'; n = 3; current = 'rt-3' }
  return { fetchFn, calls, current: () => current, rotateTwiceElsewhere }
}

function clientFor(server: ReturnType<typeof fakeGoTrue>) {
  const expired = Math.floor(Date.now() / 1000) - 60
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(sessionFor('rt-1', expired)) })
  const client = createClient(URL_BASE, 'anon-key', {
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: STORAGE_KEY, storage },
    global: { fetch: withKeepalive(withTimeout(server.fetchFn, CLIENT_TIMEOUT_MS)) },
  })
  clients.push(client)
  const events: AuthChangeEvent[] = []
  client.auth.onAuthStateChange(event => { events.push(event) })
  return { client, storage, events }
}

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
  }
}


describe('rafraîchissement du jeton au retour sur l’onglet (jeton d’accès expiré)', () => {
  test('réponse de /auth/v1/token plus lente que le délai du client : coupée puis redemandée, la personne reste connectée', async () => {
    // Arrange
    const server = fakeGoTrue()
    const { client, storage, events } = clientFor(server)

    // Act : le client relit sa session (réveil de l'onglet ou rechargement par Android).
    const { data, error } = await client.auth.getSession()

    // Assert : premier essai coupé à 50 ms après la rotation ; le second, avec le même jeton (parent), rend le jeton actif.
    expect(server.calls).toEqual(['rt-1', 'rt-1'])
    expect(error).toBeNull()
    expect(events).not.toContain('SIGNED_OUT')
    expect(data.session?.refresh_token).toBe('rt-2')
    expect(storage.data.has(STORAGE_KEY)).toBe(true)
  })

  test('refus non réseau du serveur (ici jeton tourné deux fois ailleurs) avec jeton d’accès expiré : session supprimée, SIGNED_OUT', async () => {
    // Arrange
    const server = fakeGoTrue()
    server.rotateTwiceElsewhere()
    const { client, storage, events } = clientFor(server)

    // Act
    const { data, error } = await client.auth.getSession()

    // Assert : auth-js supprime la session et émet SIGNED_OUT ; la page passe alors en « déconnecté » (resetUser).
    expect(error).toMatchObject({ code: 'refresh_token_already_used' })
    expect(data.session).toBeNull()
    expect(events).toContain('SIGNED_OUT')
    expect(storage.data.has(STORAGE_KEY)).toBe(false)
  })
})
