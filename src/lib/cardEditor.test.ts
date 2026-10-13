import { describe, expect, test } from 'vitest'
import { editorFromRow, isEditorDirty, newEditor, publishError } from './cardEditor'
import type { CardRow } from './types'

const row: CardRow = {
  id: 'z1-004', zone: 1, document_id: 7, position: 4, q: 'Question ?', a: 'Réponse', src: 'guide.pdf', note: '',
  qcm: { ok: 'Oui', no: ['Non', 'Peut-être', 'Jamais'] }, status: 'published',
}

describe('éditeur de question', () => {
  test('FE-4 : la zone vient de la ligne éditée, pas de la zone sélectionnée', () => {
    expect(editorFromRow(row).zone).toBe(1)
    expect(editorFromRow({ ...row, zone: 2 }).zone).toBe(2)
  })
  test('une nouvelle question prend la zone et le document filtrés', () => {
    const ed = newEditor(3, 9, 'plan.pdf')
    expect(ed).toMatchObject({ id: null, zone: 3, documentId: 9, src: 'plan.pdf', status: 'draft' })
    expect(ed.draft.no).toEqual(['', '', ''])
  })
  test('UX-5 : brouillon inchangé = pas de confirmation ; toute saisie = confirmation', () => {
    const initial = editorFromRow(row)
    expect(isEditorDirty(initial, { ...initial })).toBe(false)
    expect(isEditorDirty(initial, { ...initial, draft: { ...initial.draft, q: 'Autre ?' } })).toBe(true)
    expect(isEditorDirty(initial, { ...initial, draft: { ...initial.draft, no: ['Non', 'Peut-être', 'Toujours'] } })).toBe(true)
    expect(isEditorDirty(initial, { ...initial, documentId: null })).toBe(true)
    expect(isEditorDirty(initial, { ...initial, src: 'x.pdf' })).toBe(true)
  })
  test('qcm absent ou incomplet en base : trois champs vides', () => {
    expect(editorFromRow({ ...row, qcm: null }).draft.no).toEqual(['', '', ''])
  })
})

describe('publication depuis la liste (IM-1)', () => {
  test('QCM conforme ou absent : publiable', () => {
    expect(publishError(row)).toBeNull()
    expect(publishError({ ...row, qcm: null })).toBeNull()
  })
  test('QCM non conforme : refus avec la raison', () => {
    expect(publishError({ ...row, qcm: { ok: 'Paris', no: ['paris'] } })).toMatch(/^Publication impossible\. QCM : deux propositions sont identiques/)
    expect(publishError({ ...row, qcm: { ok: 'Oui', no: [] } })).toMatch(/au moins une mauvaise/)
    expect(publishError({ ...row, qcm: { ok: 'A', no: ['B', 'C', 'D', 'E'] } })).toMatch(/3 mauvaises propositions au plus/)
  })
  test('question ou réponse vide : refus', () => expect(publishError({ ...row, a: ' ' })).toMatch(/vide/))
})
