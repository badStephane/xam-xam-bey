import type { Page } from '@playwright/test'
import { expect, freshEmail, signInWithCode, test } from './helpers'

/**
 * Enquête « déconnexion mobile » (lot 4) : au retour sur l'onglet, le jeton d'accès est expiré et la réponse du
 * rafraîchissement arrive après le délai de 15 s du client. Pile Supabase LOCALE (ports 553xx), rotation des jetons et
 * fenêtre de réutilisation de 10 s (supabase/config.toml). Le client coupe la requête (le serveur a déjà fait tourner le
 * jeton) puis la redemande avec l'ancien jeton après la fenêtre : GoTrue rend le jeton actif (parent accepté), pas de
 * déconnexion. Garde de non-régression de cette conclusion.
 */
const AUTH_KEY = 'sb-127-auth-token'
/** Plus long que le délai de 15 s du client (SUPABASE_TIMEOUT_MS) et que la fenêtre de réutilisation de 10 s. */
const SLOW_RESPONSE_MS = 17_000

const refreshTokenOf = (page: Page): Promise<string | null> =>
  page.evaluate(key => (JSON.parse(localStorage.getItem(key) || 'null') as { refresh_token?: string } | null)?.refresh_token ?? null, AUTH_KEY)

test('retour sur l’onglet, jeton expiré, réponse de rafraîchissement lente : toujours connecté', async ({ page }) => {
  test.setTimeout(120_000)
  await signInWithCode(page, freshEmail('slow-refresh'))
  const before = await refreshTokenOf(page)
  expect(before).toBeTruthy()

  // Le serveur reçoit la demande et fait tourner le jeton ; seule la première réponse arrive en retard.
  let calls = 0
  await page.route('**/auth/v1/token?grant_type=refresh_token', async route => {
    calls += 1
    const response = await route.fetch()
    if (calls === 1) await new Promise(resolve => setTimeout(resolve, SLOW_RESPONSE_MS))
    // La page a pu abandonner la requête entre-temps (ancien comportement) : rien à livrer.
    await route.fulfill({ response }).catch(() => undefined)
  })

  // Onglet resté en arrière-plan : jeton d'accès donné pour expiré, puis retour sur l'onglet.
  await page.evaluate(key => {
    const s = JSON.parse(localStorage.getItem(key) || '{}') as { expires_at?: number }
    localStorage.setItem(key, JSON.stringify({ ...s, expires_at: Math.floor(Date.now() / 1000) - 60 }))
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  }, AUTH_KEY)

  await expect.poll(() => refreshTokenOf(page), { timeout: SLOW_RESPONSE_MS + 15_000, intervals: [1_000] }).not.toBe(before)
  expect(await refreshTokenOf(page)).not.toBeNull()
  // Premier envoi coupé par le délai du client, second avec le même jeton (au-delà de la fenêtre de 10 s) : accepté.
  expect(calls).toBe(2)
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()

  // Le nouveau jeton est bien celui du serveur : rechargé, réseau normal, toujours connecté.
  await page.unroute('**/auth/v1/token?grant_type=refresh_token')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Connectez-vous pour réviser' })).toHaveCount(0)
})
