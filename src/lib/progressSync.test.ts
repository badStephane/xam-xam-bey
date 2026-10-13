import { describe, expect, test, vi } from 'vitest'
import { canClearLocal, clearLocalProgress, isAccountSwitch, fromSaveResult, localProgressKey, saveErrorKind, readLocalProgress, reconcileOnLoad, saveArgs, writeLocalProgress, type KeyValueStore } from './progressSync'
import { KEPT_SESSIONS } from './constants'
import { EMPTY_PROGRESS } from './srs'
import type { Progress, SessionLog } from './types'

const T = 20000
const s = (d: number): SessionLog => ({ d, n: 5, ok: 3, k: 'day', l: 'Jour' })

function memoryStore(init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const store = {
    data: { ...init },
    getItem: (k: string) => store.data[k] ?? null,
    setItem: (k: string, v: string) => { store.data = { ...store.data, [k]: v } },
  }
  return store
}

describe('copie locale', () => {
  test('clé versionnée par utilisateur', () => expect(localProgressKey('u1')).toBe('xxb.progress.v1.u1'))
  test('écriture : fusion avec la copie existante (deux onglets, L1-4)', () => {
    const st = memoryStore()
    writeLocalProgress(st, 'u1', { cards: { a: [1, T + 1, 1, 1, T] }, sessions: [], xp: 15 })
    writeLocalProgress(st, 'u1', { cards: { b: [1, T + 1, 1, 1, T] }, sessions: [], xp: 10 })
    expect(readLocalProgress(st, 'u1')).toEqual({ cards: { a: [1, T + 1, 1, 1, T], b: [1, T + 1, 1, 1, T] }, sessions: [], xp: 15 })
  })
  test('écriture puis lecture restituent la progression', () => {
    const st = memoryStore()
    const p: Progress = { cards: { a: [1, T + 1, 1, 1, T] }, sessions: [s(T)], xp: 10 }
    writeLocalProgress(st, 'u1', p)
    expect(JSON.parse(st.data['xxb.progress.v1.u1'])).toEqual(p)
    expect(readLocalProgress(st, 'u1')).toEqual(p)
  })
  test('absente, illisible ou stockage indisponible : progression vide', () => {
    expect(readLocalProgress(memoryStore(), 'u1')).toEqual(EMPTY_PROGRESS)
    expect(readLocalProgress(memoryStore({ 'xxb.progress.v1.u1': '{oups' }), 'u1')).toEqual(EMPTY_PROGRESS)
    expect(readLocalProgress(null, 'u1')).toEqual(EMPTY_PROGRESS)
    const broken: KeyValueStore = { getItem: () => { throw new Error('bloqué') }, setItem: () => { throw new Error('plein') } }
    expect(readLocalProgress(broken, 'u1')).toEqual(EMPTY_PROGRESS)
    expect(() => writeLocalProgress(broken, 'u1', EMPTY_PROGRESS)).not.toThrow()
    expect(() => writeLocalProgress(null, 'u1', EMPTY_PROGRESS)).not.toThrow()
  })
  test('entrées corrompues ignorées à la lecture', () => {
    const st = memoryStore({ 'xxb.progress.v1.u1': JSON.stringify({ cards: { a: [1, T, 1, 1, T], b: [1] }, sessions: [], xp: 5 }) })
    expect(readLocalProgress(st, 'u1').cards).toEqual({ a: [1, T, 1, 1, T] })
  })
})

describe('reconcileOnLoad', () => {
  const server: Progress = { cards: { a: [1, T + 1, 1, 1, T] }, sessions: [s(T - 1)], xp: 10 }
  test('copie locale en avance (échec 3G puis fermeture) : fusion et renvoi au serveur', () => {
    const local: Progress = { cards: { a: [2, T + 3, 2, 2, T], b: [1, T + 1, 1, 1, T] }, sessions: [s(T - 1), s(T)], xp: 30 }
    const r = reconcileOnLoad(server, local)
    expect(r.prog.cards).toEqual(local.cards)
    expect(r.prog.xp).toBe(30)
    expect(r.prog.sessions).toHaveLength(2)
    expect(r.dirty).toBe(true)
  })
  test('copie locale déjà synchronisée ou absente : rien à renvoyer', () => {
    expect(reconcileOnLoad(server, server)).toEqual({ prog: server, dirty: false })
    expect(reconcileOnLoad(server, EMPTY_PROGRESS)).toEqual({ prog: server, dirty: false })
  })
  test('serveur en avance (autre appareil) : adopté sans renvoi', () => {
    const older: Progress = { cards: { a: [0, T, 0, 0, T] }, sessions: [], xp: 0 }
    expect(reconcileOnLoad(server, older)).toEqual({ prog: server, dirty: false })
  })
})

