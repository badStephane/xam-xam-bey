import { describe, expect, test } from 'vitest'
import { analyzeImport, planInserts, type ImportField, type SheetRow } from './cardImport'
import { buildDocIndex, docKey, docLinkText, docSummaryText, linkDocument, summarizeDocs, type ImportDocument } from './cardImportDocs'
import { commitImport, previewImport, type ImportDeps } from './cardImportFlow'

/** E4 (docs/squad/11-lot3.md) : question importée reliée au document de sa zone désigné par la colonne Source. */
const DOCS: ImportDocument[] = [
  { id: 1, zone: 1, title: 'Bases du scoutisme', file_name: 'Bases du scoutisme.pdf' },
  { id: 4, zone: 1, title: 'la devise, l esprit et les élements fondamentaux du scoutismes', file_name: 'la devise, l_esprit et les élements fondamentaux du scoutismes.docx' },
  { id: 5, zone: 1, title: 'Les-7-éléments-de-la-méthode-scoute-version-courte', file_name: 'Les-7-éléments-de-la-méthode-scoute-version-courte.pdf' },
  { id: 20, zone: 2, title: 'Bases du scoutisme', file_name: 'bases-z2.pdf' },
  { id: 30, zone: 3, title: 'Rituel', file_name: 'rituel-a.pdf' },
  { id: 31, zone: 3, title: 'Rituel', file_name: 'rituel-b.pdf' },
  { id: 32, zone: 3, title: 'Carnet', file_name: 'Veillée.pdf' },
  { id: 33, zone: 3, title: 'veillee', file_name: 'autre.pdf' },
]
const index = buildDocIndex(DOCS)

describe('docKey : casse, accents, espaces, extension', () => {
  test.each([
    ['  Bases   DU Scoutisme.PDF ', 'bases du scoutisme'],
    ['Méthode', 'methode'],
    ['l’esprit_et-la', 'l esprit et la'],
    ['fichier.docx', 'fichier'],
    ['rapport.pdf.pdf', 'rapport.pdf'],
    ['   ', ''],
  ])('%s → %s', (raw, key) => expect(docKey(raw)).toBe(key))
})

describe('linkDocument', () => {
  test('titre ou nom de fichier de la même zone, sans casse ni accents ni extension', () => {
    expect(linkDocument('bases du scoutisme', 1, index)).toEqual({ kind: 'linked', id: 1, title: 'Bases du scoutisme' })
    expect(linkDocument('BASES DU SCOUTISME.pdf', 1, index)).toMatchObject({ kind: 'linked', id: 1 })
    expect(linkDocument("La devise, l'esprit et les éléments fondamentaux du scoutismes", 1, index)).toMatchObject({ kind: 'linked', id: 4 })
    expect(linkDocument('les 7 elements de la methode scoute version courte', 1, index)).toMatchObject({ kind: 'linked', id: 5 })
    expect(linkDocument('bases-z2', 2, index)).toMatchObject({ kind: 'linked', id: 20 })
  })
  test('même titre dans une autre zone : seul le document de la zone de la ligne compte', () => {
    expect(linkDocument('Bases du scoutisme', 2, index)).toMatchObject({ kind: 'linked', id: 20 })
    expect(linkDocument('Bases du scoutisme', 4, index)).toEqual({ kind: 'unknown' })
  })
  test('plusieurs documents correspondent : rien n’est relié', () => {
    expect(linkDocument('rituel', 3, index)).toEqual({ kind: 'ambiguous', titles: ['Rituel', 'Rituel'] })
    // titre d'un document = nom de fichier d'un autre
    expect(linkDocument('Veillée', 3, index)).toEqual({ kind: 'ambiguous', titles: ['Carnet', 'veillee'] })
  })
  test('un document dont titre et fichier correspondent ne compte qu’une fois', () => {
    expect(linkDocument('Bases du scoutisme.pdf', 1, index)).toMatchObject({ kind: 'linked', id: 1 })
  })
  test('source vide ou sans correspondance', () => {
    expect(linkDocument('', 1, index)).toEqual({ kind: 'none' })
    expect(linkDocument('  ', 1, index)).toEqual({ kind: 'none' })
    expect(linkDocument('Bases du scoutisme, p. 12', 1, index)).toEqual({ kind: 'unknown' })
  })
  test('document au titre vide (défensif) : ignoré', () => {
    expect(buildDocIndex([{ id: 9, zone: 1, title: ' ', file_name: '.pdf' }]).size).toBe(0)
  })
})

