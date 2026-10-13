import { describe, expect, test } from 'vitest'
import { docsFromRows, LOCAL_URLS } from './catalog'
import { isDocumentRow, parseRows, parseSeen, parseTheme, purgeableKeys } from './cache'
import { BUNDLED_ROWS } from './docs'

const row = { id: 1, zone: 3, title: 'Statuts', folder: 'Règlements', file_name: 'statuts.pdf', storage_path: 'z3/statuts.pdf', size: 1000, pages: 4, essential: true, scan: false }

describe('parseRows (catalogue en cache ou reçu)', () => {
  test('accepte une liste de lignes valides', () => {
    expect(parseRows([row, { ...row, id: 2, pages: null }])).toHaveLength(2)
  })

  test('refuse la liste entière si une ligne est invalide (repli sur le catalogue intégré)', () => {
    expect(parseRows([row, { ...row, title: undefined }])).toBeNull()
    expect(parseRows([row, { ...row, zone: 13 }])).toBeNull()
    expect(parseRows([row, { ...row, storage_path: '' }])).toBeNull()
    expect(parseRows([row, { ...row, essential: 1 }])).toBeNull()
  })

  test('refuse ce qui n’est pas une liste non vide', () => {
    for (const v of [null, undefined, {}, 'x', [], 42]) expect(parseRows(v)).toBeNull()
  })

  test('le catalogue intégré (repli) passe la validation', () => {
    expect(parseRows(BUNDLED_ROWS)).not.toBeNull()
  })

  test('une ligne acceptée ne fait jamais planter docsFromRows', () => {
    expect(isDocumentRow(row)).toBe(true)
    expect(() => docsFromRows(parseRows([row]) ?? [], LOCAL_URLS)).not.toThrow()
  })
})

describe('parseSeen et parseTheme', () => {
  test('pièces consultées : entiers positifs, doublons retirés', () => {
    expect(parseSeen([3, 1, 3])).toEqual([3, 1])
    expect(parseSeen([])).toEqual([])
    expect(parseSeen(['1'])).toBeNull()
    expect(parseSeen([1.5])).toBeNull()
    expect(parseSeen({ length: 1 })).toBeNull()
  })

  test('thème : dark ou light seulement', () => {
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('blue')).toBeNull()
  })
})

describe('purgeableKeys', () => {
  test('efface les caches du site, garde la progression et les clés étrangères', () => {
    const keys = ['xxb.catalog.v1', 'xxb.seen', 'xxb.progress.v1.u1', 'sb-abc-auth-token', 'autre']
    expect(purgeableKeys(keys)).toEqual(['xxb.catalog.v1', 'xxb.seen'])
  })
})
