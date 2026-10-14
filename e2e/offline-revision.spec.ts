import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { LOCAL_API } from '../playwright.config'
import { answerAny } from './cards'
import { expect, freshEmail, signInWithCode, test } from './helpers'

/**
 * Lot 4, F1 : révision hors ligne. Comme offline.spec.ts, sur un BUILD de production servi par `vite preview` (le service
 * worker ne s'inscrit qu'en production), dans node_modules/.cache (jamais dist/). Pile Supabase LOCALE (ports 553xx).
 */
const PORT = 4182
const ORIGIN = `http://localhost:${PORT}`
const OUT_DIR = fileURLToPath(new URL('../node_modules/.cache/xxb-e2e-offline-revision', import.meta.url))
const DB_CONTAINER = 'supabase_db_xam-xam-bey'
/** Clé anon de démonstration de la CLI Supabase (publique, pile locale seulement), identique à playwright.config.ts. */
const LOCAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const BUILD_ENV = { ...process.env, VITE_SUPABASE_URL: LOCAL_API, VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY }
/** Clé de session de supabase-js pour la pile locale (`sb-<premier label de l'hôte>-auth-token`). */
const AUTH_KEY = 'sb-127-auth-token'
const NOTICE = 'Hors réseau : vos réponses seront envoyées au retour du réseau.'

const sql = (query: string): string =>
  execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', query], { encoding: 'utf8' }).trim()

/** Vues enregistrées EN BASE pour une carte, et nombre de séances, pour le compte `email`. */
function serverProgress(email: string, cardIds: readonly string[]): { views: number[]; sessions: number } {
  const cols = cardIds.map(id => `coalesce((p.cards->'${id}'->>2)::int, 0)`).join(', ')
  const row = sql(`select ${cols}, coalesce(jsonb_array_length(p.sessions), 0) from public.progress p join auth.users u on u.id = p.user_id where u.email = '${email}'`)
  if (!row) return { views: cardIds.map(() => 0), sessions: 0 }
  const values = row.split('|').map(Number)
  return { views: values.slice(0, cardIds.length), sessions: values[cardIds.length] }
}

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

const cardId = async (page: Page): Promise<string> => ((await page.locator('.qcard .band span').last().textContent()) || '').trim().toLowerCase()

/** Connexion en ligne, révision chargée, service worker aux commandes et copie des cartes écrite. */
async function signInOnline(page: Page, email: string): Promise<void> {
  await signInWithCode(page, email)
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 20_000 })
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('xxb.cards.v1.')))).toBe(true)
}

async function reloadOffline(page: Page): Promise<void> {
  await page.context().setOffline(true)
  const res = await page.reload()
  expect(res?.fromServiceWorker(), 'page servie par le service worker').toBe(true)
}

/** Note la carte affichée (QCM ou auto-évaluation, QA L5-6) et passe à la suivante ; renvoie son identifiant. */
async function gradeCurrent(page: Page): Promise<string> {
  const id = await cardId(page)
  await answerAny(page)
  return id
}