describe('analyse, insertion et résumé', () => {
  const blank: Record<ImportField, string> = { zone: '', q: '', a: '', ok: '', no1: '', no2: '', no3: '', src: '', note: '' }
  const row = (line: number, zone: string, src: string): SheetRow => ({ line, values: { ...blank, zone, q: `Q${line}`, a: 'A', src } })
  const rows = [row(2, '1', 'bases du scoutisme.pdf'), row(3, '3', 'Rituel'), row(4, '1', 'Inconnu'), row(5, '2', '')]

  test('document_id rempli seulement pour une correspondance unique ; source affichée inchangée', () => {
    const { cards } = analyzeImport(rows, [], DOCS)
    const ins = planInserts(cards, [])
    expect(ins.map(r => [r.zone, r.document_id, r.src])).toEqual([[1, 1, 'bases du scoutisme.pdf'], [3, null, 'Rituel'], [1, null, 'Inconnu'], [2, null, '']])
    expect(summarizeDocs(cards.map(c => c.doc))).toEqual({ linked: 1, ambiguous: 1, unknown: 1, none: 1 })
  })
  test('sans documents fournis : rien n’est relié, aucune erreur', () => {
    const a = analyzeImport(rows, [])
    expect(a.errors).toEqual([])
    expect(planInserts(a.cards, []).every(r => r.document_id === null)).toBe(true)
  })
})

describe('flux : documents lus en base à l’aperçu et relus avant l’écriture', () => {
  const sheet = [['Zone', 'Question', 'Réponse', 'Source'], [1, 'Q', 'A', 'Bases du scoutisme']]
  const file = () => new File([new Uint8Array([1])], 'q.xlsx')
  const deps = (docLists: ImportDocument[][]) => {
    let calls = 0
    const inserted: unknown[] = []
    const d: ImportDeps = {
      readSheet: async () => sheet,
      listExisting: async () => [],
      listDocuments: async zones => { calls += 1; expect(zones).toEqual([1]); return docLists[Math.min(calls - 1, docLists.length - 1)] },
      insert: async r => { inserted.push(...r); return r.length },
    }
    return { d, inserted }
  }

  test('aperçu relié, puis insertion avec document_id', async () => {
    const { d, inserted } = deps([DOCS])
    const p = await previewImport(file(), d)
    expect(p.analysis.cards[0].doc).toMatchObject({ kind: 'linked', id: 1 })
    expect((await commitImport(p, d)).kind).toBe('done')
    expect(inserted).toMatchObject([{ document_id: 1 }])
  })
  test('document supprimé entre l’aperçu et l’import : nouvel aperçu, rien n’est inséré', async () => {
    const { d, inserted } = deps([DOCS, DOCS.filter(x => x.id !== 1)])
    const p = await previewImport(file(), d)
    const out = await commitImport(p, d)
    expect(inserted).toEqual([])
    expect(out.kind === 'changed' && out.preview.analysis.cards[0].doc).toEqual({ kind: 'unknown' })
  })
})

describe('textes de l’aperçu', () => {
  test('résumé : catégories vides omises, pluriels', () => {
    expect(docSummaryText({ linked: 2, unknown: 1, ambiguous: 0, none: 0 })).toBe('Documents : 2 questions reliées à leur document, 1 source sans document correspondant.')
    expect(docSummaryText({ linked: 0, unknown: 0, ambiguous: 1, none: 3 })).toBe('Documents : 1 source ambiguë (plusieurs documents), 3 lignes sans source.')
    expect(docSummaryText({ linked: 0, unknown: 0, ambiguous: 0, none: 0 })).toBe('')
  })
  test('détail d’une ligne', () => {
    expect(docLinkText({ kind: 'linked', id: 1, title: 'Bases' }, 'bases.pdf')).toBe('reliée à « Bases »')
    expect(docLinkText({ kind: 'ambiguous', titles: ['A', 'B'] }, 'x')).toMatch(/^non reliée : « x » désigne 2 documents de la zone \(« A », « B »\)/)
    expect(docLinkText({ kind: 'unknown' }, 'x')).toMatch(/^non reliée : aucun document de la zone ne s’appelle « x »/)
    expect(docLinkText({ kind: 'none' }, '')).toBe('sans source')
  })
})
