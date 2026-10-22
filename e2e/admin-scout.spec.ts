import { randomUUID } from 'node:crypto'
import { expect, freshEmail, signInWithCode, test } from './helpers'
import { sql } from './qa-import-helpers'

/**
 * Onglet Admin SUIVI (2026-10-22), pile Supabase LOCALE : recherche par pseudo, fiche du scout (semaines, zones, séances),
 * retour à la recherche et journal qui note la recherche et l'ouverture.
 */
test('admin : SUIVI retrouve un scout par pseudo, ouvre sa fiche et note la consultation', async ({ page }) => {
  test.setTimeout(60_000)
  const scout = randomUUID()
  const scoutMail = `suivi-scout-${Date.now()}@example.com`
  const pseudo = `Suivi${Date.now() % 100000}`
  const card = sql(`select id from public.cards where status = 'published' order by zone, position limit 1`)
  sql(`insert into auth.users (id, email, aud, role, created_at) values ('${scout}', '${scoutMail}', 'authenticated', 'authenticated', now())`)
  sql(`insert into public.scout_profiles (user_id, pseudo, pseudo_key, pseudo_state, pseudo_changed_at)
       values ('${scout}', '${pseudo}', public.pseudo_key('${pseudo}'), 'ok', now())`)
  sql(`insert into public.progress (user_id, cards, sessions, xp) values ('${scout}',
       jsonb_build_object('${card}', jsonb_build_array(4, public.day_num(now()) + 9, 3, 3, public.day_num(now()) - 2)),
       jsonb_build_array(jsonb_build_object('d', public.day_num(now()), 'n', 8, 'ok', 6, 'k', 'day', 'l', 'Jour')), 80)`)
  sql(`insert into public.grade_events (user_id, day, card_id, week_start, grade, xp, received_at)
       values ('${scout}', public.day_num(now()), '${card}', public.league_week_of(now()), 2, 10, now())`)
  try {
    const email = freshEmail('suivi-admin')
    await signInWithCode(page, email)
    sql(`insert into public.admins (email) values ('${email.toLowerCase()}') on conflict do nothing`)
    await page.goto('/?screen=admin')
    await page.getByRole('navigation', { name: 'Administration' }).getByRole('button', { name: 'SUIVI' }).click()

    const panel = page.getByRole('region', { name: 'Suivi d’un scout' })
    await panel.getByLabel('E-mail ou pseudo').fill('ab')
    await panel.getByRole('button', { name: 'RECHERCHER' }).click()
    await expect(panel.getByRole('alert')).toHaveText('Saisissez au moins 3 caractères.')

    await panel.getByLabel('E-mail ou pseudo').fill(pseudo.toLowerCase())
    await panel.getByRole('button', { name: 'RECHERCHER' }).click()
    const hit = panel.getByRole('list', { name: 'Comptes trouvés' }).getByRole('button')
    await expect(hit).toHaveCount(1)
    await expect(hit).toContainText(scoutMail)
    await hit.click()

    const fiche = page.getByRole('region', { name: `Fiche de ${scoutMail}` })
    await expect(fiche).toContainText(`PSEUDO ${pseudo} · 80 XP`)
    await expect(fiche.getByRole('table', { name: 'RÉPONSES PAR SEMAINE' }).locator('tbody tr')).toHaveCount(7)
    await expect(fiche.getByRole('table', { name: 'AVANCEMENT PAR ZONE' })).toBeVisible()
    await expect(fiche).toContainText('Jour · 6 / 8 cartes réussies')
    expect(sql(`select count(*) from public.admin_views where target_id = '${scout}'`)).toBe('1')

    await fiche.getByRole('button', { name: '← RETOUR À LA RECHERCHE' }).click()
    await expect(hit).toHaveCount(1)
    await panel.getByText('JOURNAL DES CONSULTATIONS', { exact: true }).click()
    await expect(panel.getByText(`${email.toLowerCase()} a consulté ${scoutMail}`)).toBeVisible()
    await expect(panel.getByText(`${email.toLowerCase()} a cherché « ${pseudo.toLowerCase()} »`)).toBeVisible()
  } finally {
    sql(`delete from auth.users where id = '${scout}'`)
  }
})
