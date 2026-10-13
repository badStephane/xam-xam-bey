import { execFileSync } from 'node:child_process'
import { expect, freshEmail, signInWithCode, test } from './helpers'

/** Lot 4, F2 : documents cités par les questions de la zone, dans Fiches (serveur de dev, pile Supabase locale). */
const DB_CONTAINER = 'supabase_db_xam-xam-bey'
const HEADING = 'Documents cités par les questions de la zone'

const sql = (query: string): string =>
  execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', query], { encoding: 'utf8' }).trim()

/** Nombre de documents distincts cités par les cartes publiées de la zone. */
const citedCount = (zone: number): number =>
  Number(sql(`select count(distinct document_id) from public.cards where status = 'published' and zone = ${zone} and document_id is not null`))
const byTitle = (a: string, b: string): number => a.localeCompare(b, 'fr', { sensitivity: 'base' })

test('Fiches : documents cités sans doublon, triés ; ouverture puis RETOUR aux fiches ; zone sans document : rien', async ({ page }) => {
  await signInWithCode(page, freshEmail('fiches-docs'))
  await page.getByRole('button', { name: 'FICHES' }).first().click()
  await expect(page.getByRole('heading', { name: 'Fiches', level: 1 })).toBeVisible()

  // Zone 01 (octobre, zone du mois pendant le lot) : la liste suit la base.
  await page.getByRole('button', { name: /^Octobre,/ }).click()
  const section = page.getByRole('region', { name: HEADING })
  await expect(section).toBeVisible()
  const count = citedCount(1)
  expect(count).toBeGreaterThan(1)
  // Un document par entrée (sans doublon), dans l'ordre des titres affichés (titres mis en forme par le catalogue).
  await expect(section.locator('.d-title')).toHaveCount(count)
  const titles = await section.locator('.d-title').allTextContents()
  expect(new Set(titles).size).toBe(count)
  expect(titles).toEqual([...titles].sort(byTitle))

  // Ordinateur en ligne : aperçu du site ; RETOUR ramène aux fiches, pas à la bibliothèque.
  await section.getByRole('button', { name: `Ouvrir ${titles[0]}` }).click()
  await expect(page.getByRole('heading', { name: titles[0], level: 1 })).toBeVisible()
  await page.getByRole('button', { name: '← RETOUR' }).click()
  await expect(page.getByRole('heading', { name: 'Fiches', level: 1 })).toBeVisible()

  // Zone 12 : aucune carte publiée, donc aucun document cité : la section n'apparaît pas.
  await page.getByRole('button', { name: /^Septembre,/ }).click()
  await expect(page.getByRole('heading', { name: HEADING })).toHaveCount(0)
})
