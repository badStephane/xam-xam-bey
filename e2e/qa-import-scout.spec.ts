import { expect, freshEmail, signInWithCode, test } from './helpers'
import { cleanup, sql } from './qa-import-helpers'

/**
 * IM-6 (docs/squad/10-qa-import.md) : une question sans QCM (permise par l'import et l'éditeur) publiée dans une zone
 * qui n'a pas d'autre carte publiée. Le repli de l'application ne trouve aucune mauvaise proposition.
 */
test.use({ viewport: { width: 360, height: 740 } })
test.beforeEach(() => {
  cleanup()
  sql(`insert into public.cards (id, zone, position, q, a, src, note, qcm, status) values
    ('t12-qa0001', 12, 9001, '[QA import] Scout sans QCM', '**Réponse unique.** Détail.', 'Source QA', '', null, 'published')`)
})
test.afterAll(cleanup)

test('IM-6 corrigé : carte sans QCM seule dans sa zone, leurres pris dans les autres zones (4 propositions)', async ({ page }) => {
  expect(sql("select count(*) from public.cards where zone = 12 and status = 'published'")).toBe('1')
  await signInWithCode(page, freshEmail('qa-scout'))
  await page.getByLabel('ZONE').selectOption('12')
  await page.getByRole('button', { name: 'Réviser · 1 question' }).click()
  await expect(page.getByText('[QA import] Scout sans QCM')).toBeVisible()
  const options = page.getByRole('radiogroup', { name: 'Propositions' }).getByRole('radio')
  await expect(options).toHaveCount(4)
  await expect(page.getByRole('radiogroup', { name: 'Propositions' })).toContainText('Réponse unique')
})

test.describe('IM-6 : auto-évaluation quand aucun leurre n’existe', () => {
  // Zone isolée : les autres cartes publiées repassent en brouillon le temps du test (pile locale seulement), puis sont restaurées.
  const restore = (): void => {
    sql(`do $$ begin if to_regclass('public.qa_unpublished') is not null then
      update public.cards set status = 'published' where id in (select id from public.qa_unpublished); drop table public.qa_unpublished; end if; end $$`)
  }
  test.beforeEach(() => {
    restore()
    sql(`create table public.qa_unpublished as select id from public.cards where status = 'published' and id <> 't12-qa0001'`)
    sql(`update public.cards set status = 'draft' where id in (select id from public.qa_unpublished)`)
  })
  test.afterEach(restore)

  test('seule carte publiée du site, sans QCM : « Voir la réponse » puis « Je savais »', async ({ page }) => {
    expect(sql("select count(*) from public.cards where status = 'published'")).toBe('1')
    await signInWithCode(page, freshEmail('qa-self'))
    await page.getByLabel('ZONE').selectOption('12')
    await page.getByRole('button', { name: 'Réviser · 1 question' }).click()
    await expect(page.getByText('[QA import] Scout sans QCM')).toBeVisible()
    await expect(page.getByRole('radiogroup', { name: 'Propositions' })).toHaveCount(0)
    await page.keyboard.press('1')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Voir la réponse' }), 'les touches 1 et Entrée ne sautent pas l’auto-évaluation').toBeVisible()
    await page.getByRole('button', { name: 'Voir la réponse' }).click()
    await expect(page.getByText('Réponse unique.')).toBeVisible()
    await expect(page.getByRole('button', { name: '✓ Je savais' })).toBeFocused()
    await page.getByRole('button', { name: '✓ Je savais' }).click()
    await expect(page.getByRole('button', { name: /Je savais/ })).toHaveCount(0)
  })
})
