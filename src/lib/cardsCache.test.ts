import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { cardsCacheKey, clearCardsCache, parseCardsCache, readCardsCache, serializeCardsCache, writeCardsCache, type CardsStore } from './cardsCache'
import { validCards } from './srs'
import type { Card, Fiche, Plan, RevisionContent } from './types'

/** Stockage en mémoire, avec un quota en caractères comme localStorage (5 Mi caractères UTF-16 dans Chrome). */
function memoryStore(quotaChars = Infinity): CardsStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  const used = (): number => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0)
  return {
    data,
    get length() { return data.size },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => {
      const before = data.get(k)
      if (used() - (before ? k.length + before.length : 0) + k.length + v.length > quotaChars) throw new DOMException('quota', 'QuotaExceededError')
      data.set(k, v)
    },
    removeItem: k => { data.delete(k) },
  }
}

const A = 'user-a'
const B = 'user-b'
const card = (id: string, th: number, doc?: number): Card => ({ id, q: `Q ${id}`, a: `R ${id}`, src: '', note: '', th, ...(doc ? { doc } : {}) })
const CONTENT: RevisionContent = {
  plan: { months: [{ n: 1, o: 'Octobre' }], cadence: ['Semaine 1'] },
  fiches: { 1: { titre: 'Fondateur', sections: [{ h: 'Vie', items: ['Né en 1857'], src: 'fiche.pdf' }], vigilance: ['Dates'] } },
  cards: { 1: [card('t1-01', 1, 7), card('t1-02', 1)], 2: [card('t2-01', 2)] },
}

describe('copie des cartes (F1) : lecture validée', () => {
  test('aller-retour : le contenu relu est celui écrit', () => {
    const store = memoryStore()
    expect(writeCardsCache(store, A, CONTENT, 1)).toBe(true)
    expect(readCardsCache(store, A)).toEqual(CONTENT)
  })

  test('jamais lue pour un autre compte, même si on la copie sous sa clé', () => {
    const store = memoryStore()
    writeCardsCache(store, A, CONTENT)
    store.setItem(cardsCacheKey(B), store.getItem(cardsCacheKey(A))!)
    expect(readCardsCache(store, B)).toBeNull()
  })

  test('autre version, JSON illisible, forme fausse : ignorée', () => {
    const raw = JSON.parse(serializeCardsCache(A, CONTENT, 1)) as Record<string, unknown>
    expect(parseCardsCache({ ...raw, v: 2 }, A)).toBeNull()
    expect(parseCardsCache({ ...raw, cards: [] }, A)).toBeNull()
    expect(parseCardsCache({ ...raw, fiches: 'x' }, A)).toBeNull()
    expect(parseCardsCache({ ...raw, plan: 'x' }, A)).toBeNull()
    expect(parseCardsCache(null, A)).toBeNull()
    const store = memoryStore()
    store.setItem(cardsCacheKey(A), '{pas du json')
    expect(readCardsCache(store, A)).toBeNull()
    expect(readCardsCache(null, A)).toBeNull()
  })

  test('cartes invalides et zones hors 1 à 12 retirées, zone de la carte reprise de sa clé', () => {
    const raw = JSON.parse(serializeCardsCache(A, CONTENT, 1)) as { cards: Record<string, unknown[]> }
    const parsed = parseCardsCache({ ...raw, cards: { 1: [...raw.cards[1], { id: 3 }, null], 13: [card('x', 13)], 0: [card('y', 0)], 2: 'x' } }, A)
    expect(parsed?.cards).toEqual({ 1: CONTENT.cards[1] })
  })

  test('fiche dont les listes ne sont pas des listes : retirée, jamais rendue telle quelle', () => {
    const raw = JSON.parse(serializeCardsCache(A, CONTENT, 1)) as Record<string, unknown>
    const fiches = { 1: CONTENT.fiches[1], 2: 'x', 3: { sections: 'x' }, 4: { sections: [{ items: 'x' }] }, 5: { vigilance: {} }, 6: { sections: ['x'] } }
    expect(parseCardsCache({ ...raw, fiches }, A)?.fiches).toEqual({ 1: CONTENT.fiches[1] })
  })

  test('plan nul accepté (révision « à paraître »)', () => {
    const store = memoryStore()
    writeCardsCache(store, A, { ...CONTENT, plan: null })
    expect(readCardsCache(store, A)?.plan).toBeNull()
  })
})

