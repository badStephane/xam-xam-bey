import { expect, test } from './helpers'
import { cleanup, count, fixture, openImport, sql } from './qa-import-helpers'

/** Recette QA de l'import Excel (docs/squad/10-qa-import.md) : double clic, limites, gros classeur. */
test.describe('QA import Excel', () => {
  test.use({ viewport: { width: 360, height: 740 } })
  test.beforeEach(cleanup)
  test.afterAll(cleanup)

  test('double clic sur « Importer » : une seule insertion', async ({ page }) => {
    let posts = 0
    page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/rest/v1/cards')) posts += 1 })
    await openImport(page, 'qa-dbl')
    await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(fixture('./fixtures/qa/dbl.xlsx'))
    await page.getByRole('button', { name: 'Importer 2 questions' }).dblclick()
    await expect(page.getByRole('status').filter({ hasText: 'importées' })).toBeVisible()
    expect(posts).toBe(1)
    expect(count('[QA import] Double clic%')).toBe(2)
  })

  test('limite : 1 000 lignes importées en une requête, positions en fin de zone', async ({ page }) => {
    const before = Number(sql('select coalesce(max(position), 0) from public.cards where zone = 1'))
    await openImport(page, 'qa-1000')
    await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(fixture('../src/lib/__fixtures__/qa/rows-1000.xlsx'))
    await page.getByRole('button', { name: 'Importer 1000 questions' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'importées' })).toContainText('1000 questions importées en brouillon', { timeout: 20_000 })
    expect(count('[QA] Question %')).toBe(1000)
    expect(sql("select min(position) || ':' || max(position) || ':' || count(distinct position) from public.cards where zone = 1 and q like '[QA] Question %'"))
      .toBe(`${before + 1}:${before + 84}:84`)
  })

  test('1 001 lignes : refus clair, rien en base', async ({ page }) => {
    await openImport(page, 'qa-1001')
    await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(fixture('../src/lib/__fixtures__/qa/rows-1001.xlsx'))
    await expect(page.getByRole('alert')).toContainText('1 000 au plus par import')
    expect(count('[QA] Question %')).toBe(0)
  })

  test('gros classeur (feuille > 512 Kio décompressée), sans CSP : témoin de IM-5', async ({ page }) => {
    await openImport(page, 'qa-big')
    await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(fixture('./fixtures/qa/big.xlsx'))
    await expect(page.getByRole('status').filter({ hasText: 'Rien n’est encore enregistré' })).toHaveText(/900 lignes valides/, { timeout: 20_000 })
  })
})
