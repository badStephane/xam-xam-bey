import { describe, expect, test, vi } from 'vitest'
import type { CardInsert, ExistingCard } from './cardImport'
import { commitImport, previewImport, type ImportDeps } from './cardImportFlow'

const HEADER = ['Zone', 'Question', 'Réponse']
const SHEET = [HEADER, [1, 'Q1', 'A'], [2, 'Q2', 'A'], [2, 'Déjà là', 'A']]
const xlsx = (name = 'q.xlsx'): File => new File([new Uint8Array([1])], name)

function deps(existing: ExistingCard[][], sheet: unknown[][] = SHEET) {
  const inserted: CardInsert[][] = []
  const listExisting = vi.fn(async () => existing[Math.min(listExisting.mock.calls.length - 1, existing.length - 1)])
  const d: ImportDeps = {
    readSheet: async () => sheet,
    listExisting,
    insert: async rows => { inserted.push([...rows]); return rows.length },
  }
  return { d, inserted, listExisting }
}
const base: ExistingCard[] = [{ id: 't2-aaaaaa', zone: 2, q: 'déjà là', position: 5 }]

describe('previewImport', () => {
  test('refuse le fichier avant de le lire', async () => {
    const { d } = deps([base])
    const read = vi.spyOn(d, 'readSheet')
    await expect(previewImport(xlsx('a.csv'), d)).rejects.toThrow(/CSV/)
    expect(read).not.toHaveBeenCalled()
  })
  test('en-têtes absents : erreur, aucune lecture en base', async () => {
    const { d, listExisting } = deps([base], [['Titre', 'Texte']])
    await expect(previewImport(xlsx(), d)).rejects.toThrow(/Colonnes obligatoires/)
    expect(listExisting).not.toHaveBeenCalled()
  })
  test('lit seulement les zones citées et analyse', async () => {
    const { d, listExisting } = deps([base])
    const p = await previewImport(xlsx(), d)
    expect(listExisting).toHaveBeenCalledWith([1, 2])
    expect(p.analysis.cards.map(c => c.line)).toEqual([2, 3])
    expect(p.analysis.errors.map(e => e.line)).toEqual([4])
  })
})

describe('commitImport', () => {
  test('insère les brouillons en fin de zone et annonce le résultat', async () => {
    const { d, inserted } = deps([base])
    const p = await previewImport(xlsx(), d)
    const out = await commitImport(p, d, () => 0.5)
    expect(out).toEqual({ kind: 'done', message: '2 questions importées en brouillon dans les zones 01, 02.' })
    expect(inserted[0].map(r => [r.zone, r.position, r.status])).toEqual([[1, 1, 'draft'], [2, 6, 'draft']])
  })
  test('la base a changé depuis l’aperçu : rien n’est inséré, nouvel aperçu', async () => {
    const later = [...base, { id: 't1-bbbbbb', zone: 1, q: 'Q1', position: 1 }]
    const { d, inserted } = deps([base, later])
    const p = await previewImport(xlsx(), d)
    const out = await commitImport(p, d)
    expect(inserted).toHaveLength(0)
    expect(out.kind).toBe('changed')
    if (out.kind === 'changed') expect(out.preview.analysis.cards.map(c => c.line)).toEqual([3])
  })
  test('positions recalculées sur la base relue', async () => {
    const later = [{ ...base[0], position: 40 }]
    const { d, inserted } = deps([base, later])
    await commitImport(await previewImport(xlsx(), d), d)
    expect(inserted[0].find(r => r.zone === 2)?.position).toBe(41)
  })
  test('échec d’insertion : l’erreur remonte, aucun message de succès', async () => {
    const { d } = deps([base])
    const p = await previewImport(xlsx(), d)
    await expect(commitImport(p, { ...d, insert: async () => { throw new Error('Action refusée') } })).rejects.toThrow('Action refusée')
  })
})
