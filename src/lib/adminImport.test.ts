import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { CardInsert } from './cardImport'

/** Accès base de l'import (adminApi) : pagination au-delà de max_rows et contrôle du nombre de lignes créées. */
const state = vi.hoisted(() => ({
  pages: [] as Array<{ data: unknown[] | null; error: { message: string; code?: string } | null }>,
  insertResult: { data: [] as unknown[] | null, error: null as { message: string; code?: string } | null },
  ranges: [] as Array<[number, number]>,
  zones: [] as unknown[],
  inserted: [] as unknown[],
  reads: [] as Array<[string, string]>,
}))

vi.mock('./supabase', () => {
  const chain = (table: string) => {
    let page = 0
    const c: Record<string, unknown> = {}
    c.select = (cols: string) => { state.reads.push([table, cols]); return c }
    c.order = () => c
    c.in = (_: string, z: unknown[]) => { state.zones.push(z); return c }
    c.range = (from: number, to: number) => { state.ranges.push([from, to]); page = from / 1000; return Promise.resolve(state.pages[page]) }
    c.insert = (rows: unknown[]) => {
      state.inserted.push(rows)
      return { select: () => Promise.resolve(state.insertResult) }
    }
    return c
  }
  return { supabase: { from: (table: string) => chain(table) } }
})
vi.mock('./pdf', () => ({ openPdf: vi.fn() }))

const { UNCERTAIN_IMPORT, UncertainWriteError, insertImportedCards, listCardsForImport, listDocumentsForImport } = await import('./adminApi')

const card = (i: number) => ({ id: `t1-${String(i).padStart(6, '0')}`, zone: 1, q: `Q${i}`, position: i })
const insert = (n: number): CardInsert[] => Array.from({ length: n }, (_, i) => ({ ...card(i), a: 'A', src: '', note: '', qcm: null, status: 'draft', document_id: null }))

beforeEach(() => {
  state.pages = []
  state.insertResult = { data: [], error: null }
  state.ranges = []
  state.zones = []
  state.inserted = []
  state.reads = []
})

describe('listCardsForImport', () => {
  test('aucune zone : aucune requête', async () => {
    await expect(listCardsForImport([])).resolves.toEqual([])
    expect(state.ranges).toEqual([])
  })
  test('pagine tant que la page est pleine (max_rows = 1000)', async () => {
    state.pages = [
      { data: Array.from({ length: 1000 }, (_, i) => card(i)), error: null },
      { data: [card(1000), card(1001)], error: null },
    ]
    const rows = await listCardsForImport([1, 3])
    expect(rows).toHaveLength(1002)
    expect(state.ranges).toEqual([[0, 999], [1000, 1999]])
    expect(state.zones[0]).toEqual([1, 3])
  })
  test('erreur de lecture : message lisible', async () => {
    state.pages = [{ data: null, error: { message: 'permission denied for table cards', code: '42501' } }]
    await expect(listCardsForImport([1])).rejects.toThrow(/pas administrateur/)
  })
})

describe('listDocumentsForImport (E4)', () => {
  test('lit id, zone, titre et nom de fichier des documents des zones citées', async () => {
    const doc = { id: 7, zone: 3, title: 'Méthode', file_name: 'methode.pdf' }
    state.pages = [{ data: [doc], error: null }]
    await expect(listDocumentsForImport([3])).resolves.toEqual([doc])
    expect(state.reads).toEqual([['documents', 'id, zone, title, file_name']])
    expect(state.zones[0]).toEqual([3])
  })
  test('aucune zone : aucune requête', async () => {
    await expect(listDocumentsForImport([])).resolves.toEqual([])
    expect(state.reads).toEqual([])
  })
})

describe('insertImportedCards', () => {
  test('succès quand la base confirme toutes les lignes', async () => {
    state.insertResult = { data: [{ id: 'a' }, { id: 'b' }], error: null }
    await expect(insertImportedCards(insert(2))).resolves.toBe(2)
    expect(state.inserted).toHaveLength(1)
  })
  test('0 ligne confirmée : résultat incertain, pas de faux succès', async () => {
    await expect(insertImportedCards(insert(2))).rejects.toThrow(UncertainWriteError)
  })
  test('nombre de lignes confirmé différent : résultat incertain', async () => {
    state.insertResult = { data: [{ id: 'a' }], error: null }
    await expect(insertImportedCards(insert(2))).rejects.toThrow(/1 question\(s\) sur 2\. Résultat incertain/)
  })
  test('IM-4 : erreur sans code (réseau, délai 15 s) : résultat incertain, jamais « rien importé »', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    state.insertResult = { data: null, error: { message: 'AbortError: Délai dépassé', code: '' } }
    const err = await insertImportedCards(insert(1)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UncertainWriteError)
    expect((err as Error).message).toBe(UNCERTAIN_IMPORT)
  })
  test('refus certain (code renvoyé par la base) : erreur ordinaire', async () => {
    state.insertResult = { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } }
    const err = await insertImportedCards(insert(1)).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(UncertainWriteError)
    expect((err as Error).message).toMatch(/pas administrateur/)
  })
  test('erreur de contrainte : message lisible', async () => {
    state.insertResult = { data: null, error: { message: 'duplicate key', code: '23505' } }
    await expect(insertImportedCards(insert(1))).rejects.toThrow('Cet élément existe déjà.')
  })
  test('lot vide refusé sans requête', async () => {
    await expect(insertImportedCards([])).rejects.toThrow(/Aucune question/)
    expect(state.inserted).toHaveLength(0)
  })
})
