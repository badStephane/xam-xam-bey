import { readFileSync } from 'node:fs'
import { expect, test } from './helpers'
import { cleanup, fixture, openImport } from './qa-import-helpers'

/**
 * IM-5 (docs/squad/10-qa-import.md) : gros classeur sous la CSP de production. fflate décompresse les parties
 * de plus de 512 Kio dans un Worker créé depuis une URL blob:, que `script-src 'self'` interdit.
 * Un document servi par page.route est vu comme « public » par Chrome : le drapeau ci-dessous laisse passer
 * les appels vers la pile locale (loopback), sans rien changer à la CSP testée.
 */
test.use({ viewport: { width: 360, height: 740 }, launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks'] } })
test.beforeEach(cleanup)
test.afterAll(cleanup)

/** Directive script-src de public/_headers ; 'unsafe-inline' seulement pour le préambule React de `vite dev`. */
function prodScriptSrc(): string {
  const csp = /Content-Security-Policy: (.+)/.exec(readFileSync(fixture('../public/_headers'), 'utf8'))?.[1] ?? ''
  return `script-src ${/script-src ([^;]+)/.exec(csp)?.[1].trim() ?? ''} 'unsafe-inline'`
}

test('IM-5 : gros classeur lu sous la CSP de production', async ({ page }) => {
  // IM-5 corrigé : décompression synchrone, aucun Worker blob:, CSP inchangée.
  const policy = prodScriptSrc()
  await page.route(url => url.host === 'localhost:5173' && url.pathname === '/', async route => {
    const res = await route.fetch()
    return route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': policy } })
  })
  const logs: string[] = []
  const workers: string[] = []
  page.on('console', m => { if (m.type() === 'error') logs.push(m.text().slice(0, 200)) })
  page.on('worker', w => workers.push(w.url()))
  await openImport(page, 'qa-big-csp')
  await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(fixture('./fixtures/qa/big.xlsx'))
  await expect(page.getByRole('status').filter({ hasText: 'Rien n’est encore enregistré' }), logs.join('\n'))
    .toHaveText(/900 lignes valides/, { timeout: 20_000 })
  expect(workers, 'aucun Worker pendant la lecture').toEqual([])
  expect(logs.filter(l => /Content Security Policy/.test(l)), 'aucune violation CSP').toEqual([])
})
