import { expect, test } from './helpers'

/**
 * Connexion par numéro (SMS). Pile locale : le numéro de test 77 000 00 01 reçoit toujours le code 123456, sans SMS envoyé
 * ([auth.sms.test_otp] de supabase/config.toml). La production passe par la fonction send-sms et l'API SMS d'Orange.
 */
test.describe('Connexion par numéro de téléphone (SMS)', () => {
  test('numéro invalide refusé, puis numéro de test : code faux, puis bon code', async ({ page }) => {
    await page.goto('/?screen=revision')
    await page.getByRole('radio', { name: 'NUMÉRO' }).click()
    const field = page.getByLabel('TON NUMÉRO (SÉNÉGAL)')

    await field.fill('33 821 00 00')
    await page.getByRole('button', { name: 'Recevoir mon code par SMS' }).click()
    await expect(page.getByRole('alert')).toContainText('Numéro invalide')

    await field.fill('77 000 00 01')
    await page.getByRole('button', { name: 'Recevoir mon code par SMS' }).click()
    await expect(page.getByRole('heading', { name: 'Entre ton code' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('+221 77 000 00 01')).toBeVisible()

    // Envoi automatique au 6ᵉ chiffre.
    await page.getByLabel('CODE À 6 CHIFFRES').fill('000000')
    await expect(page.getByRole('alert')).toContainText('6 chiffres du SMS')

    await page.getByLabel('CODE À 6 CHIFFRES').fill('123456')
    await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'SE DÉCONNECTER' })).toBeVisible()
  })

  test('« Changer de numéro » garde la saisie ; retour à l’e-mail possible', async ({ page }) => {
    await page.goto('/?screen=revision')
    await page.getByRole('radio', { name: 'NUMÉRO' }).click()
    await page.getByLabel('TON NUMÉRO (SÉNÉGAL)').fill('770000001')
    await page.getByRole('button', { name: 'Recevoir mon code par SMS' }).click()
    await expect(page.getByRole('heading', { name: 'Entre ton code' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Changer de numéro' }).click()
    await expect(page.getByLabel('TON NUMÉRO (SÉNÉGAL)')).toHaveValue('77 000 00 01')
    await page.getByRole('radio', { name: 'E-MAIL' }).click()
    await expect(page.getByLabel('TON ADRESSE E-MAIL')).toBeVisible()
  })
})
