import type { Page } from '@playwright/test'
import { expect } from './helpers'

/**
 * Cartes de séance, quel que soit leur type (QA L5-6) : une carte publiée sans propositions possibles se révise en
 * auto-évaluation (« Voir la réponse », puis « Je savais »). Les E2E ne supposent plus que la première carte est un QCM.
 */
export type CardKind = 'qcm' | 'self'

const MAX_SKIPPED = 30

export const choices = (page: Page) => page.getByRole('radiogroup', { name: 'Propositions' })
const reveal = (page: Page) => page.getByRole('button', { name: 'Voir la réponse' })
const counter = (page: Page) => page.locator('.sess-top [role="status"]')

/** « 01/ », « 02/ »… pour la position `n` de la séance. */
export const atPos = (n: number): RegExp => new RegExp(`^${String(n).padStart(2, '0')}/`)

/** Attend la carte affichée et renvoie son type. */
export async function cardKind(page: Page): Promise<CardKind> {
  await expect(choices(page).or(reveal(page))).toBeVisible()
  return (await choices(page).count()) ? 'qcm' : 'self'
}

/** Auto-évaluation : « Voir la réponse », puis « Je savais » (la carte suivante s'affiche). */
export async function answerSelfCheck(page: Page): Promise<void> {
  await reveal(page).click()
  await page.getByRole('button', { name: /Je savais/ }).click()
}

/** Note la carte affichée (QCM : première proposition, Valider, Suivant ; sinon auto-évaluation). */
export async function answerAny(page: Page): Promise<void> {
  if (await cardKind(page) === 'self') { await answerSelfCheck(page); return }
  await choices(page).getByRole('radio').first().click()
  await page.getByRole('button', { name: /^Valider/ }).click()
  await expect(page.locator('.verdict')).toBeVisible()
  await page.getByRole('button', { name: /CARTE SUIVANTE|VOIR LE BILAN/ }).click()
}

/**
 * Démarre la séance du jour et avance jusqu'au premier QCM (les cartes en auto-évaluation avant lui sont notées « Je
 * savais »). Renvoie la position de ce QCM dans la séance (1 si la première carte en est un).
 */
export async function startDailyOnQcm(page: Page): Promise<number> {
  await page.getByRole('button', { name: /DÉMARRER LA SESSION DU JOUR/ }).click()
  for (let i = 0; i < MAX_SKIPPED; i++) {
    if (await cardKind(page) === 'qcm') return Number(((await counter(page).textContent()) || '').slice(0, 2))
    await answerSelfCheck(page)
  }
  throw new Error('[e2e] aucun QCM dans la séance du jour')
}
