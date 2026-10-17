import { describe, expect, test } from 'vitest'
import { AUTH_LOG_KEY, AUTH_LOG_MAX, appendAuthLog, hasStoredToken, readAuthLog, type AuthLogEntry } from './authLog'
import { formatAuthLog } from './authLogFormat'

function memoryStore(init: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(init))
  return {
    get length() { return data.size },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
    clear: () => data.clear(),
  }
}

const entry = (t: number, k: AuthLogEntry['k'] = 'forced'): AuthLogEntry => ({ t, k, vis: 'visible', on: true, app: 'navigateur', tok: true })

describe('journal de connexion de l’appareil', () => {
  test('ajoute les événements dans l’ordre et ne garde que les derniers', () => {
    const store = memoryStore()
    for (let i = 0; i < AUTH_LOG_MAX + 5; i++) appendAuthLog(store, entry(i))
    const log = readAuthLog(store)
    expect(log).toHaveLength(AUTH_LOG_MAX)
    expect(log[0].t).toBe(5)
    expect(log.at(-1)!.t).toBe(AUTH_LOG_MAX + 4)
  })

  test('contenu illisible ou entrées invalides : ignorés', () => {
    expect(readAuthLog(memoryStore({ [AUTH_LOG_KEY]: '{oups' }))).toEqual([])
    const mixed = JSON.stringify([entry(1), { t: 'x', k: 'forced' }, { ...entry(2), k: 'inconnu' }])
    expect(readAuthLog(memoryStore({ [AUTH_LOG_KEY]: mixed })).map(e => e.t)).toEqual([1])
    expect(readAuthLog(null)).toEqual([])
  })

  test('stockage bloqué : aucune erreur', () => {
    const store = { ...memoryStore(), setItem: () => { throw new Error('quota') } } as Storage
    expect(() => appendAuthLog(store, entry(1))).not.toThrow()
  })

  test('ne contient aucune donnée personnelle (ni e-mail, ni identifiant)', () => {
    const store = memoryStore()
    appendAuthLog(store, entry(1))
    expect(Object.keys(JSON.parse(store.getItem(AUTH_LOG_KEY)!)[0]).sort()).toEqual(['app', 'k', 'on', 't', 'tok', 'vis'])
  })

  test('hasStoredToken : présence du jeton Supabase dans le stockage', () => {
    expect(hasStoredToken(memoryStore({ 'sb-abcd-auth-token': '{}' }))).toBe(true)
    expect(hasStoredToken(memoryStore({ 'xxb.progress.v1.u': '{}' }))).toBe(false)
    expect(hasStoredToken(null)).toBe(false)
  })

  test('formatAuthLog : une ligne lisible par événement, la plus récente en premier', () => {
    const at = new Date(2026, 9, 17, 15, 42).getTime()
    const text = formatAuthLog([entry(at - 60_000, 'signed_in'), { ...entry(at), vis: 'hidden', on: false, app: 'appli', tok: false }])
    expect(text.split('\n')).toEqual([
      '17/10 15:42 · déconnexion imposée · onglet caché · hors réseau · appli installée · sans jeton',
      '17/10 15:41 · connexion · onglet visible · en ligne · navigateur · jeton présent',
    ])
  })
})
