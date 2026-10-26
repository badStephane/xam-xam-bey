import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { LOCAL_API } from '../playwright.config'
import { expect, test } from './helpers'

/**
 * E3 (lot 3) : hors ligne minimal. Seul E2E où le service worker s'inscrit : il tourne sur un BUILD de production
 * (`vite build` puis `vite preview`), jamais sur le serveur de dev des autres E2E. Pile Supabase LOCALE (ports 553xx).
 * Le build va dans node_modules/.cache (jamais dist/, qui part en production) et vise la pile locale.
 */
const PORT = 4180
const ORIGIN = `http://localhost:${PORT}`
const OUT_DIR = fileURLToPath(new URL('../node_modules/.cache/xxb-e2e-offline', import.meta.url))
const DB_CONTAINER = 'supabase_db_xam-xam-bey'
/** Clé anon de démonstration de la CLI Supabase (publique, pile locale seulement), identique à playwright.config.ts. */
const LOCAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const TITLE = 'E2E hors ligne fiche de camp'
const FILE = 'e2e-hors-ligne.pdf'
/** Pièce jamais ouverte (aucun fichier) : hors réseau, un message remplace le bouton. */
const ABSENT_TITLE = 'E2E hors ligne piece absente'
const ABSENT_FILE = 'e2e-hors-ligne-absente.pdf'
const TEST_FILES = `('${FILE}', '${ABSENT_FILE}')`
const PDF_URL = `${LOCAL_API}/storage/v1/object/public/documents/${FILE}`
const BUILD_ENV = { ...process.env, VITE_SUPABASE_URL: LOCAL_API, VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY }

const sql = (query: string): string =>
  execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', query], { encoding: 'utf8' }).trim()

/** Clé service de la pile locale, lue à la volée (jamais écrite dans le dépôt). */
function serviceKey(): string {
  const env = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const key = /^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m.exec(env)?.[1]
  if (!key) throw new Error('[e2e] clé service de la pile locale introuvable (supabase status)')
  return key
}

