import { beforeEach, describe, expect, test, vi } from 'vitest'

interface RemoveResult { data: { name: string }[] | null; error: { message: string } | null }

const state = vi.hoisted(() => ({
  remove: { data: [] as { name: string }[] | null, error: null as { message: string } | null },
  insertError: null as { message: string; code?: string } | null,
  /** Lignes renvoyées par la base après `.select('id')` (0 ligne : RLS ou élément introuvable). */
  rows: [{ id: 12 }] as Array<Record<string, unknown>>,
  removedPaths: [] as string[][],
}))

vi.mock('./supabase', () => {
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {}
    for (const m of ['delete', 'eq', 'insert', 'select', 'update', 'order', 'limit']) c[m] = () => c
    c.single = () => Promise.resolve(result)
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko)
    return c
  }
  return {
    supabase: {
      from: () => chain({ data: state.insertError ? null : state.rows, error: state.insertError }),
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: { path: 'x' }, error: null }),
          remove: (paths: string[]) => { state.removedPaths.push(paths); return Promise.resolve(state.remove as RemoveResult) },
        }),
      },
    },
  }
})

vi.mock('./pdf', () => ({ openPdf: () => Promise.resolve({ doc: { numPages: 3 }, cancel: () => undefined }) }))

const { deleteCard, deleteDocument, saveCard, setCardStatus, updateDocument, uploadDocument } = await import('./adminApi')

const pdf = (): File => new File([new Uint8Array([37, 80, 68, 70])], 'Guide.pdf', { type: 'application/pdf' })
const meta = { title: 'Guide', zone: 1, folder: '', essential: false }

beforeEach(() => {
  state.remove = { data: [], error: null }
  state.insertError = null
  state.rows = [{ id: 12 }]
  state.removedPaths = []
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('deleteDocument', () => {
  test('réussit quand remove() supprime exactement un objet', async () => {
    state.remove = { data: [{ name: '12.pdf' }], error: null }
    await expect(deleteDocument(12, '12.pdf')).resolves.toBeUndefined()
    expect(state.removedPaths).toEqual([['12.pdf']])
  })

  test('lève une erreur visible quand remove() ne supprime aucun objet', async () => {
    await expect(deleteDocument(12, '12.pdf')).rejects.toThrow(/fichier .*12\.pdf.* reste en ligne/)
  })

  test('lève une erreur visible quand remove() renvoie une erreur', async () => {
    state.remove = { data: null, error: { message: 'boom' } }
    await expect(deleteDocument(12, '12.pdf')).rejects.toThrow(/reste en ligne/)
  })
})

describe('uploadDocument, nettoyage après échec d’insertion', () => {
  test('garde le message d’origine quand le fichier envoyé est bien retiré', async () => {
    state.insertError = { message: 'duplicate', code: '23505' }
    state.remove = { data: [{ name: 'guide.pdf' }], error: null }
    await expect(uploadDocument(pdf(), meta)).rejects.toThrow('Cet élément existe déjà.')
  })

  test('signale le fichier orphelin quand remove() ne supprime aucun objet', async () => {
    state.insertError = { message: 'duplicate', code: '23505' }
    await expect(uploadDocument(pdf(), meta)).rejects.toThrow(/Cet élément existe déjà\..*n’a pas pu être retiré/)
    expect(state.removedPaths).toHaveLength(1)
  })
})

describe('BE-5 / QA-5 : 0 ligne touchée lève une erreur visible', () => {
  const NONE = /Action refusée ou élément introuvable/
  const input = { zone: 1, documentId: null, src: 's', q: 'q', a: 'a', note: '', qcm: { ok: 'o', no: ['n'] }, status: 'draft' as const }

  test('updateDocument', async () => {
    await expect(updateDocument(12, meta)).resolves.toBeUndefined()
    state.rows = []
    await expect(updateDocument(12, meta)).rejects.toThrow(NONE)
  })
  test('deleteDocument : aucune ligne retirée, le fichier n’est pas touché', async () => {
    state.rows = []
    await expect(deleteDocument(12, '12.pdf')).rejects.toThrow(NONE)
    expect(state.removedPaths).toEqual([])
  })
  test('setCardStatus et deleteCard', async () => {
    await expect(setCardStatus('z1-001', 'published')).resolves.toBeUndefined()
    await expect(deleteCard('z1-001')).resolves.toBeUndefined()
    state.rows = []
    await expect(setCardStatus('z1-001', 'published')).rejects.toThrow(NONE)
    await expect(deleteCard('z1-001')).rejects.toThrow(NONE)
  })
  test('saveCard en mise à jour', async () => {
    state.rows = [{ id: 'z1-001', zone: 1 }]
    await expect(saveCard('z1-001', input)).resolves.toEqual({ id: 'z1-001', zone: 1 })
    state.rows = []
    await expect(saveCard('z1-001', input)).rejects.toThrow(NONE)
  })
})