describe('copie des cartes (F1) : écriture', () => {
  test('une seule copie par appareil : celle d’un autre compte est retirée', () => {
    const store = memoryStore()
    writeCardsCache(store, A, CONTENT)
    store.setItem('xxb.progress.v1.user-a', '{}')
    writeCardsCache(store, B, CONTENT)
    expect(store.getItem(cardsCacheKey(A))).toBeNull()
    expect(readCardsCache(store, B)).toEqual(CONTENT)
    // La progression locale d'un compte n'est jamais touchée.
    expect(store.getItem('xxb.progress.v1.user-a')).toBe('{}')
  })

  test('stockage plein : faux, la copie précédente du compte reste lisible', () => {
    const store = memoryStore(serializeCardsCache(A, CONTENT, 1).length + 40)
    expect(writeCardsCache(store, A, CONTENT, 1)).toBe(true)
    const bigger: RevisionContent = { ...CONTENT, cards: { ...CONTENT.cards, 3: Array.from({ length: 20 }, (_, i) => card(`t3-${i}`, 3)) } }
    expect(writeCardsCache(store, A, bigger, 2)).toBe(false)
    expect(readCardsCache(store, A)).toEqual(CONTENT)
    expect(writeCardsCache(null, A, CONTENT)).toBe(false)
  })

  test('effacement', () => {
    const store = memoryStore()
    writeCardsCache(store, A, CONTENT)
    clearCardsCache(store, A)
    expect(readCardsCache(store, A)).toBeNull()
  })
})

/** Contenu réel du dépôt (supabase/content : 665 cartes, 11 fiches, plan), chaque carte reliée à un document. */
function repoContent(): { content: RevisionContent; count: number } {
  const dir = fileURLToPath(new URL('../../supabase/content/', import.meta.url))
  return readdirSync(dir).reduce<{ content: RevisionContent; count: number }>((acc, f) => {
    const json = /\$xxb\$([\s\S]*)\$xxb\$/.exec(readFileSync(dir + f, 'utf8'))?.[1]
    if (!json) return acc
    const data = JSON.parse(json) as Fiche & Plan & { cards?: unknown[] }
    const zone = Number(/(?:cards|fiche)-(\d+)/.exec(f)?.[1])
    if (f.includes('cards-')) {
      const cards = validCards((data.cards || []).map(c => ({ ...(c as object), doc: 120 })), zone)
      return { count: acc.count + cards.length, content: { ...acc.content, cards: { ...acc.content.cards, [zone]: cards } } }
    }
    if (f.includes('fiche-')) return { ...acc, content: { ...acc.content, fiches: { ...acc.content.fiches, [zone]: data } } }
    return { ...acc, content: { ...acc.content, plan: data } }
  }, { content: { plan: null, fiches: {}, cards: {} }, count: 0 })
}

describe('copie des cartes (F1) : taille', () => {
  test('665 cartes, fiches et plan : environ 450 000 caractères, moins de 10 % du quota de localStorage', () => {
    const { content, count } = repoContent()
    const text = serializeCardsCache('0b1e7a9c-1111-2222-3333-444455556666', content, Date.now())
    expect(count).toBe(665)
    expect(text.length).toBeGreaterThan(400_000)
    expect(text.length).toBeLessThan(500_000)
    const store = memoryStore(5 * 1024 * 1024)
    expect(writeCardsCache(store, A, content)).toBe(true)
    expect(readCardsCache(store, A)?.cards[1]).toHaveLength(content.cards[1].length)
  })
})
