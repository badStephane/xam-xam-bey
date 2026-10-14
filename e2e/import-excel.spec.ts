import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expect, freshEmail, signInWithCode, test } from './helpers'

/**
 * Import Excel de questions (admin) sur la pile Supabase LOCALE du projet.
 * Les droits admin et le contrôle en base passent par psql dans le conteneur de ce projet seulement
 * (supabase_db_xam-xam-bey, ports 553xx) : aucune clé, aucun autre projet touché.
 */
const DB_CONTAINER = 'supabase_db_xam-xam-bey'
const FIXTURE = fileURLToPath(new URL('./fixtures/import-e2e.xlsx', import.meta.url))
const MARK = '[E2E import]%'

function sql(query: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', query], { encoding: 'utf8' }).trim()
}
const cleanup = (): void => { sql(`delete from public.cards where q like '${MARK}'`) }
const maxPosition = (zone: number): number => Number(sql(`select coalesce(max(position), 0) from public.cards where zone = ${zone}`))

async function openImportAsAdmin(page: Page, tag: string): Promise<void> {
  const email = freshEmail(tag)
  await signInWithCode(page, email)
  sql(`insert into public.admins (email) values ('${email.toLowerCase()}') on conflict do nothing`)
  await page.goto('/?screen=admin')
  await page.getByRole('button', { name: 'QUESTIONS' }).click()
  await page.getByRole('button', { name: 'Importer un fichier Excel' }).click()
  await expect(page.getByRole('heading', { name: 'Importer des questions' })).toBeVisible()
}

