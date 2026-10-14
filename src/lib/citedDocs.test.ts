import { describe, expect, test } from 'vitest'
import { citedDocs } from './citedDocs'
import type { Card, Doc } from './types'

const doc = (id: number, title: string): Doc => ({
  id, th: 1, title, folder: 'F', ty: 'PDF', ess: false, scan: false, pages: 1, size: 1, fileName: `${id}.pdf`,
  storagePath: `${id}.pdf`, file: `f/${id}.pdf`, download: `f/${id}.pdf`, cote: `C-${id}`, key: `${id}`,
})
const card = (id: string, d?: number): Card => ({ id, q: 'q', a: 'a', src: '', note: '', th: 1, ...(d ? { doc: d } : {}) })
const CATALOG = [doc(1, 'Statuts'), doc(2, 'éclaireurs'), doc(3, 'Baden-Powell'), doc(4, 'Écusson')]
const byId = (id: number): Doc | null => CATALOG.find(d => d.id === id) ?? null

describe('documents cités par les cartes de la zone (F2)', () => {
  test('sans doublon, triés par titre en français (accents et casse ignorés)', () => {
    const cards = [card('a', 1), card('b', 2), card('c', 1), card('d'), card('e', 3), card('f', 4)]
    expect(citedDocs(cards, byId).map(d => d.title)).toEqual(['Baden-Powell', 'éclaireurs', 'Écusson', 'Statuts'])
  })

  test('document absent du catalogue ignoré ; aucune carte reliée : liste vide', () => {
    expect(citedDocs([card('a', 99), card('b', 1)], byId).map(d => d.id)).toEqual([1])
    expect(citedDocs([card('a'), card('b')], byId)).toEqual([])
    expect(citedDocs([], byId)).toEqual([])
  })
})
