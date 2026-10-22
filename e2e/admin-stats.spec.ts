import { randomUUID } from 'node:crypto'
import { expect, freshEmail, signInWithCode, test } from './helpers'
import { sql } from './qa-import-helpers'

/**
 * Onglet Admin STATS (2026-10-22), pile Supabase LOCALE : un scout ayant raté 5 fois une question
 * apparaît dans les agrégats (semaine, zone, questions ratées), jamais par son e-mail.
 */
test('admin : STATS montre l’activité des 7 semaines, l’avancement par zone et la question ratée, sans e-mail', async ({ page }) => {
  test.setTimeout(60_000)
  const scout = randomUUID()
  const scoutMail = `stats-scout-${Date.now()}@example.com`
  // Carte propre au test (brouillon) : la base locale peut déjà avoir des réponses aux cartes publiées.
  const card = `stats-e2e-${Date.now()}`
  sql(`insert into public.cards (id, zone, q, a) values ('${card}', 1, 'Question des statistiques e2e ?', 'Réponse.')`)
  sql(`insert into auth.users (id, email, aud, role, created_at) values ('${scout}', '${scoutMail}', 'authenticated', 'authenticated', now())`)
  sql(`insert into public.progress (user_id, cards) values ('${scout}', jsonb_build_object('${card}', jsonb_build_array(1, public.day_num(now()), 5, 0, public.day_num(now()) - 4)))`)
  sql(`insert into public.grade_events (user_id, day, card_id, week_start, grade, xp, received_at)
       select '${scout}', public.day_num(now()) - n, '${card}', public.league_week_of(now()), 0, 0, now() from generate_series(0, 4) n`)
  try {
    const email = freshEmail('stats-admin')
    await signInWithCode(page, email)
    sql(`insert into public.admins (email) values ('${email.toLowerCase()}') on conflict do nothing`)
    await page.goto('/?screen=admin')
    await page.getByRole('navigation', { name: 'Administration' }).getByRole('button', { name: 'STATS' }).click()

    const stats = page.getByRole('region', { name: 'Statistiques' })
    const weeks = stats.getByRole('table', { name: 'ACTIVITÉ PAR SEMAINE' })
    await expect(weeks.locator('tbody tr')).toHaveCount(7)
    await expect(stats.getByRole('table', { name: 'AVANCEMENT PAR ZONE' })).toBeVisible()
    await expect(stats.getByRole('listitem').filter({ hasText: card })).toContainText('0 % de réussite sur 5 réponses')
    await expect(stats).not.toContainText(scoutMail)
    await expect(stats).not.toContainText(scout)
  } finally {
    sql(`delete from auth.users where id = '${scout}'`)
    sql(`delete from public.cards where id = '${card}'`)
  }
})
