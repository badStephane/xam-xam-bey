import { describe, expect, test } from 'vitest'
import { buildDocs, catalogStats, docsFromRows, isFiltering, matchDoc, rowsFromCatalog, zoneCounts } from './catalog'
import { cleanTitle, currentZone, keyPoints, mdSpans, plural, shuffle } from './format'
import type { RawDoc } from './types'

const raw: RawDoc[] = [
  { t: 'Bases du scoutisme', p: 'Bases Générales', e: 'pdf', s: 874662, g: 41, x: 0, th: 1, d: 0, es: 1, f: '1.pdf' },
  { t: 'fiches-BP', p: 'Bases Générales', e: 'docx', s: 1000, th: 1, es: 0, f: '2.pdf' },
  { t: 'Bases du scoutisme', p: 'Copie', e: 'pdf', s: 874662, th: 1, d: 1, f: '1.pdf' },
  { t: 'Statuts SGDS', p: 'Règlements', e: 'pdf', s: 5000, th: 4, es: 1, x: 1, f: '4.pdf' },
]
const docs = buildDocs(raw)
const none = { q: '', type: 'all' as const, ess: false, month: null }

describe('buildDocs', () => {
  test('retire les doublons et numérote les cotes par zone', () => {
    expect(docs.map(d => d.cote)).toEqual(['Z1·001', 'Z1·002', 'Z4·001'])
    expect(docs[1]).toMatchObject({ title: 'Fiches BP', ty: 'DOC', ess: false, pages: null, file: 'f/2.pdf' })
    expect(docs[2].scan).toBe(true)
  })
})

describe('filtres', () => {
  test('recherche sans accents, sur plusieurs mots et sur la cote', () => {
    expect(docs.filter(d => matchDoc(d, { ...none, q: 'generales bases' })).length).toBe(2)
    expect(docs.filter(d => matchDoc(d, { ...none, q: 'z4·001' })).map(d => d.id)).toEqual([4])
  })
  test('type, essentiels et zone', () => {
    expect(docs.filter(d => matchDoc(d, { ...none, type: 'DOC' })).length).toBe(1)
    expect(docs.filter(d => matchDoc(d, { ...none, ess: true })).length).toBe(2)
    expect(docs.filter(d => matchDoc(d, { ...none, month: 4 })).length).toBe(1)
    expect(matchDoc(docs[2], { ...none, month: 1 }, true)).toBe(true)
  })
  test('zoneCounts ignore le filtre de zone', () => {
    expect(zoneCounts(docs, { ...none, month: 4 })).toEqual({ 1: 2, 4: 1 })
  })
  test('isFiltering', () => {
    expect(isFiltering(none)).toBe(false)
    expect(isFiltering({ ...none, q: '  ' })).toBe(false)
    expect(isFiltering({ ...none, month: 2 })).toBe(true)
  })
})

describe('format', () => {
  test('cleanTitle', () => {
    expect(cleanTitle('le-livre_de')).toBe('Le livre de')
    expect(cleanTitle('Scouting for boys (z-lib.org)')).toBe('Scouting for boys')
    expect(cleanTitle('Manuel du CP(1)')).toBe('Manuel du CP')
  })
  test('currentZone borne le plan à octobre 2026 – septembre 2027', () => {
    expect(currentZone(new Date(2026, 9, 12))).toBe(1)
    expect(currentZone(new Date(2027, 2, 1))).toBe(6)
    expect(currentZone(new Date(2025, 0, 1))).toBe(1)
    expect(currentZone(new Date(2030, 0, 1))).toBe(12)
  })
  test('mdSpans découpe gras et italique', () => {
    expect(mdSpans('Le **22 février**, *Londres*.')).toEqual([
      { t: 'Le ', bold: false, italic: false }, { t: '22 février', bold: true, italic: false },
      { t: ', ', bold: false, italic: false }, { t: 'Londres', bold: false, italic: true }, { t: '.', bold: false, italic: false }])
  })
  test('keyPoints privilégie le gras, sinon les propositions', () => {
    expect(keyPoints('**A** et **B** puis **C**')).toEqual(['A', 'B', 'C'])
    expect(keyPoints('Une. Deux; Trois')).toEqual(['Une', 'Deux', 'Trois'])
  })
  test('plural et shuffle', () => {
    expect(plural(1, 'pièce', 'pièces')).toBe('1 pièce')
    expect(plural(2, 'pièce', 'pièces')).toBe('2 pièces')
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1])
  })
})

describe('catalogue depuis la base', () => {
  const urls = { file: (p: string) => `https://x/${p}`, download: (p: string, n: string) => `https://x/${p}?download=${n}` }
  const rows = rowsFromCatalog(raw)
  test('rowsFromCatalog retire les doublons et garde nom de fichier et chemin', () => {
    expect(rows.map(r => r.id)).toEqual([1, 2, 4])
    expect(rows[0]).toMatchObject({ zone: 1, file_name: 'Bases du scoutisme.pdf', storage_path: '1.pdf', essential: true })
  })
  test('docsFromRows trie par zone, numérote les cotes et construit les adresses', () => {
    const docs = docsFromRows([...rows].reverse(), urls)
    expect(docs.map(d => d.cote)).toEqual(['Z1·001', 'Z1·002', 'Z4·001'])
    expect(docs[0].file).toBe('https://x/1.pdf')
    expect(docs[0].download).toBe('https://x/1.pdf?download=Bases du scoutisme.pdf')
  })
  test('catalogStats', () => {
    expect(catalogStats(docsFromRows(rows, urls))).toEqual({ count: 3, ess: 2, mo: 1 })
  })
})
