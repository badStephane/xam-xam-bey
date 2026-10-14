import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { LOCAL_API } from '../playwright.config'
import { answerAny } from './cards'
import { expect, freshEmail, signInWithCode, test } from './helpers'

/**
 * Lot 5 : pseudo choisi en fin de séance, badge débloqué, ligue affichée, Ligue et Badges hors ligne.
 * Build de production servi par `vite preview` (le service worker ne s'inscrit qu'en production), pile Supabase LOCALE
 * (ports 553xx) avec les migrations du lot 5 appliquées.
 */
const PORT = 4183
const ORIGIN = `http://localhost:${PORT}`
const OUT_DIR = fileURLToPath(new URL('../node_modules/.cache/xxb-e2e-league', import.meta.url))
const LOCAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const BUILD_ENV = { ...process.env, VITE_SUPABASE_URL: LOCAL_API, VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY }
const MAX_CARDS = 60

async function waitForServer(url: string, ms: number): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await fetch(url).then(r => r.ok, () => false)) return
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`[e2e] ${url} injoignable`)
}

let preview: ChildProcess | null = null

test.use({ baseURL: ORIGIN })

test.beforeAll(async () => {
  test.setTimeout(180_000)
  execFileSync('npx', ['vite', 'build', '--outDir', OUT_DIR, '--emptyOutDir'], { env: BUILD_ENV, stdio: 'ignore' })
  preview = spawn('npx', ['vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'], { env: BUILD_ENV, stdio: 'ignore' })
  await waitForServer(ORIGIN, 30_000)
})

test.afterAll(() => { preview?.kill() })

const FIN = () => /Quête accomplie/

/** Termine la séance du jour : QCM (première proposition) ou auto-évaluation (Su), jusqu'au bilan. */
async function finishDailySession(page: Page): Promise<void> {
  await page.getByRole('button', { name: /DÉMARRER LA SESSION DU JOUR/ }).click()
  for (let i = 0; i < MAX_CARDS; i++) {
    if (await page.getByRole('heading', { name: FIN() }).isVisible()) return
    await answerAny(page)
  }
  await expect(page.getByRole('heading', { name: FIN() })).toBeVisible()
}

/** Pseudo valide et unique : lettres seulement (4 chiffres au plus, C5). */
const uniquePseudo = (): string => `Scout${Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`.slice(0, 20)

async function signInWithWorker(page: Page, email: string): Promise<void> {
  await signInWithCode(page, email)
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 20_000 })
}

test('bilan : badge débloqué, pseudo choisi, ligue affichée ; puis Ligue et Badges hors ligne', async ({ page }) => {
  test.setTimeout(120_000)
  await signInWithWorker(page, freshEmail('league'))
  await finishDailySession(page)

  // Badge local débloqué pendant la séance (C6).
  await expect(page.getByText('Nouveau badge : Premier pas')).toBeVisible()

  // Invitation proposée une fois (P-A), formulaire en ligne, pas de modale.
  await expect(page.getByRole('heading', { name: 'REJOINDRE LES LIGUES ?' })).toBeVisible()
  await page.getByRole('button', { name: 'CHOISIR UN PSEUDO' }).click()
  const field = page.getByLabel('Votre pseudo')
  await field.fill('ab')
  await field.blur()
  await expect(page.getByText('3 caractères au moins.')).toBeVisible()
  const pseudo = uniquePseudo()
  await field.fill(pseudo)
  await page.getByRole('button', { name: 'REJOINDRE LES LIGUES' }).click()
  await expect(page.getByText(`Bienvenue en Ligue Piste, ${pseudo}.`)).toBeVisible()

  await page.getByRole('button', { name: 'VOIR MA LIGUE' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Ligue Piste/ })).toBeVisible()
  await expect(page).toHaveTitle(/^Ligue · /)
  await expect(page.getByRole('listitem', { name: new RegExp(`^\\d+(er|e), ${pseudo}, \\d+ XP, vous$`) })).toBeVisible()
  await expect(page.getByText(/XP CETTE SEMAINE/).first()).toBeVisible()

  // Retour Android : l'écran précédent du site (le bilan est remplacé par Aujourd'hui).
  await page.getByRole('navigation', { name: 'Progrès' }).getByRole('button', { name: 'BADGES' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Badges' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: /Ligue Piste/ })).toBeVisible()

  // Hors ligne (P4) : rechargement servi par le worker, classement de la dernière connexion.
  await page.context().setOffline(true)
  const res = await page.reload()
  expect(res?.fromServiceWorker(), 'page servie par le service worker').toBe(true)
  await expect(page.getByText(/^Hors réseau : classement de la dernière connexion \(/)).toBeVisible()
  await expect(page.getByRole('listitem', { name: new RegExp(`${pseudo}.*vous$`) })).toBeVisible()
  await page.getByRole('navigation', { name: 'Progrès' }).getByRole('button', { name: 'BADGES' }).click()
  await expect(page.getByText('Hors réseau : badges de ligue et de défi de la dernière connexion.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Premier pas/ })).toBeVisible()
  await page.context().setOffline(false)
})

test('écrans Ligue et Badges préchargés par le worker : ouverts hors ligne sans visite préalable', async ({ page }) => {
  test.setTimeout(90_000)
  await signInWithWorker(page, freshEmail('league-precache'))
  await expect.poll(() => page.evaluate(async () => (await (await caches.open('xxb-rt-v1')).keys()).some(r => /Gamification-/.test(r.url))), { timeout: 15_000 }).toBe(true)
  await page.context().setOffline(true)
  await page.goto(`${ORIGIN}/#badges`)
  await expect(page.getByRole('heading', { level: 1, name: 'Badges' })).toBeVisible()
  await expect(page.getByText('Votre premier badge : notez une carte.')).toBeVisible()
  await page.getByRole('navigation', { name: 'Progrès' }).getByRole('button', { name: 'LIGUE' }).click()
  await expect(page.getByText('Cet écran n’est pas encore sur votre téléphone.')).toHaveCount(0)
  await expect(page.getByText(/^Hors réseau : (classement de la dernière connexion|le classement s’affichera au retour du réseau)/)).toBeVisible()
  await page.context().setOffline(false)
})
