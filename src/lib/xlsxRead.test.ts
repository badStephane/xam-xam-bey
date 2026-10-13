import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { REASONS, analyzeImport, readSheetRows } from './cardImport'
import { QCM_ERRORS } from './cardRules'
import { unzipSync } from 'fflate'
import { readSheet } from 'read-excel-file/universal'
import { MAX_UNZIPPED_BYTES, READ_ERRORS, declaredXmlSize, readFirstSheet, withTimeout } from './xlsxRead'

/** Vrai classeur généré par scripts/make_import_xlsx.py (une ligne par cas, voir FIXTURE_ROWS). */
const fixture = (name: string): ArrayBuffer => {
  const buf = readFileSync(resolve(__dirname, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

describe('readFirstSheet sur un vrai .xlsx', () => {
  test('lit la fixture puis l’analyse de bout en bout', async () => {
    const parsed = readSheetRows(await readFirstSheet(fixture('__fixtures__/import-sample.xlsx')))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const r = analyzeImport(parsed.rows, [{ id: 't4-aaaaaa', zone: 4, q: 'Question déjà en base', position: 3 }])
    expect(r.cards.map(c => [c.line, c.zone, c.qcm ? c.qcm.no.length : 0])).toEqual([[2, 1, 1], [3, 2, 0], [12, 5, 3]])
    expect(r.cards[1]).toMatchObject({ q: 'Qui a fondé le scoutisme', note: 'Vérifier la date', src: '' })
    expect(r.errors).toEqual([
      { line: 4, zone: null, reason: REASONS.zone('13') },
      { line: 5, zone: 3, reason: REASONS.q },
      { line: 6, zone: 3, reason: REASONS.a },
      { line: 7, zone: 3, reason: QCM_ERRORS.noWrong },
      { line: 8, zone: 1, reason: REASONS.inFile(2) },
      { line: 10, zone: 4, reason: REASONS.inBase(4) },
      { line: 11, zone: null, reason: REASONS.zone('2.5') },
    ])
  })

  test('IM-7 : la première feuille du modèle n’a que les en-têtes ; l’exemple, valide, est dans la feuille « Exemple »', async () => {
    const model = fixture('../../public/modele-questions.xlsx')
    expect(readSheetRows(await readFirstSheet(model))).toEqual({ ok: true, rows: [] })
    const example = readSheetRows(await readSheet(model, 'Exemple'))
    expect(example.ok && analyzeImport(example.rows, []).cards).toHaveLength(1)
  })

  test.each([
    ['un fichier texte', new TextEncoder().encode('Zone;Question\n1;Q').buffer as ArrayBuffer],
    ['un zip abîmé', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]).buffer as ArrayBuffer],
  ])('%s donne un message clair', async (_, input) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(readFirstSheet(input)).rejects.toThrow(READ_ERRORS.notXlsx)
  })
})

describe('IM-5 / IM-8 : lecture sans Worker, taille décompressée bornée, délai', () => {
  const big = () => fixture('../../e2e/fixtures/qa/big.xlsx')

  test('gros classeur (feuille > 512 Kio décompressée) lu par la voie synchrone', async () => {
    const parsed = readSheetRows(await readFirstSheet(big()))
    expect(parsed.ok && analyzeImport(parsed.rows, []).cards).toHaveLength(900)
  })

  test('taille annoncée par le répertoire central, sans décompresser', () => {
    const size = declaredXmlSize({ unzipSync }, new Uint8Array(big()))
    expect(size).toBeGreaterThan(512 * 1024)
    expect(size).toBeLessThan(MAX_UNZIPPED_BYTES)
  })

  test('au-delà du plafond : refus clair avant décompression', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(readFirstSheet(big(), { maxBytes: 512 * 1024 })).rejects.toThrow(READ_ERRORS.tooBig)
  })

  test('délai dépassé : message clair', async () => {
    await expect(withTimeout(new Promise(() => undefined), 5, READ_ERRORS.timeout)).rejects.toThrow(READ_ERRORS.timeout)
    await expect(withTimeout(Promise.resolve(3), 1000, 'x')).resolves.toBe(3)
  })
})
