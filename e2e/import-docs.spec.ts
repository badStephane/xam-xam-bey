import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { expect, test } from './helpers'
import { count, openImport, sql } from './qa-import-helpers'

/**
 * E4 (lot 3) : une question importée est reliée au document de sa zone quand la colonne Source correspond
 * au titre ou au nom de fichier (sans casse ni accents ni extension). Pile Supabase LOCALE (ports 553xx).
 * Deux documents homonymes temporaires (zone 2, « [E2E] Homonyme ») sont créés puis retirés.
 */
const MARK = '[QA import] E4%'
const HOMONYM = '[E2E] Homonyme'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const cell = (ref: string, v: string | number): string =>
  typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`

/** Classeur .xlsx minimal (chaînes en ligne), comme en produit un tableur. */
function xlsx(rows: ReadonlyArray<ReadonlyArray<string | number>>): Uint8Array {
  const cols = 'ABCDEFGHI'
  const data = rows.map((r, i) => `<row r="${i + 1}">${r.map((v, k) => cell(`${cols[k]}${i + 1}`, v)).join('')}</row>`).join('')
  const ns = 'http://schemas.openxmlformats.org'
  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}/spreadsheetml/2006/main"><sheetData>${data}</sheetData></worksheet>`),
  })
}

const removeHomonyms = (): void => { sql(`delete from public.documents where title = '${HOMONYM}'`) }
const cleanup = (): void => { sql(`delete from public.cards where q like '${MARK}'`); removeHomonyms() }

test.describe('E4 : questions importées reliées à leur document', () => {
  test.use({ viewport: { width: 360, height: 740 } })
  test.beforeEach(cleanup)
  test.afterAll(cleanup)

  test('correspondance unique reliée, homonymes et inconnus non reliés, aperçu par ligne', async ({ page }) => {
    sql(`insert into public.documents (zone, title, folder, file_name, storage_path, size) values
      (2, '${HOMONYM}', '', 'homonyme-a.pdf', 'e2e-homonyme-a.pdf', 1), (2, '${HOMONYM}', '', 'homonyme-b.pdf', 'e2e-homonyme-b.pdf', 1)`)
    const file = join(mkdtempSync(join(tmpdir(), 'xxb-e4-')), 'e4.xlsx')
    writeFileSync(file, xlsx([
      ['Zone', 'Question', 'Réponse', 'Source'],
      [1, '[QA import] E4 titre', 'R', '  BASES du Scoutisme.PDF '],
      [1, '[QA import] E4 fichier', 'R', "La devise, l'esprit et les éléments fondamentaux du scoutismes.docx"],
      [2, '[QA import] E4 homonymes', 'R', '[e2e] homonyme'],
      [3, '[QA import] E4 autre zone', 'R', 'Bases du scoutisme'],
      [1, '[QA import] E4 sans source', 'R', ''],
    ]))

    await openImport(page, 'e4-docs')
    await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(file)
    await expect(page.getByRole('status').filter({ hasText: 'Rien n’est encore enregistré' })).toHaveText(/5 lignes valides/)
    await expect(page.getByRole('heading', { name: /DOCUMENTS RELIÉS · 2 SUR 5/ })).toBeVisible()
    const line = (n: number) => page.getByRole('listitem').filter({ hasText: `Ligne ${n} ` })
    await expect(line(2)).toContainText('reliée à « Bases du scoutisme »')
    await expect(line(3)).toContainText('reliée à « la devise, l esprit et les élements fondamentaux du scoutismes »')
    await expect(line(4)).toContainText('désigne 2 documents de la zone')
    await expect(line(5)).toContainText('aucun document de la zone')
    await expect(page.getByRole('note').filter({ hasText: 'à relier dans l’éditeur' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'débordement horizontal à 360 px').toBeLessThanOrEqual(360)

    await page.getByRole('button', { name: 'Importer 5 questions' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'importées' })).toContainText('5 questions importées en brouillon')
    expect(count(MARK)).toBe(5)
    const linked = sql(`select string_agg(q || '=' || coalesce(document_id::text, 'null'), ';' order by q) from public.cards where q like '${MARK}'`)
    expect(linked).toBe([
      '[QA import] E4 autre zone=null',
      '[QA import] E4 fichier=4',
      '[QA import] E4 homonymes=null',
      '[QA import] E4 sans source=null',
      '[QA import] E4 titre=1',
    ].join(';'))
    // La liste admin affiche le document relié de la question importée (brouillon de la zone 01).
    await page.getByRole('group', { name: 'Zone' }).getByRole('button', { name: /^01 / }).click()
    await expect(page.getByRole('listitem').filter({ hasText: '[QA import] E4 titre' })).toContainText('Bases du scoutisme')
    await expect(page.getByRole('listitem').filter({ hasText: '[QA import] E4 sans source' })).toContainText('SANS DOCUMENT LIÉ')
  })
})
