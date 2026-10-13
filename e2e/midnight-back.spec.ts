import type { Page } from '@playwright/test'
import { expect, freshEmail, signInWithCode, test } from './helpers'

/**
 * Horloge simulée : la veille du jour réel, 23 h 58 à Dakar (UTC+0, comme timezoneId).
 * La veille plutôt que le jour même : le jeton de session, émis à l'heure réelle, reste valide pour le navigateur.
 */
function eveningBefore(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 58, 0))
}

const FR_DAYS = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
const label = (d: Date): RegExp => new RegExp(`^${FR_DAYS[d.getUTCDay()]} ${d.getUTCDate()} `)
const dueCount = (page: Page) => page.locator('.kpi', { hasText: 'CARTES À REVOIR' }).locator('b')
const eyebrow = (page: Page) => page.locator('.head .eyebrow').first()

/** Répond à une carte de la session du jour puis quitte : cette carte devient due le lendemain (J+1). */
async function answerOneCardThenQuit(page: Page): Promise<void> {
  await page.getByRole('button', { name: /DÉMARRER LA SESSION DU JOUR/ }).click()
  await page.getByRole('radiogroup', { name: 'Propositions' }).getByRole('radio').first().click()
  await page.getByRole('button', { name: /^Valider/ }).click()
  await page.getByRole('button', { name: /CARTE SUIVANTE|VOIR LE BILAN/ }).click()
  await page.getByRole('button', { name: '✕ QUITTER' }).click()
  // Confirmation en ligne (UX-14, lot 3).
  await page.getByRole('button', { name: 'QUITTER', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
}

test.describe('Passage à minuit (QA-1, C1)', () => {
  test('minuteurs actifs : à minuit le jour change et la carte vue la veille est à revoir', async ({ page }) => {
    const evening = eveningBefore()
    await page.clock.install({ time: evening })
    await signInWithCode(page, freshEmail('midnight'))
    await expect(eyebrow(page)).toHaveText(label(evening))
    await answerOneCardThenQuit(page)
    await expect(dueCount(page)).toHaveText('0')

    await page.clock.runFor('03:00')
    const next = new Date(evening.getTime() + 3 * 60_000)
    await expect(eyebrow(page)).toHaveText(label(next))
    await expect(dueCount(page)).toHaveText('1')
  })

  test('onglet en veille (minuteurs gelés) : au retour sur l’onglet après minuit, le jour change', async ({ page }) => {
    const evening = eveningBefore()
    await page.clock.install({ time: evening })
    await signInWithCode(page, freshEmail('sleep'))
    await answerOneCardThenQuit(page)
    await expect(dueCount(page)).toHaveText('0')

    // L'heure avance sans qu'aucun minuteur ne se déclenche (Android suspend l'onglet), puis l'onglet revient.
    const later = new Date(evening.getTime() + 8 * 3_600_000)
    await page.clock.setSystemTime(later)
    await expect(eyebrow(page)).toHaveText(label(evening))
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(eyebrow(page)).toHaveText(label(later))
    await expect(dueCount(page)).toHaveText('1')
  })
})

test.describe('Bouton retour (point 7)', () => {
  test('retour en pleine séance : la séance se termine, on reste sur le site', async ({ page, baseURL }) => {
    await signInWithCode(page, freshEmail('back'))
    await page.getByRole('button', { name: /DÉMARRER LA SESSION DU JOUR/ }).click()
    await expect(page.getByRole('radiogroup', { name: 'Propositions' })).toBeVisible()
    await page.goBack()
    expect(page.url().startsWith(baseURL!)).toBe(true)
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    // Écran suivant puis retour : on revient à l'écran précédent du site.
    await page.getByRole('button', { name: 'PLAN ANNUEL' }).click()
    await expect(page).toHaveURL(/#plan$/)
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    expect(page.url().startsWith(baseURL!)).toBe(true)
  })
})
