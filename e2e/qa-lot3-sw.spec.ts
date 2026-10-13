import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { LOCAL_API } from '../playwright.config'
import { expect, test } from './helpers'

/**
 * QA lot 3 (docs/squad/12-qa-lot3.md) : attaques sur le service worker, sur un BUILD de production servi par
 * `vite preview` (port 4181, dossier node_modules/.cache, jamais dist/). Pile Supabase LOCALE (553xx).
 *  - aucune réponse REST, Auth, ni adresse de retour du lien magique dans les caches du site ;
 *  - le message « xxb-keep-pdf » ne fait garder que des PDF du bucket public, rien d'autre.
 */
const PORT = 4181
const ORIGIN = `http://localhost:${PORT}`
const OUT_DIR = fileURLToPath(new URL('../node_modules/.cache/xxb-e2e-qa-lot3', import.meta.url))
const LOCAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const BUILD_ENV = { ...process.env, VITE_SUPABASE_URL: LOCAL_API, VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY }
const FILE = 'qa-lot3-sw.pdf'
const PDF_URL = `${LOCAL_API}/storage/v1/object/public/documents/${FILE}`
const TINY_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1')

function serviceKey(): string {
  const env = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const key = /^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m.exec(env)?.[1]
  if (!key) throw new Error('[qa] clé service de la pile locale introuvable')
  return key
}

async function storage(method: 'POST' | 'DELETE'): Promise<void> {
  const key = serviceKey()
  const res = await fetch(`${LOCAL_API}/storage/v1/object/documents/${FILE}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/pdf', 'x-upsert': 'true' },
    body: method === 'POST' ? TINY_PDF : undefined,
  })
  if (!res.ok && method === 'POST') throw new Error(`[qa] envoi du PDF : ${res.status}`)
}

let preview: ChildProcess | null = null

test.beforeAll(async () => {
  test.setTimeout(180_000)
  await storage('POST')
  execFileSync('npx', ['vite', 'build', '--outDir', OUT_DIR, '--emptyOutDir'], { env: BUILD_ENV, stdio: 'ignore' })
  preview = spawn('npx', ['vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'], { env: BUILD_ENV, stdio: 'ignore' })
  const end = Date.now() + 30_000
  while (Date.now() < end && !(await fetch(ORIGIN).then(r => r.ok, () => false))) await new Promise(r => setTimeout(r, 250))
})

test.afterAll(async () => {
  preview?.kill()
  await storage('DELETE')
})

async function visitAndWaitForWorker(page: Page): Promise<void> {
  await page.goto(`${ORIGIN}/`)
  await expect(page.getByRole('heading', { name: 'Toutes les ressources du mouvement.' })).toBeVisible()
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 20_000 })
}

/** Toutes les adresses gardées dans les caches du site (xxb-*). */
const cachedUrls = (page: Page): Promise<string[]> => page.evaluate(async () => {
  const names = (await caches.keys()).filter(n => n.startsWith('xxb-'))
  const lists = await Promise.all(names.map(async n => (await (await caches.open(n)).keys()).map(k => k.url)))
  return lists.flat()
})

test('L3 QA : ni REST, ni Auth, ni retour du lien magique dans les caches du worker', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await visitAndWaitForWorker(page)
  // Catalogue lu par REST sous le contrôle du worker, puis retours d'Auth simulés (code PKCE, jetons en fragment).
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Toutes les ressources du mouvement.' })).toBeVisible()
  const pkce = await page.goto(`${ORIGIN}/?screen=revision&code=qa-secret-code`)
  expect(pkce?.fromServiceWorker(), 'retour ?code= jamais servi par le worker').toBe(false)
  await page.goto(`${ORIGIN}/?token_hash=qa-secret-hash&type=magiclink`)
  await page.goto(`${ORIGIN}/#access_token=qa-secret-token&refresh_token=qa-secret-refresh`)
  const rest = await page.evaluate(async ({ api, key }) => {
    const r = await fetch(`${api}/rest/v1/documents?select=id&limit=1`, { headers: { apikey: key } })
    return r.status
  }, { api: LOCAL_API, key: LOCAL_ANON_KEY })
  expect(rest).toBe(200)
  const urls = await cachedUrls(page)
  expect(urls.length, 'la coquille est bien gardée').toBeGreaterThan(0)
  expect(urls.filter(u => /\/rest\/v1\/|\/auth\/v1\/|code=|token|qa-secret/.test(u))).toEqual([])
})

test('L3 QA : « xxb-keep-pdf » ne fait garder que des PDF du bucket public', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await visitAndWaitForWorker(page)
  const hostile = [
    `${LOCAL_API}/rest/v1/documents?select=*`,
    `${LOCAL_API}/auth/v1/user`,
    `${LOCAL_API}/storage/v1/object/public/documents/${FILE}?download=x`,
    `${LOCAL_API}/storage/v1/object/public/documents/../../../../rest/v1/cards`,
    `${LOCAL_API}/storage/v1/object/public/documents/%2e%2e/%2e%2e/%2e%2e/%2e%2e/rest/v1/cards`,
    `${LOCAL_API}/storage/v1/object/public/autre/${FILE}`,
    `${LOCAL_API}/storage/v1/object/authenticated/documents/${FILE}`,
    `https://example.invalid/storage/v1/object/public/documents/${FILE}`,
    `${ORIGIN}/index.html`,
    'javascript:alert(1)',
  ]
  await page.evaluate(list => {
    const c = navigator.serviceWorker.controller!
    list.forEach(url => c.postMessage({ type: 'xxb-keep-pdf', url }))
    c.postMessage({ type: 'xxb-keep-pdf' })
    c.postMessage({ type: 'xxb-keep-pdf', url: { href: 'x' } })
    c.postMessage({ type: 'xxb-keep-pdf', url: ['x'] })
  }, hostile)
  // Témoin positif : une demande valide est honorée (le mécanisme marche, les refus ne sont pas dus à une panne).
  await page.evaluate(url => navigator.serviceWorker.controller!.postMessage({ type: 'xxb-keep-pdf', url }), PDF_URL)
  // keys() et non match() : Chrome peut voir l'entrée par match() avant que keys() ne la liste (écriture en cours).
  // Les refus sont traités avant le témoin (messages dans l'ordre) : une fois le témoin listé, la liste est complète.
  const kept = (): Promise<string[]> => page.evaluate(async () => (await (await caches.open('xxb-pdf-v1')).keys()).map(k => k.url))
  await expect.poll(kept, { timeout: 20_000 }).toContain(PDF_URL)
  expect(await kept()).toEqual([PDF_URL])
})
