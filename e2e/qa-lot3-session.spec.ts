import type { Page } from '@playwright/test'
import { atPos, startDailyOnQcm } from './cards'
import { expect, freshEmail, signInWithCode, test } from './helpers'

/**
 * QA lot 3 (docs/squad/12-qa-lot3.md) : attaques sur E1, E2 et UX-14 (serveur de dev, pile locale 553xx).
 *  - double clic sur « Valider » puis sur « Carte suivante » : une note, une carte ;
 *  - retour Android juste après la correction : la note compte une fois, rien ne revient au rechargement ;
 *  - séance falsifiée dans sessionStorage (autre compte, position hors file, JSON cassé) : ignorée et effacée ;
 *  - 360 px : confirmation au clavier, Entrée sur CONTINUER ne valide pas la carte, aucun débordement.
 */

const counter = (page: Page) => page.locator('.sess-top [role="status"]')
const cardId = async (page: Page): Promise<string> => ((await page.locator('.qcard .band span').last().textContent()) || '').trim().toLowerCase()
const verdict = (page: Page) => page.locator('.verdict')

async function viewsOf(page: Page, id: string): Promise<number> {
  return page.evaluate(card => {
    const key = Object.keys(localStorage).find(k => k.startsWith('xxb.progress.v1.'))
    const prog = key ? JSON.parse(localStorage.getItem(key) || '{}') as { cards?: Record<string, number[]> } : {}
    return prog.cards?.[card]?.[2] ?? 0
  }, id)
}

/** Premier QCM de la séance (QA L5-6 : cartes en auto-évaluation éventuelles notées avant), validé par double clic. */
async function startAndValidateFirst(page: Page): Promise<{ first: string; pos: number }> {
  const pos = await startDailyOnQcm(page)
  const first = await cardId(page)
  await page.getByRole('radiogroup', { name: 'Propositions' }).getByRole('radio').first().click()
  await page.getByRole('button', { name: /^Valider/ }).dblclick()
  await expect(verdict(page)).toBeVisible()
  return { first, pos }
}

const sessionKeys = (page: Page): Promise<string[]> =>
  page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('xxb.session.v1.')))

test('L3 QA : double clic sur Valider puis sur Suivant : une seule note, une seule carte passée', async ({ page }) => {
  await signInWithCode(page, freshEmail('qa3-dbl'))
  const { first, pos } = await startAndValidateFirst(page)
  expect(await viewsOf(page, first)).toBe(1)
  await page.getByRole('button', { name: /CARTE SUIVANTE|VOIR LE BILAN/ }).dblclick()
  await expect(counter(page)).toHaveText(atPos(pos + 1))
  await expect(verdict(page)).toHaveCount(0)
  expect(await viewsOf(page, first)).toBe(1)
})

test('L3 QA : retour Android juste après la correction : la note compte une fois, la séance ne revient pas', async ({ page }) => {
  await signInWithCode(page, freshEmail('qa3-back'))
  const { first } = await startAndValidateFirst(page)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
  expect(await viewsOf(page, first)).toBe(1)
  expect(await sessionKeys(page)).toEqual([])
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
  await expect(page.locator('.sess')).toHaveCount(0)
  expect(await viewsOf(page, first)).toBe(1)
})

for (const [label, forge] of [
  ['autre compte', (s: Record<string, unknown>) => JSON.stringify({ ...s, user: '00000000-0000-0000-0000-000000000000' })],
  ['position hors de la file', (s: Record<string, unknown>) => JSON.stringify({ ...s, i: 99 })],
  ['note invalide', (s: Record<string, unknown>) => JSON.stringify({ ...s, hist: [7] })],
  ['JSON cassé', () => '{"v":1,'],
] as const) {
  test(`L3 QA : séance falsifiée (${label}) : ignorée, effacée, aucune erreur`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await signInWithCode(page, freshEmail('qa3-forge'))
    await startAndValidateFirst(page)
    const [key] = await sessionKeys(page)
    expect(key).toBeTruthy()
    await page.evaluate(({ k, src }) => {
      const saved = JSON.parse(sessionStorage.getItem(k) || '{}') as Record<string, unknown>
      // eslint-disable-next-line no-new-func
      sessionStorage.setItem(k, (new Function('s', `return (${src})(s)`))(saved) as string)
    }, { k: key, src: forge.toString() })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    await expect(page.locator('.sess')).toHaveCount(0)
    expect(await sessionKeys(page)).toEqual([])
    expect(errors).toEqual([])
  })
}

test('L3 QA : 360 px, confirmation au clavier : Entrée sur CONTINUER ne valide pas la carte, aucun débordement', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await signInWithCode(page, freshEmail('qa3-360'))
  await startDailyOnQcm(page)
  await page.getByRole('radiogroup', { name: 'Propositions' }).getByRole('radio').first().click()
  await page.getByRole('button', { name: '✕ QUITTER' }).click()
  const stay = page.getByRole('button', { name: 'CONTINUER' })
  await expect(stay).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  await page.keyboard.press('Enter')
  await expect(stay).toHaveCount(0)
  await expect(verdict(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '✕ QUITTER' })).toBeFocused()
  // Confirmer au clavier : Tab jusqu'à QUITTER, Entrée.
  await page.keyboard.press('Escape')
  await expect(stay).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'QUITTER', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
})

// L3-5 (constat QA, corrigé) : confirmation ouverte, aucun raccourci de carte (src/App.tsx, useKeyboard) ; Échap la referme.
test('L3-5 : confirmation ouverte, la touche 1 ne choisit pas de proposition et ne ferme pas la confirmation', async ({ page }) => {
  await signInWithCode(page, freshEmail('qa3-keys'))
  await startDailyOnQcm(page)
  await page.getByRole('button', { name: '✕ QUITTER' }).click()
  await expect(page.getByRole('button', { name: 'CONTINUER' })).toBeFocused()
  await page.keyboard.press('1')
  await expect(page.getByRole('button', { name: 'CONTINUER' })).toBeVisible({ timeout: 2_000 })
  await expect(page.getByRole('radiogroup', { name: 'Propositions' }).getByRole('radio', { checked: true })).toHaveCount(0, { timeout: 2_000 })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'CONTINUER' })).toBeHidden()
  await page.keyboard.press('1')
  await expect(page.getByRole('radiogroup', { name: 'Propositions' }).getByRole('radio', { checked: true })).toHaveCount(1)
})
