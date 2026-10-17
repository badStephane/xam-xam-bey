import { expect, freshEmail, signInWithCode, test } from './helpers'
import { sql } from './qa-import-helpers'

/**
 * Pages de révision des documents (2026-10-18), pile Supabase LOCALE : une page publiée de test pour « Bases du scoutisme »
 * (zone 1) s'ouvre depuis les Fiches, affiche objectifs, sections et encadrés, et le document se lit puis RETOUR ramène à la page.
 */
const DOC = `(select id from public.documents where file_name = 'Bases du scoutisme.pdf' and zone = 1 limit 1)`
const PAGE = { objectifs: ['[E2E] Situer les débuts du scoutisme'], sections: [{ h: '[E2E] Brownsea', items: ['Premier camp en **1907**.'], retenir: ['[E2E] À retenir : Brownsea'], attention: ['[E2E] Attention : dates différentes selon les pages'], src: 'p. 16' }] }
const insert = (status: string): void => { sql(`insert into public.doc_pages (document_id, status, data) values (${DOC}, '${status}', '${JSON.stringify(PAGE).replace(/'/g, "''")}'::jsonb)`) }
const cleanup = (): void => { sql(`delete from public.doc_pages where document_id = ${DOC}`) }

test.describe('Pages de révision', () => {
  test.beforeEach(cleanup)
  test.afterAll(cleanup)

  test('ouverte depuis les Fiches ; contenu guidé ; document lu puis RETOUR à la page', async ({ page }) => {
    insert('published')
    await signInWithCode(page, freshEmail('doc-pages'))
    await page.getByRole('button', { name: 'FICHES' }).first().click()
    await page.getByRole('button', { name: /^Octobre,/ }).click()

    const list = page.getByRole('region', { name: 'Pages de révision des documents' })
    await list.getByRole('button', { name: /Bases du scoutisme/i }).click()
    await expect(page.getByRole('heading', { name: /Bases du scoutisme/i, level: 2 })).toBeVisible()
    await expect(page.getByText('[E2E] Situer les débuts du scoutisme')).toBeVisible()
    await expect(page.getByRole('heading', { name: /\[E2E\] Brownsea/, level: 3 })).toBeVisible()
    await expect(page.getByText('★ À RETENIR')).toBeVisible()
    await expect(page.getByText('[E2E] Attention : dates différentes selon les pages')).toBeVisible()
    await expect(page.getByText('DANS LE DOCUMENT · P. 16')).toBeVisible()
    await expect(page).toHaveURL(/#page\/\d+$/)

    await page.getByRole('button', { name: 'Lire le document' }).click()
    await expect(page.getByRole('heading', { name: /Bases du scoutisme/i, level: 1 })).toBeVisible()
    await page.getByRole('button', { name: '← RETOUR' }).click()
    await expect(page.getByRole('heading', { name: /\[E2E\] Brownsea/, level: 3 })).toBeVisible()
  })

  test('page en brouillon : pas proposée dans les Fiches', async ({ page }) => {
    insert('draft')
    await signInWithCode(page, freshEmail('doc-pages-draft'))
    await page.getByRole('button', { name: 'FICHES' }).first().click()
    await page.getByRole('button', { name: /^Octobre,/ }).click()
    await expect(page.getByRole('heading', { name: 'Fiches', level: 1 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Pages de révision des documents' })).toHaveCount(0)
  })
})
