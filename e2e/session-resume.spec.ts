import type { Page } from '@playwright/test'
import { atPos, startDailyOnQcm } from './cards'
import { expect, freshEmail, signInWithCode, test } from './helpers'

/** Lot 3, Front A : E1 (la réponse compte à la correction), E2 (séance gardée au rechargement), UX-13, UX-14. */

const counter = (page: Page) => page.locator('.sess-top [role="status"]')
const cardId = async (page: Page): Promise<string> => ((await page.locator('.qcard .band span').last().textContent()) || '').trim().toLowerCase()
const verdict = (page: Page) => page.locator('.verdict')
const freshKpi = (page: Page) => page.locator('.kpi', { hasText: 'NOUVELLES' }).locator('b')

/** Vues enregistrées pour une carte dans la copie locale de la progression (xxb.progress.v1.<compte>). */
async function viewsOf(page: Page, id: string): Promise<number> {
  return page.evaluate(card => {
    const key = Object.keys(localStorage).find(k => k.startsWith('xxb.progress.v1.'))
    const prog = key ? JSON.parse(localStorage.getItem(key) || '{}') as { cards?: Record<string, number[]> } : {}
    return prog.cards?.[card]?.[2] ?? 0
  }, id)
}

/** Séance du jour, arrêtée sur son premier QCM (QA L5-6) ; renvoie sa position. */
const startDaily = (page: Page): Promise<number> => startDailyOnQcm(page)

test.describe('Séance : réponse comptée et reprise après rechargement (E1, E2)', () => {
  test('noter une carte, actualiser tout de suite : la note est gardée une seule fois et la séance reprend au bon endroit', async ({ page }) => {
    await signInWithCode(page, freshEmail('resume'))
    const freshBefore = Number(await freshKpi(page).textContent())
    const pos = await startDaily(page)
    const first = await cardId(page)
    await expect(counter(page)).toHaveText(atPos(pos))

    await page.getByRole('radiogroup', { name: 'Propositions' }).getByRole('radio').first().click()
    await page.getByRole('button', { name: /^Valider/ }).click()
    await expect(verdict(page)).toBeVisible()
    // E1 : la note est enregistrée dès la correction, avant « Carte suivante ».
    expect(await viewsOf(page, first)).toBe(1)

    await page.reload()
    // E2 : même carte, correction toujours affichée, aucune nouvelle note.
    await expect(verdict(page)).toBeVisible()
    await expect(counter(page)).toHaveText(atPos(pos))
    expect(await cardId(page)).toBe(first)
    await expect(page).toHaveURL(/#session$/)
    expect(await viewsOf(page, first)).toBe(1)

    await page.getByRole('button', { name: /CARTE SUIVANTE|VOIR LE BILAN/ }).click()
    await expect(counter(page)).toHaveText(atPos(pos + 1))
    const second = await cardId(page)
    expect(second).not.toBe(first)
    expect(await viewsOf(page, first)).toBe(1)

    // Rechargement avant de répondre : reprise sur la deuxième carte, sans correction.
    await page.reload()
    await expect(counter(page)).toHaveText(atPos(pos + 1))
    expect(await cardId(page)).toBe(second)
    await expect(verdict(page)).toHaveCount(0)
    expect(await viewsOf(page, second)).toBe(0)

    // Quitter (UX-14) : la note de la première carte compte, une seule fois.
    await page.getByRole('button', { name: '✕ QUITTER' }).click()
    await page.getByRole('button', { name: 'QUITTER', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    await expect(freshKpi(page)).toHaveText(String(freshBefore - pos))
    expect(await viewsOf(page, first)).toBe(1)

    // Séance quittée : un rechargement ne la fait pas revenir.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    await expect(page.locator('.sess')).toHaveCount(0)
  })
})

test.describe('Quitter une séance et changer d’écran (UX-13, UX-14)', () => {
  test('QUITTER et Échap demandent confirmation ; titre et focus suivent l’écran', async ({ page }) => {
    await signInWithCode(page, freshEmail('quit'))
    await expect(page).toHaveTitle('Aujourd’hui · Xam Xam Bëy')
    await page.getByRole('button', { name: 'PLAN ANNUEL' }).click()
    await expect(page).toHaveTitle('Plan annuel · Xam Xam Bëy')
    await expect(page.getByRole('heading', { name: 'Plan annuel', level: 1 })).toBeFocused()
    await page.getByRole('button', { name: 'AUJOURD’HUI' }).first().click()

    await startDaily(page)
    await expect(page).toHaveTitle('Session en cours · Xam Xam Bëy')
    const question = page.locator('.qcard h1')
    await expect(question).toBeFocused()

    const ask = page.getByRole('group', { name: 'Quitter ? Vos réponses déjà données sont gardées.' })
    await page.getByRole('button', { name: '✕ QUITTER' }).click()
    await expect(ask).toBeVisible()
    await expect(page.getByRole('button', { name: 'CONTINUER' })).toBeFocused()
    await page.getByRole('button', { name: 'CONTINUER' }).click()
    await expect(ask).toHaveCount(0)
    await expect(page.getByRole('button', { name: '✕ QUITTER' })).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(ask).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(ask).toHaveCount(0)
    await expect(page.getByRole('radiogroup', { name: 'Propositions' })).toBeVisible()

    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'QUITTER', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    await expect(page).toHaveTitle('Aujourd’hui · Xam Xam Bëy')
  })
})

test.describe('Document relié à une carte (E4, côté scouts)', () => {
  test('ouvrir le document depuis la correction puis revenir : la séance continue, même après un rechargement', async ({ page }) => {
    await signInWithCode(page, freshEmail('carddoc'))
    await startDaily(page)
    await page.getByRole('radiogroup', { name: 'Propositions' }).getByRole('radio').first().click()
    // Avant la correction : aucun lien.
    await expect(page.getByRole('link', { name: /^Ouvrir le document/ })).toHaveCount(0)
    await page.getByRole('button', { name: /^Valider/ }).click()
    const first = await cardId(page)

    // Pile locale : toutes les cartes publiées sont reliées à un document.
    await page.getByRole('link', { name: /^Ouvrir le document/ }).click()
    await expect(page).toHaveURL(/#apercu\/\d+$/)
    await expect(page.getByRole('button', { name: '← RETOUR' })).toBeVisible()

    // RETOUR : la séance, pas la bibliothèque.
    await page.getByRole('button', { name: '← RETOUR' }).click()
    await expect(verdict(page)).toBeVisible()
    expect(await cardId(page)).toBe(first)

    // Retour Android depuis le document : la séance aussi.
    await page.getByRole('link', { name: /^Ouvrir le document/ }).click()
    await expect(page).toHaveURL(/#apercu\/\d+$/)
    await page.goBack()
    await expect(verdict(page)).toBeVisible()
    expect(await cardId(page)).toBe(first)

    // Rechargement sur le document (Android), puis RETOUR : la séance reprend (E2).
    await page.getByRole('link', { name: /^Ouvrir le document/ }).click()
    await expect(page).toHaveURL(/#apercu\/\d+$/)
    await page.reload()
    await expect(page.getByRole('button', { name: '← RETOUR' })).toBeVisible()
    await page.getByRole('button', { name: '← RETOUR' }).click()
    await expect(verdict(page)).toBeVisible()
    expect(await cardId(page)).toBe(first)
    expect(await viewsOf(page, first)).toBe(1)
  })
})
