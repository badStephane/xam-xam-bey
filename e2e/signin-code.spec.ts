import { codeOf, expect, freshEmail, requestLink, signInWithCode, test, waitForMail } from './helpers'

test.describe('Connexion par code à 6 chiffres (D4)', () => {
  test('adresse neuve (Confirm signup) puis adresse connue (Magic Link) : le code connecte', async ({ page, context }) => {
    const email = freshEmail('code')

    // 1. Adresse neuve : modèle « Confirm signup ».
    await signInWithCode(page, email, 1)
    const signup = await waitForMail(email, 1)
    expect(signup.subject).toMatch(/^Bienvenue sur Xam Xam Bëy : code \d{6}$/)
    await expect(page.getByRole('button', { name: 'SE DÉCONNECTER' })).toBeVisible()

    // 2. Déconnexion, puis même adresse : modèle « Magic Link ».
    await page.getByRole('button', { name: 'SE DÉCONNECTER' }).click()
    await expect(page.getByRole('heading', { name: 'Connectez-vous pour réviser' })).toBeVisible()
    await context.clearCookies()
    await signInWithCode(page, email, 2)
    const magic = await waitForMail(email, 2)
    expect(magic.subject).toMatch(/^Votre connexion à Xam Xam Bëy : code \d{6}$/)
    expect(magic.html).toContain('Me connecter à la révision')
  })

  test('code faux : message d’erreur, puis le bon code connecte', async ({ page }) => {
    const email = freshEmail('wrong')
    await requestLink(page, email)
    const code = codeOf(await waitForMail(email))
    const wrong = code === '000000' ? '111111' : '000000'
    await page.getByLabel('CODE À 6 CHIFFRES').fill(wrong)
    await page.getByRole('button', { name: 'Valider le code' }).click()
    await expect(page.getByRole('alert')).toContainText('Code incorrect ou expiré')
    await page.getByLabel('CODE À 6 CHIFFRES').fill(code)
    await page.getByRole('button', { name: 'Valider le code' }).click()
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
  })

  test('« Renvoyer » attend 60 s ; code collé avec espaces accepté', async ({ page }) => {
    const email = freshEmail('resend')
    await requestLink(page, email)
    await expect(page.getByRole('button', { name: /^Renvoyer dans \d+ s$/ })).toBeDisabled()
    const code = codeOf(await waitForMail(email))
    await page.getByLabel('CODE À 6 CHIFFRES').fill(`${code.slice(0, 3)} ${code.slice(3)}`)
    await expect(page.getByLabel('CODE À 6 CHIFFRES')).toHaveValue(code)
    await page.getByRole('button', { name: 'Valider le code' }).click()
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
  })
})