/** PDF minimal d'une page, construit ici (aucune dépendance aux documents de l'association). */
function tinyPdf(text: string): Buffer {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((o, i) => {
    const at = body.length
    body += `${i + 1} 0 obj\n${o}\nendobj\n`
    return at
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

async function storage(method: 'POST' | 'DELETE', body?: Buffer): Promise<void> {
  const key = serviceKey()
  const res = await fetch(`${LOCAL_API}/storage/v1/object/documents/${FILE}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/pdf', 'x-upsert': 'true' },
    body,
  })
  if (!res.ok && method === 'POST') throw new Error(`[e2e] envoi du PDF de test : ${res.status} ${await res.text()}`)
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

// Test sous CSP : un document servi par page.route est vu comme « public » par Chrome ; ce drapeau laisse passer la pile
// locale (loopback), sans rien changer à la CSP testée. Sans effet sur les autres tests du fichier.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks'] } })

test.beforeAll(async () => {
  test.setTimeout(180_000)
  const pdf = tinyPdf('Hors ligne')
  await storage('POST', pdf)
  sql(`delete from public.documents where storage_path in ${TEST_FILES}`)
  sql(`insert into public.documents (zone, title, folder, file_name, storage_path, size, pages) values (1, '${ABSENT_TITLE}', 'E2E', '${ABSENT_FILE}', '${ABSENT_FILE}', 1000, 1)`)
  sql(`insert into public.documents (zone, title, folder, file_name, storage_path, size, pages) values (1, '${TITLE}', 'E2E', '${FILE}', '${FILE}', ${pdf.length}, 1)`)
  execFileSync('npx', ['vite', 'build', '--outDir', OUT_DIR, '--emptyOutDir'], { env: BUILD_ENV, stdio: 'ignore' })
  preview = spawn('npx', ['vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'], { env: BUILD_ENV, stdio: 'ignore' })
  await waitForServer(ORIGIN, 30_000)
})

test.afterAll(async () => {
  preview?.kill()
  sql(`delete from public.documents where storage_path in ${TEST_FILES}`)
  await storage('DELETE')
})

/** Première visite : le service worker s'installe après le chargement, puis prend la main sur la page. */
async function visitAndWaitForWorker(page: Page): Promise<void> {
  await page.goto(`${ORIGIN}/`)
  await expect(page.getByRole('heading', { name: 'Toutes les ressources du mouvement.' })).toBeVisible()
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 20_000 })
}

async function openTestDoc(page: Page, viewer: string): Promise<void> {
  await page.getByLabel('Rechercher par titre, dossier ou cote').fill('hors ligne fiche')
  await page.getByRole('button', { name: `Ouvrir ${TITLE}` }).click()
  await expect(page.locator(`${viewer} canvas`).first()).toBeVisible({ timeout: 20_000 })
}

/** Hors réseau, le PDF doit venir du service worker (et non d'un cache HTTP du navigateur). */
async function openTestDocOffline(page: Page, viewer: string): Promise<void> {
  const fromWorker = page.waitForResponse(r => r.url() === PDF_URL)
  await openTestDoc(page, viewer)
  expect((await fromWorker).fromServiceWorker()).toBe(true)
}

/** Hors réseau, une pièce jamais ouverte n'offre aucun lien : un message à la place du bouton. */
async function expectAbsentUnavailable(page: Page): Promise<void> {
  await page.getByLabel('Rechercher par titre, dossier ou cote').fill('piece absente')
  await expect(page.getByText('Hors réseau : pas encore ouvert sur cet appareil')).toBeVisible()
  await expect(page.getByRole('button', { name: `Ouvrir ${ABSENT_TITLE}` })).toHaveCount(0)
  await expect(page.getByRole('link', { name: new RegExp(`Ouvrir ${ABSENT_TITLE}`) })).toHaveCount(0)
}

async function goOfflineAndReload(page: Page): Promise<void> {
  await page.context().setOffline(true)
  const res = await page.reload()
  expect(res?.fromServiceWorker(), 'page servie par le service worker').toBe(true)
  await expect(page.getByRole('heading', { name: 'Toutes les ressources du mouvement.' })).toBeVisible()
  await expect(page.getByText('Les documents déjà ouverts sur cet appareil restent lisibles', { exact: false })).toBeVisible()
}

/** CSP de production (public/_headers), le projet Supabase hébergé remplacé par la pile locale. */
function prodCsp(): string {
  const csp = /Content-Security-Policy: (.+)/.exec(readFileSync(fileURLToPath(new URL('../public/_headers', import.meta.url)), 'utf8'))?.[1] ?? ''
  if (!csp) throw new Error('[e2e] CSP introuvable dans public/_headers')
  return csp.replace(/https:\/\/[\w-]+\.supabase\.co/g, LOCAL_API).replace(/wss:\/\/[\w-]+\.supabase\.co/g, LOCAL_API.replace('http', 'ws'))
}

const isKept = (page: Page): Promise<unknown> =>
  page.waitForFunction(async url => !!(await (await caches.open('xxb-pdf-v1')).match(url)), PDF_URL, { timeout: 20_000 })

// Les deux derniers tests reconstruisent le site (nouvelle version, puis worker de secours) : ils restent en fin de fichier,
// le build de départ est refait par beforeAll à chaque lancement.
test.describe('hors ligne (E3)', () => {
  test('ordinateur : un PDF ouvert reste lisible après rechargement hors réseau', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await visitAndWaitForWorker(page)
    await openTestDoc(page, '.pdf-thumb')
    await isKept(page)
    await expect(page.getByText('HORS LIGNE', { exact: true }).first()).toBeVisible()

    await goOfflineAndReload(page)
    await openTestDocOffline(page, '.pdf-thumb')
    await expect(page.getByRole('link', { name: 'Plein écran' })).toHaveCount(0)
    await expectAbsentUnavailable(page)

    // Retour du lien magique : jamais servi par le worker, l'adresse avec ses jetons part au réseau (ici coupé).
    await expect(page.goto(`${ORIGIN}/?screen=revision&code=e2e-offline`)).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/)
    await page.context().setOffline(false)
  })

  test('téléphone : en ligne, lecteur du téléphone et PDF gardé en parallèle ; hors réseau, aperçu du site depuis le cache', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await visitAndWaitForWorker(page)
    await page.getByLabel('Rechercher par titre, dossier ou cote').fill('hors ligne fiche')
    // En ligne : lien vers le lecteur du téléphone (nouvel onglet), aucun aperçu intégré ; le worker garde le PDF à côté.
    const popup = page.waitForEvent('popup')
    await page.getByRole('link', { name: `Ouvrir ${TITLE} dans un nouvel onglet` }).click()
    await (await popup).close()
    await expect(page.locator('.viewer')).toHaveCount(0)
    await isKept(page)
    // Repère affiché quand le worker a fini : PDF et lecteur (pdf.js, jamais chargé par la page) gardés.
    await expect(page.getByText('HORS LIGNE', { exact: true }).first()).toBeVisible()

    await goOfflineAndReload(page)
    // Hors réseau et PDF gardé : bouton vers l'aperçu du site, lu depuis le worker ; aucun lien mort.
    await expect(page.getByRole('link', { name: `Ouvrir ${TITLE} dans un nouvel onglet` })).toHaveCount(0)
    await openTestDocOffline(page, '.viewer')
    await expect(page.getByRole('link', { name: 'TÉLÉCHARGER' })).toHaveCount(0)
    await page.getByRole('button', { name: '← RETOUR' }).click()
    await expectAbsentUnavailable(page)
    await page.context().setOffline(false)
  })

  test.describe('sous la CSP de production', () => {
    test('E5 : polices du site, aucune requête Google Fonts ; le worker s’inscrit et garde le PDF', async ({ page }) => {
      const csp = prodCsp()
      expect(csp).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
      await page.route(url => url.host === `localhost:${PORT}` && url.pathname === '/', async route => {
        const res = await route.fetch()
        return route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } })
      })
      const violations: string[] = []
      const thirdParty: string[] = []
      page.on('console', m => { if (/Content Security Policy/.test(m.text())) violations.push(m.text().slice(0, 200)) })
      page.on('request', r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) thirdParty.push(r.url()) })
      await page.setViewportSize({ width: 1280, height: 900 })
      await visitAndWaitForWorker(page)
      expect(await page.evaluate(async () => {
        await document.fonts.ready
        return ['700 16px "Chakra Petch"', '400 16px "JetBrains Mono"'].map(f => document.fonts.check(f))
      })).toEqual([true, true])
      await openTestDoc(page, '.pdf-thumb')
      await isKept(page)
      expect(thirdParty, 'aucune requête vers Google Fonts').toEqual([])
      expect(violations, 'aucune violation CSP').toEqual([])
    })
  })

  test('UX-37 : installable selon Chrome (manifeste, icônes, worker) ; manifeste et icônes hors de la coquille', async ({ page }) => {
    await visitAndWaitForWorker(page)
    const cdp = await page.context().newCDPSession(page)
    const { url, errors } = await cdp.send('Page.getAppManifest')
    expect(url).toBe(`${ORIGIN}/manifest.webmanifest`)
    expect(errors).toEqual([])
    expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([])
    const shell = await page.evaluate(async () => {
      const name = (await caches.keys()).find(n => n.startsWith('xxb-shell-'))
      return name ? (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname) : []
    })
    expect(shell).toContain('/index.html')
    expect(shell.filter(p => /manifest|\/icons\//.test(p))).toEqual([])
  })

  test('L3-3 et L3-4 : page HTML de repli jamais gardée comme script ; lien avec paramètres de suivi servi hors réseau', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await visitAndWaitForWorker(page)
    // Comme Cloudflare Pages sans 404.html, vite preview répond index.html en 200 à un fichier haché disparu.
    const gone = `${ORIGIN}/assets/disparu-L33abc.js`
    const type = await page.evaluate(async url => (await fetch(url)).headers.get('content-type'), gone)
    expect(type).toMatch(/text\/html/)
    // Témoin : un vrai fichier chargé à la demande (lecteur PDF) est gardé ; le faux, jamais.
    await openTestDoc(page, '.pdf-thumb')
    const runtime = (): Promise<string[]> => page.evaluate(async () => (await (await caches.open('xxb-rt-v1')).keys()).map(k => k.url))
    await expect.poll(async () => (await runtime()).some(u => /\/assets\/PdfViewer-/.test(u)), { timeout: 20_000 }).toBe(true)
    expect(await runtime()).not.toContain(gone)

    await page.context().setOffline(true)
    const shared = await page.goto(`${ORIGIN}/?utm_source=whatsapp&utm_medium=social&fbclid=IwAR0e2e`)
    expect(shared?.fromServiceWorker(), 'lien partagé servi par le worker').toBe(true)
    await expect(page.getByRole('heading', { name: 'Toutes les ressources du mouvement.' })).toBeVisible()
    // Paramètres de suivi et retour du lien magique ensemble : toujours le réseau (ici coupé).
    await expect(page.goto(`${ORIGIN}/?utm_source=whatsapp&code=e2e-l34`)).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/)
    await page.context().setOffline(false)
  })

  test('L3-6 : un PDF remplacé au même chemin est rafraîchi en arrière-plan, à l’aperçu comme à l’ouverture sur téléphone', async ({ page }) => {
    test.setTimeout(90_000)
    const keptText = (): Promise<string> => page.evaluate(async url => {
      const r = await (await caches.open('xxb-pdf-v1')).match(url)
      return r ? r.text() : ''
    }, PDF_URL)
    // Last-Modified est à la seconde près : on laisse passer une seconde avant chaque remplacement.
    const replaceWith = async (text: string): Promise<void> => {
      await page.waitForTimeout(1_100)
      await storage('POST', tinyPdf(text))
    }
    try {
      await page.setViewportSize({ width: 1280, height: 900 })
      await visitAndWaitForWorker(page)
      await openTestDoc(page, '.pdf-thumb')
      await isKept(page)
      expect(await keptText()).toContain('(Hors ligne)')

      // Aperçu (pdf.js passe par le worker) : copie gardée servie tout de suite, puis remplacée en arrière-plan.
      await replaceWith('Version corrigee')
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Toutes les ressources du mouvement.' })).toBeVisible()
      const served = page.waitForResponse(r => r.url() === PDF_URL)
      await openTestDoc(page, '.pdf-thumb')
      expect((await served).fromServiceWorker()).toBe(true)
      await expect.poll(keptText, { timeout: 20_000 }).toContain('(Version corrigee)')

      // Ouverture dans le lecteur du téléphone : la page envoie « xxb-keep-pdf », le worker revalide le PDF déjà gardé.
      await replaceWith('Troisieme version')
      await page.evaluate(url => navigator.serviceWorker.controller!.postMessage({ type: 'xxb-keep-pdf', url }), PDF_URL)
      await expect.poll(keptText, { timeout: 20_000 }).toContain('(Troisieme version)')
      const entries = await page.evaluate(async () => (await (await caches.open('xxb-pdf-v1')).keys()).length)
      expect(entries, 'une seule entrée : remplacée, pas dupliquée').toBe(1)
    } finally {
      await storage('POST', tinyPdf('Hors ligne'))
    }
  })

  test('mise à jour : un nouveau déploiement remplace la coquille, purge l’ancienne et garde les PDF', async ({ page }) => {
    test.setTimeout(120_000)
    const shells = (): Promise<string[]> => page.evaluate(async () => (await caches.keys()).filter(n => n.startsWith('xxb-shell-')))
    await page.setViewportSize({ width: 1280, height: 900 })
    await visitAndWaitForWorker(page)
    await openTestDoc(page, '.pdf-thumb')
    await isKept(page)
    const before = await shells()
    expect(before).toHaveLength(1)
    // Nouveau build (contenu différent : nouvelle version), servi à chaud comme après un déploiement.
    execFileSync('npx', ['vite', 'build', '--outDir', OUT_DIR, '--emptyOutDir'], { env: { ...BUILD_ENV, VITE_SUPABASE_ANON_KEY: `${LOCAL_ANON_KEY}-v2` }, stdio: 'ignore' })
    await page.reload()
    // Nouvelle coquille installée puis ancienne purgée à l'activation : un seul cache, différent du premier.
    await expect.poll(async () => { const now = await shells(); return now.length === 1 && now[0] !== before[0] }, { timeout: 20_000 }).toBe(true)
    await isKept(page)
    // Après la mise à jour, le PDF gardé reste lisible hors réseau (lecteur gardé d'une version à l'autre).
    await goOfflineAndReload(page)
    await openTestDocOffline(page, '.pdf-thumb')
    await page.context().setOffline(false)
  })

  test('secours : un build VITE_SW=off désinscrit le worker et purge les caches du site', async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    await visitAndWaitForWorker(page)
    execFileSync('npx', ['vite', 'build', '--outDir', OUT_DIR, '--emptyOutDir'], { env: { ...BUILD_ENV, VITE_SW: 'off' }, stdio: 'ignore' })
    await page.reload()
    await expect.poll(() => page.evaluate(async () => ({
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      caches: (await caches.keys()).filter(n => n.startsWith('xxb-')).length,
    })), { timeout: 20_000 }).toEqual({ workers: 0, caches: 0 })
  })
})