test.describe('Import Excel des questions (admin)', () => {
  test.use({ viewport: { width: 360, height: 740 } })
  test.beforeEach(cleanup)
  test.afterAll(cleanup)

  test('aperçu puis import en brouillon, en fin de zone', async ({ page }) => {
    const before = { 11: maxPosition(11), 12: maxPosition(12) }
    const excelLib: string[] = []
    page.on('request', r => { if (r.url().includes('read-excel-file')) excelLib.push(r.url()) })
    await openImportAsAdmin(page, 'import')
    expect(excelLib, 'bibliothèque Excel chargée avant le choix d’un fichier').toEqual([])
    await expect(page.getByRole('link', { name: 'Télécharger le modèle' })).toHaveAttribute('href', './modele-questions.xlsx')

    await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(FIXTURE)
    await expect(page.getByRole('heading', { name: 'Aperçu de « import-e2e.xlsx »' })).toBeFocused()
    expect(excelLib.length, 'bibliothèque Excel chargée au choix du fichier').toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'débordement horizontal à 360 px').toBeLessThanOrEqual(360)
    await page.screenshot({ path: 'test-results/import-apercu-360.png', fullPage: true })
    await expect(page.getByRole('status').filter({ hasText: 'Rien n’est encore enregistré' })).toHaveText(/3 lignes valides, 2 lignes en erreur/)
    const table = page.getByRole('table')
    await expect(table.getByRole('row', { name: /^11 2 0$/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /^12 1 1$/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /^Zone invalide 0 1$/ })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Ligne 4' })).toContainText('Doublon de la ligne 3 du fichier.')
    await expect(page.getByRole('listitem').filter({ hasText: 'Ligne 5' })).toContainText('Zone invalide (« 0 »)')
    expect(sql(`select count(*) from public.cards where q like '${MARK}'`)).toBe('0')

    await page.getByRole('button', { name: 'Importer 3 questions' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'importées' })).toHaveText('3 questions importées en brouillon dans les zones 11, 12.')
    const rows = sql(`select zone || ':' || position || ':' || status || ':' || (qcm is not null) from public.cards where q like '${MARK}' order by zone, position`)
    expect(rows.split('\n')).toEqual([`11:${before[11] + 1}:draft:true`, `11:${before[11] + 2}:draft:false`, `12:${before[12] + 1}:draft:false`])

    // Liste rechargée : les brouillons apparaissent dans leur zone (filtre BROUILLONS : la liste s'affiche par pages de 50).
    await page.getByRole('button', { name: /^11 / }).click()
    await page.getByRole('button', { name: 'BROUILLONS', exact: true }).click()
    await expect(page.getByText('[E2E import] Troisième question')).toBeVisible()

    // Règle QCM partagée : l'éditeur réenregistre une question importée sans QCM.
    await page.getByRole('listitem').filter({ hasText: '[E2E import] Troisième question' }).getByRole('button', { name: 'Modifier' }).click()
    await page.getByLabel('RÉPONSE COMPLÈTE · **GRAS** POUR L’ESSENTIEL').fill('Réponse trois corrigée')
    await page.getByRole('button', { name: 'Enregistrer en brouillon' }).click()
    await expect(page.getByRole('heading', { name: /^Modifier la question/ })).toHaveCount(0)
    expect(sql(`select a || ':' || (qcm is null) from public.cards where q = '[E2E import] Troisième question'`)).toBe('Réponse trois corrigée:true')

    // Même fichier une seconde fois : tout est doublon avec la base, rien à importer.
    await page.getByRole('button', { name: 'Importer un fichier Excel' }).click()
    await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(FIXTURE)
    await expect(page.getByText('Aucune question à importer.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Importer \d/ })).toHaveCount(0)
    await expect(page.getByRole('listitem').filter({ hasText: 'Ligne 2' })).toContainText('la zone 11 contient déjà cette question')
  })

  test('fichiers refusés : .csv, .xls et classeur abîmé, message clair', async ({ page }) => {
    await openImportAsAdmin(page, 'import-bad')
    const input = page.getByLabel(/FICHIER EXCEL \.XLSX/)
    await input.setInputFiles({ name: 'q.csv', mimeType: 'text/csv', buffer: Buffer.from('Zone;Question\n1;Q') })
    await expect(page.getByRole('alert')).toContainText('Fichier CSV')
    await input.setInputFiles({ name: 'q.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('xx') })
    await expect(page.getByRole('alert')).toContainText('Ancien format Excel (.xls)')
    await input.setInputFiles({ name: 'q.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('PK\u0003\u0004abîmé') })
    await expect(page.getByRole('alert')).toContainText('Fichier illisible')
  })

  test('IM-4 : réponse perdue pendant l’écriture : « résultat incertain », jamais « aucune question importée »', async ({ page }) => {
    await openImportAsAdmin(page, 'import-lost')
    await page.route('**/rest/v1/cards*', route => (route.request().method() === 'POST' ? route.abort('timedout') : route.continue()))
    await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(FIXTURE)
    await page.getByRole('button', { name: 'Importer 3 questions' }).click()
    await expect(page.getByRole('alert')).toHaveText('Résultat incertain : rechargez la liste pour vérifier avant de réimporter.')
    await expect(page.getByText('Aucune question n’a été importée')).toHaveCount(0)
  })

  test('IM-1 : « Publier » depuis la liste refuse un QCM non conforme, avec la raison', async ({ page }) => {
    sql(`insert into public.cards (id, zone, position, q, a, src, note, qcm, status) values
      ('t1-e2epub', 1, 0, '[E2E import] QCM en double', 'Paris.', '', '', '{"ok":"Paris","no":["paris"]}', 'draft')`)
    await openImportAsAdmin(page, 'import-pub')
    await page.getByRole('button', { name: 'Annuler' }).click()
    await page.getByRole('button', { name: /^01 / }).click()
    const item = page.getByRole('listitem').filter({ hasText: '[E2E import] QCM en double' })
    await item.getByRole('button', { name: 'Publier' }).click()
    await expect(item.getByRole('alert')).toContainText('Publication impossible. QCM : deux propositions sont identiques')
    expect(sql("select status from public.cards where id = 't1-e2epub'")).toBe('draft')
  })

  test('insertion refusée par la base : alerte visible, aucun faux succès, rien en base', async ({ page }) => {
    await openImportAsAdmin(page, 'import-ko')
    await page.route('**/rest/v1/cards*', route => (route.request().method() === 'POST'
      ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }) })
      : route.continue()))
    await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(FIXTURE)
    await page.getByRole('button', { name: 'Importer 3 questions' }).click()
    await expect(page.getByRole('alert')).toHaveText('Action refusée : votre compte n’est pas administrateur. Aucune question n’a été importée.')
    await expect(page.getByText(/questions importées en brouillon/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Importer 3 questions' })).toBeEnabled()
    expect(sql(`select count(*) from public.cards where q like '${MARK}'`)).toBe('0')
  })
})
