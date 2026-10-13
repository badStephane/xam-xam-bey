import { expect, freshEmail, requestLink, test, waitForMail } from './helpers'

/** Lien de l'e-mail (texte brut de Mailpit : « libellé ( URL ) »). */
const linkOf = (text: string): string => {
  const link = /\( (http:\/\/127\.0\.0\.1:55321\/auth\/v1\/verify[^ )]+) \)/.exec(text)?.[1]
  expect(link, 'lien dans l’e-mail').toBeTruthy()
  return link!
}

test.describe('Retour du lien magique (point 7)', () => {
  test('le lien ouvert dans un nouvel onglet connecte, sans jeton visible dans l’adresse', async ({ page, context }) => {
    const email = freshEmail('link')
    await requestLink(page, email)
    const tab = await context.newPage()
    await tab.goto(linkOf((await waitForMail(email)).text))
    await expect(tab.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible({ timeout: 15_000 })
    await expect(tab).not.toHaveURL(/access_token/)
  })

  // L2-1 : supabase-js efface les jetons par `location.hash = ''`, ce qui AJOUTE une entrée d'historique.
  // Le site saute cette entrée morte au premier retour, après en avoir effacé les jetons.
  test('L2-1 : le premier retour après le lien ne réaffiche pas les jetons et ne reste pas sur place', async ({ page, context }) => {
    const email = freshEmail('linkback')
    await requestLink(page, email)
    const tab = await context.newPage()
    await tab.goto(linkOf((await waitForMail(email)).text))
    await expect(tab.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible({ timeout: 15_000 })
    await tab.goBack()
    await expect(tab).not.toHaveURL(/access_token|refresh_token/, { timeout: 2_000 })
  })
})
