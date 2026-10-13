import { expect, test as base, type Page } from '@playwright/test'
import { MAILPIT } from '../playwright.config'

interface MailSummary { ID: string; Subject: string; To: Array<{ Address: string }> }

/** Adresse jamais vue par la pile locale (modèle « Confirm signup » au premier envoi). */
export const freshEmail = (tag: string): string => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

/** Attend le n-ième e-mail reçu par `email` dans Mailpit et renvoie son sujet et son texte. */
export async function waitForMail(email: string, count = 1): Promise<{ subject: string; text: string; html: string }> {
  let found: MailSummary[] = []
  await expect.poll(async () => {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    found = ((await r.json()) as { messages: MailSummary[] }).messages
    return found.length
  }, { timeout: 15_000, message: `e-mail pour ${email}` }).toBeGreaterThanOrEqual(count)
  // Mailpit liste du plus récent au plus ancien.
  const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${found[0].ID}`)).json()) as { Subject: string; Text: string; HTML: string }
  return { subject: msg.Subject, text: msg.Text, html: msg.HTML }
}

/** Code à 6 chiffres de l'e-mail : présent dans le sujet ET dans le corps (modèle A7). */
export function codeOf(mail: { subject: string; text: string }): string {
  const fromSubject = /\b(\d{6})\b/.exec(mail.subject)?.[1]
  const fromBody = /\b(\d{6})\b/.exec(mail.text)?.[1]
  expect(fromSubject, `code dans le sujet : « ${mail.subject} »`).toBeTruthy()
  expect(fromBody).toBe(fromSubject)
  return fromSubject!
}

/** Demande un lien depuis l'écran de connexion de la révision. */
export async function requestLink(page: Page, email: string): Promise<void> {
  await page.goto('/?screen=revision')
  await page.getByLabel('ADRESSE E-MAIL').fill(email)
  await page.getByRole('button', { name: 'Recevoir le lien de connexion' }).click()
  // L'envoi passe par le SMTP de la pile locale : jusqu'à plusieurs secondes au premier envoi.
  await expect(page.getByRole('heading', { name: 'Ouvrez le lien reçu' })).toBeVisible({ timeout: 20_000 })
}

/** Connexion complète par code ; renvoie quand l'écran du jour est affiché. */
export async function signInWithCode(page: Page, email: string, mailIndex = 1): Promise<void> {
  await requestLink(page, email)
  const code = codeOf(await waitForMail(email, mailIndex))
  await page.getByLabel('CODE À 6 CHIFFRES').fill(code)
  await page.getByRole('button', { name: 'Valider le code' }).click()
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
}

/** Toute requête vers un projet Supabase hébergé est bloquée et fait échouer le test : l'E2E ne touche jamais la production. */
export const test = base.extend<{ remoteGuard: string[] }>({
  remoteGuard: [async ({ page }, use) => {
    const hits: string[] = []
    await page.route(/supabase\.co/, route => { hits.push(route.request().url()); return route.abort() })
    await use(hits)
    expect(hits, 'requêtes vers un Supabase distant').toEqual([])
  }, { auto: true }],
})

export { expect }
