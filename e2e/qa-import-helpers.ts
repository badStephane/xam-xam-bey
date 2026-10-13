import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expect, freshEmail, signInWithCode } from './helpers'

/**
 * Outils de la recette QA de l'import Excel (docs/squad/10-qa-import.md), pile Supabase LOCALE du projet (ports 553xx).
 * Fixtures : src/lib/__fixtures__/qa/make_qa_fixtures.py. Questions marquées [QA import] ou [QA], supprimées avant et après.
 */
const DB_CONTAINER = 'supabase_db_xam-xam-bey'
const MARKS = "q like '[QA import]%' or q like '[QA] Question %'"

export const fixture = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))

export function sql(query: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', query], { encoding: 'utf8' }).trim()
}
export const cleanup = (): void => { sql(`delete from public.cards where ${MARKS}`) }
export const count = (like: string): number => Number(sql(`select count(*) from public.cards where q like '${like}'`))

export async function openImport(page: Page, tag: string): Promise<void> {
  const email = freshEmail(tag)
  await signInWithCode(page, email)
  sql(`insert into public.admins (email) values ('${email.toLowerCase()}') on conflict do nothing`)
  await page.goto('/?screen=admin')
  await page.getByRole('button', { name: 'QUESTIONS' }).click()
  await page.getByRole('button', { name: 'Importer un fichier Excel' }).click()
  await expect(page.getByRole('heading', { name: 'Importer des questions' })).toBeVisible()
}
