import { describe, expect, test } from 'vitest'
import { advance, mkSession, scoreCurrent } from './session'
import { clearSessionSnapshot, fromSnapshot, hasAnySessionSnapshot, readSessionSnapshot, saveSessionSnapshot, sessionKey, toSnapshot } from './sessionStore'
import type { Card, Session } from './types'

const cards: Card[] = ['a', 'b', 'c'].map(id => ({ id, q: 'q ' + id, a: 'a ' + id, src: '', note: '', th: 1 }))
const ch = { options: ['x', 'y', 'z'], correct: 1 }
const DAY = 20_000
const USER = 'user-a'

const qcmSession = (): Session => ({ ...mkSession('self', 'daily', 'Session du jour', cards), queue: cards.map(c => ({ c, second: false, ch })) })

function memoryStore(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get length() { return data.size },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, String(v)) },
    removeItem: k => { data.delete(k) },
    clear: () => data.clear(),
  }
}

const roundTrip = (s: Session, user = USER, today = DAY, list = cards): Session | null =>
  fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s, USER, DAY))), user, today, list)

describe('séance gardée pour l’onglet (E2)', () => {
  test('clé propre au compte', () => {
    expect(sessionKey('u1')).toBe('xxb.session.v1.u1')
  })

  test('une séance relue est identique, cartes reprises du contenu publié', () => {
    const s = { ...qcmSession(), picked: 2 }
    expect(roundTrip(s)).toEqual(s)
  })

  test('correction affichée puis rechargement : la carte reste notée et ne peut pas être renotée (E1 + E2)', () => {
    const scored = scoreCurrent({ ...qcmSession(), rev: true, picked: 0 }, 0)!.session
    const back = roundTrip(scored)!
    expect(back.i).toBe(0)
    expect(back.hist).toEqual([0])
    expect(back.queue).toHaveLength(4)
    expect(scoreCurrent(back, 2)).toBeNull()
    expect(advance(back)!.session.i).toBe(1)
  })

  test('auto-évaluation révélée mais pas encore notée : reprise sur la réponse', () => {
    const self = { ...mkSession('self', 'daily', '', cards), queue: cards.map(c => ({ c, second: false, ch: { options: [], correct: -1 } })), rev: true }
    expect(roundTrip(self)).toEqual(self)
  })

  test('interrogation reprise avec le prénom et les notes', () => {
    const ask = { ...mkSession('ask', 'ask', 'Interrogation', cards, 'Awa'), i: 1, res: { a: 2 as const }, hist: [2 as const] }
    expect(roundTrip(ask)).toEqual(ask)
  })

  test('jamais pour un autre compte', () => {
    expect(roundTrip(qcmSession(), 'user-b')).toBeNull()
  })

  test('jamais un autre jour', () => {
    expect(roundTrip(qcmSession(), USER, DAY + 1)).toBeNull()
  })

  test('ignorée si une carte n’est plus publiée', () => {
    expect(roundTrip(qcmSession(), USER, DAY, cards.slice(0, 2))).toBeNull()
  })

  test.each<[string, (s: Record<string, unknown>) => Record<string, unknown>]>([
    ['version inconnue', s => ({ ...s, v: 2 })],
    ['position hors file', s => ({ ...s, i: 3 })],
    ['notes incohérentes avec la position', s => ({ ...s, hist: [2, 2] })],
    ['carte notée mais non retournée', s => ({ ...s, hist: [2], rev: false })],
    ['note invalide', s => ({ ...s, res: { a: 7 } })],
    ['note d’une carte hors séance', s => ({ ...s, res: { zz: 2 } })],
    ['proposition hors liste', s => ({ ...s, picked: 5 })],
    ['propositions mal formées', s => ({ ...s, queue: [{ id: 'a', second: false, ch: { options: ['x'], correct: 0 } }] })],
    ['« Je réponds » sans propositions', s => ({ ...s, queue: [{ id: 'a', second: false }] })],
    ['XP négative', s => ({ ...s, xp: -10 })],
    ['mode inconnu', s => ({ ...s, mode: 'exam' })],
  ])('rejetée : %s', (_, alter) => {
    const raw = alter(JSON.parse(JSON.stringify(toSnapshot(qcmSession(), USER, DAY))))
    expect(fromSnapshot(raw, USER, DAY, cards)).toBeNull()
  })

  test('rejetée : valeurs qui ne sont pas des objets', () => {
    for (const raw of [null, 'x', 42, []]) expect(fromSnapshot(raw, USER, DAY, cards)).toBeNull()
  })
})

describe('stockage de la séance', () => {
  test('enregistrer puis relire', () => {
    const store = memoryStore()
    saveSessionSnapshot(store, USER, DAY, qcmSession())
    expect(readSessionSnapshot(store, USER, DAY, cards)).toEqual(qcmSession())
  })

  test('une séance terminée efface l’enregistrement', () => {
    const store = memoryStore()
    saveSessionSnapshot(store, USER, DAY, qcmSession())
    saveSessionSnapshot(store, USER, DAY, { ...qcmSession(), done: true })
    expect(store.data.size).toBe(0)
  })

  test('un enregistrement périmé ou illisible est effacé à la lecture', () => {
    const store = memoryStore()
    saveSessionSnapshot(store, USER, DAY, qcmSession())
    expect(readSessionSnapshot(store, USER, DAY + 1, cards)).toBeNull()
    expect(store.data.size).toBe(0)
    store.setItem(sessionKey(USER), '{pas du json')
    expect(readSessionSnapshot(store, USER, DAY, cards)).toBeNull()
    expect(store.data.size).toBe(0)
  })

  test('l’enregistrement d’un autre compte n’est ni lu ni effacé', () => {
    const store = memoryStore()
    saveSessionSnapshot(store, 'user-b', DAY, qcmSession())
    expect(readSessionSnapshot(store, USER, DAY, cards)).toBeNull()
    expect(store.data.has(sessionKey('user-b'))).toBe(true)
  })

  test('stockage absent ou bloqué : aucune erreur', () => {
    const broken = { getItem: () => { throw new Error('bloqué') }, setItem: () => { throw new Error('plein') }, removeItem: () => { throw new Error('bloqué') } }
    expect(() => saveSessionSnapshot(broken, USER, DAY, qcmSession())).not.toThrow()
    expect(readSessionSnapshot(broken, USER, DAY, cards)).toBeNull()
    expect(() => clearSessionSnapshot(broken, USER)).not.toThrow()
    expect(readSessionSnapshot(null, USER, DAY, cards)).toBeNull()
  })
})

describe('document relié, après rechargement', () => {
  test('la carte relue reprend son document dans le contenu publié du moment', () => {
    const withDoc = cards.map(c => (c.id === 'a' ? { ...c, doc: 12 } : c))
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(qcmSession(), USER, DAY))), USER, DAY, withDoc)!
    expect(back.queue[0].c.doc).toBe(12)
    expect(back.queue[1].c.doc).toBeUndefined()
  })
})

describe('hasAnySessionSnapshot', () => {
  test('repère une séance gardée, quel que soit le compte', () => {
    const store = memoryStore()
    expect(hasAnySessionSnapshot(store)).toBe(false)
    store.setItem('xxb.theme.v1', '"dark"')
    expect(hasAnySessionSnapshot(store)).toBe(false)
    saveSessionSnapshot(store, 'user-b', DAY, qcmSession())
    expect(hasAnySessionSnapshot(store)).toBe(true)
    expect(hasAnySessionSnapshot(null)).toBe(false)
  })
})