/** Séance du jour hors réseau : 2 cartes notées, puis QUITTER (la séance est journalisée). */
async function offlineSessionWithTwoGrades(page: Page): Promise<string[]> {
  await page.getByRole('button', { name: /DÉMARRER LA SESSION DU JOUR/ }).click()
  await expect(page.getByText(NOTICE)).toBeVisible()
  const ids = [await gradeCurrent(page), await gradeCurrent(page)]
  await page.getByRole('button', { name: '✕ QUITTER' }).click()
  await page.getByRole('button', { name: 'QUITTER', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
  // Hors réseau : aucune erreur d'enregistrement affichée.
  await expect(page.locator('.warn-inline')).toHaveCount(0)
  return ids
}

test.describe('Révision hors ligne (lot 4, F1)', () => {
  test('connecté en ligne, rechargé hors réseau : séance de 2 notes, envoyées une seule fois au retour du réseau', async ({ page }) => {
    const email = freshEmail('offline-rev')
    await signInOnline(page, email)
    await reloadOffline(page)
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    await expect(page.getByText(NOTICE)).toBeVisible()

    const ids = await offlineSessionWithTwoGrades(page)
    expect(ids[0]).not.toBe(ids[1])
    expect(serverProgress(email, ids)).toEqual({ views: [0, 0], sessions: 0 })

    // F2 hors réseau : aucun document n'a été ouvert sur l'appareil, chaque entrée le dit.
    await page.getByRole('button', { name: 'FICHES' }).first().click()
    await expect(page.getByRole('heading', { name: 'Documents cités par les questions de la zone' })).toBeVisible()
    await expect(page.getByText('Hors réseau : pas encore ouvert sur cet appareil').first()).toBeVisible()

    await page.context().setOffline(false)
    await expect.poll(() => serverProgress(email, ids), { timeout: 30_000 }).toEqual({ views: [1, 1], sessions: 1 })
    await expect(page.getByText(NOTICE)).toHaveCount(0)
    // Aucun envoi en double ensuite (jeton rafraîchi, nouvel événement online, rechargement).
    await page.reload()
    await expect(page.getByRole('heading', { name: /Fiches|Aujourd’hui/ }).first()).toBeVisible()
    await page.waitForTimeout(3_000)
    expect(serverProgress(email, ids)).toEqual({ views: [1, 1], sessions: 1 })
  })

  test('jeton expiré hors réseau : ni déconnexion ni perte ; au retour, jeton rafraîchi puis notes envoyées une fois', async ({ page }) => {
    test.setTimeout(180_000)
    const email = freshEmail('offline-exp')
    await signInOnline(page, email)
    // Jeton d'accès donné pour expiré : supabase-js tentera de le rafraîchir, sans réseau.
    await page.evaluate(key => {
      const s = JSON.parse(localStorage.getItem(key) || '{}') as { expires_at?: number }
      localStorage.setItem(key, JSON.stringify({ ...s, expires_at: Math.floor(Date.now() / 1000) - 60 }))
    }, AUTH_KEY)
    await reloadOffline(page)
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    const ids = await offlineSessionWithTwoGrades(page)
    // La session est toujours là (pas de SIGNED_OUT), la progression aussi.
    expect(await page.evaluate(key => !!localStorage.getItem(key), AUTH_KEY)).toBe(true)

    await page.context().setOffline(false)
    // Rafraîchissement par supabase-js (au plus ~60 s de délai de grâce après un échec), puis envoi.
    await expect.poll(() => serverProgress(email, ids), { timeout: 120_000, intervals: [2_000] }).toEqual({ views: [1, 1], sessions: 1 })
    const expiresAt = await page.evaluate(key => (JSON.parse(localStorage.getItem(key) || '{}') as { expires_at?: number }).expires_at ?? 0, AUTH_KEY)
    expect(expiresAt * 1000).toBeGreaterThan(Date.now())
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    await page.waitForTimeout(3_000)
    expect(serverProgress(email, ids)).toEqual({ views: [1, 1], sessions: 1 })
  })

  test('jamais connecté sur l’appareil, hors réseau : « Connectez-vous une première fois avec du réseau »', async ({ page }) => {
    await page.goto(`${ORIGIN}/?screen=revision`)
    await expect(page.getByRole('heading', { name: 'Connectez-vous pour réviser' })).toBeVisible()
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 20_000 })
    await reloadOffline(page)
    await expect(page.getByRole('heading', { name: 'Connectez-vous une première fois avec du réseau' })).toBeVisible()
    await expect(page.getByLabel('ADRESSE E-MAIL')).toHaveCount(0)
    await page.context().setOffline(false)
  })

  // QA lot 4 (14-qa-lot4.md) : téléphone partagé. A se connecte puis se déconnecte, B se connecte : hors réseau, rien de A.
  test('QA L4 : A puis B sur le même appareil : déconnexion de A efface sa copie ; hors réseau, seule la révision de B', async ({ page }) => {
    test.setTimeout(150_000)
    const keysOf = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('xxb.cards.') || k === 'xxb.user.v1'))
    const knownId = () => page.evaluate(() => (JSON.parse(localStorage.getItem('xxb.user.v1') || 'null') as { id?: string } | null)?.id ?? null)
    const emailA = freshEmail('offline-a')
    const emailB = freshEmail('offline-b')

    await signInOnline(page, emailA)
    const idA = await knownId()
    expect(idA).toBeTruthy()
    expect(await keysOf()).toEqual(expect.arrayContaining([`xxb.cards.v1.${idA}`, 'xxb.user.v1']))
    await page.getByRole('button', { name: 'SE DÉCONNECTER' }).first().click()
    await expect(page.getByRole('heading', { name: 'Connectez-vous pour réviser' })).toBeVisible()
    await expect.poll(keysOf).toEqual([])

    await reloadOffline(page)
    await expect(page.getByRole('heading', { name: 'Connectez-vous une première fois avec du réseau' })).toBeVisible()
    await page.context().setOffline(false)

    await signInWithCode(page, emailB)
    await expect.poll(knownId).not.toBe(idA)
    const idB = await knownId()
    expect(idB).toBeTruthy()
    await expect.poll(keysOf).toEqual(expect.arrayContaining([`xxb.cards.v1.${idB}`]))
    expect((await keysOf()).some(k => k.includes(idA!))).toBe(false)

    await reloadOffline(page)
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    await expect(page.getByText(NOTICE)).toBeVisible()
    await expect(page.getByTitle(`Connecté : ${emailB}`)).toBeVisible()
    expect(await page.evaluate(id => Object.keys(localStorage).filter(k => k.includes(id)), idA!)).toEqual([])
    await page.context().setOffline(false)
  })
})
