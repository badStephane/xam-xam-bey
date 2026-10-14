import { randomUUID } from 'node:crypto'
import { expect, freshEmail, signInWithCode, test } from './helpers'
import { sql } from './qa-import-helpers'

/**
 * QA lot 5 (docs/squad/18-qa-lot5.md) : onglet Admin PSEUDOS (P-H) et mots refusés (A10), pile Supabase LOCALE (553xx).
 * Un scout signalé est créé directement en base, puis retiré par l'admin depuis l'écran ; aucun e-mail n'est affiché.
 */
const suffix = (): string => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')

test('admin : scout signalé en tête, REFUSER avec confirmation, pseudo retiré et interdit ; mots refusés ajoutés puis retirés', async ({ page }) => {
  test.setTimeout(90_000)
  const target = randomUUID()
  const reporter = randomUUID()
  const pseudo = `QaCible${suffix()}`
  const key = pseudo.toLowerCase()
  const word = `qamot${suffix()}`
  const targetMail = `qa5-target-${suffix()}@example.com`
  sql(`insert into auth.users (id, email, aud, role, created_at) values ('${target}', '${targetMail}', 'authenticated', 'authenticated', now()),
       ('${reporter}', 'qa5-rep-${suffix()}@example.com', 'authenticated', 'authenticated', now())`)
  sql(`insert into public.scout_profiles (user_id, pseudo, pseudo_key, pseudo_state, pseudo_changed_at) values ('${target}', '${pseudo}', '${key}', 'ok', now())`)
  sql(`insert into public.pseudo_reports (reporter_id, target_id, pseudo_key) values ('${reporter}', '${target}', '${key}')`)
  try {
    const email = freshEmail('qa5-admin')
    await signInWithCode(page, email)
    sql(`insert into public.admins (email) values ('${email.toLowerCase()}') on conflict do nothing`)
    await page.goto('/?screen=admin')
    await page.getByRole('navigation', { name: 'Administration' }).getByRole('button', { name: 'PSEUDOS' }).click()

    // Signalés d'abord : le scout signalé est dans la première ligne, avec son compteur, sans e-mail.
    const first = page.locator('li.adm-pseudo').first()
    await expect(first).toContainText(pseudo)
    await expect(first).toContainText('1 SIGNALEMENT')
    await expect(page.getByRole('region', { name: 'Pseudos' })).not.toContainText(targetMail)

    // Recherche sans casse, filtre SIGNALÉS.
    await page.getByLabel('Rechercher un pseudo').fill(key.toUpperCase())
    await page.getByRole('button', { name: 'RECHERCHER' }).click()
    await expect(page.locator('li.adm-pseudo')).toHaveCount(1)
    await page.getByRole('button', { name: 'SIGNALÉS' }).click()
    await expect(page.locator('li.adm-pseudo')).toHaveCount(1)

    // REFUSER : confirmation en ligne, ANNULER puis RETIRER.
    await page.getByRole('button', { name: 'REFUSER', exact: true }).click()
    await expect(page.getByText(`Retirer ${pseudo} ? Le scout devra choisir un autre pseudo.`)).toBeVisible()
    await page.getByRole('button', { name: 'ANNULER' }).click()
    expect(sql(`select pseudo_state from public.scout_profiles where user_id = '${target}'`)).toBe('ok')
    await page.getByRole('button', { name: 'REFUSER', exact: true }).click()
    await page.getByRole('button', { name: 'RETIRER', exact: true }).click()
    await expect(page.locator('li.adm-pseudo')).toHaveCount(0)
    await expect(page.getByText('Aucun signalement.')).toBeVisible()
    expect(sql(`select pseudo_state || coalesce(pseudo, '-') from public.scout_profiles where user_id = '${target}'`)).toBe('reset-')
    expect(sql(`select exact from public.pseudo_blocklist where word = '${key}'`)).toBe('t')
    expect(sql(`select count(*) from public.pseudo_reports where target_id = '${target}' and dismissed_at is null`)).toBe('0')

    // Mots refusés : ajout normalisé (espace et casse retirés), message, pastille, retrait.
    await page.getByText(/^MOTS REFUSÉS/).click()
    await page.getByLabel('Mot à refuser').fill(` ${word.toUpperCase()} `)
    await page.getByRole('button', { name: 'AJOUTER' }).click()
    await expect(page.getByText(`Ajouté : ${word}. Les pseudos existants ne changent pas : cherchez-les et réinitialisez-les.`)).toBeVisible()
    expect(sql(`select exact from public.pseudo_blocklist where word = '${word}'`)).toBe('f')
    await page.getByLabel('Mot à refuser').fill('x')
    await page.getByRole('button', { name: 'AJOUTER' }).click()
    await expect(page.getByText('Mot refusé : 2 à 30 caractères.')).toBeVisible()
    await page.getByRole('button', { name: `Retirer ${word}` }).click()
    await expect(page.getByRole('button', { name: `Retirer ${word}` })).toHaveCount(0)
    expect(sql(`select count(*) from public.pseudo_blocklist where word = '${word}'`)).toBe('0')
  } finally {
    sql(`delete from public.pseudo_blocklist where word in ('${key}', '${word}')`)
    sql(`delete from auth.users where id in ('${target}', '${reporter}')`)
  }
})