describe('saveArgs', () => {
  test('forme de la RPC save_progress, séances bornées', () => {
    const sessions = Array.from({ length: KEPT_SESSIONS + 3 }, (_, i) => s(T + i))
    const args = saveArgs({ cards: { a: [1, T, 1, 1, T] }, sessions, xp: 40 })
    expect(Object.keys(args).sort()).toEqual(['p_cards', 'p_sessions', 'p_xp'])
    expect(args.p_sessions).toHaveLength(KEPT_SESSIONS)
    expect(args.p_sessions[0].d).toBe(T + 3)
    expect(args.p_xp).toBe(40)
  })
})

describe('fromSaveResult', () => {
  const row = { cards: { a: [1, T, 1, 1, T] }, sessions: [s(T)], xp: 10, updated_at: '2026-10-12T00:00:00Z' }
  test('accepte un tableau de lignes (returns table) ou une ligne', () => {
    expect(fromSaveResult([row])).toEqual({ cards: row.cards, sessions: row.sessions, xp: 10 })
    expect(fromSaveResult(row)?.xp).toBe(10)
  })
  test('réponse vide ou inattendue : null', () => {
    for (const bad of [null, undefined, [], 'x', [null]]) expect(fromSaveResult(bad)).toBeNull()
  })
  test('ne lève pas sur une réponse partielle', () => {
    const spy = vi.fn(() => fromSaveResult([{ xp: 3 }]))
    expect(spy()).toEqual({ cards: {}, sessions: [], xp: 3 })
  })
})

describe('déconnexion : effacement de la copie locale', () => {
  test('effacée seulement si rien n’est en attente ni en cours', () => {
    expect(canClearLocal({ dirty: false, saving: false, again: false })).toBe(true)
    expect(canClearLocal({ dirty: true, saving: false, again: false })).toBe(false)
    expect(canClearLocal({ dirty: false, saving: true, again: false })).toBe(false)
    expect(canClearLocal({ dirty: false, saving: false, again: true })).toBe(false)
  })
  test('clearLocalProgress retire la clé de l’utilisateur, sans lever si le stockage est bloqué', () => {
    const st = { ...memoryStore({ 'xxb.progress.v1.u1': '{}', 'xxb.progress.v1.u2': '{}' }), removeItem: vi.fn() }
    clearLocalProgress(st, 'u1')
    expect(st.removeItem).toHaveBeenCalledWith('xxb.progress.v1.u1')
    expect(() => clearLocalProgress({ removeItem: () => { throw new Error('bloqué') } }, 'u1')).not.toThrow()
    expect(() => clearLocalProgress(null, 'u1')).not.toThrow()
  })
})

describe('saveErrorKind', () => {
  test('refus définitifs (validation 22023, contrainte 23514) : pas de nouvel essai automatique', () => {
    expect(saveErrorKind({ code: '22023' })).toBe('rejected')
    expect(saveErrorKind({ code: '23514' })).toBe('rejected')
    expect(saveErrorKind({ code: '22P02' })).toBe('rejected')
  })
  test('réseau, expiration ou autre : nouvel essai', () => {
    expect(saveErrorKind({ code: '' })).toBe('retry')
    expect(saveErrorKind({ message: 'Failed to fetch' })).toBe('retry')
    expect(saveErrorKind(null)).toBe('retry')
  })
})

describe('isAccountSwitch (L1-5)', () => {
  test('vrai seulement si un autre compte était chargé', () => {
    expect(isAccountSwitch('a', 'b')).toBe(true)
    expect(isAccountSwitch('a', 'a')).toBe(false)
    expect(isAccountSwitch(null, 'b')).toBe(false)
  })
})
