import { randomUUID } from 'node:crypto'
import { expect, freshEmail, signInWithCode, test } from './helpers'
import { sql } from './qa-import-helpers'

/**
 * Onglet Admin STATS (2026-10-22), pile Supabase LOCALE : 3 scouts ayant raté une question 2 jours de suite
 * apparaissent dans les agrégats (semaine, zone, questions ratées), jamais par leur e-mail.
 */
test('admin : STATS montre l’activité des 7 semaines, l’avancement par zone et la question ratée, sans e-mail', async ({ page }) => {
  test.setTimeout(60_000)
  const scouts = [randomUUID(), randomUUID(), randomUUID()]
  const mails = scouts.map((_, i) => `stats-scout-${i}-${Date.now()}@example.com`)
  const ids = scouts.map(s => `'${s}'`).join(', ')
  // Carte propre au test (brouillon) : la base locale peut déjà avoir des réponses aux cartes publiées.
  const card = `stats-e2e-${Date.now()}`
  sql(`insert into public.cards (id, zone, q, a) values ('${card}', 1, 'Question des statistiques e2e ?', 'Réponse.')`)
  sql(`insert into auth.users (id, email, aud, role, created_at) values ${scouts.map((s, i) => `('${s}', '${mails[i]}', 'authenticated', 'authenticated', now())`).join(', ')}`)
  sql(`insert into public.progress (user_id, cards) select u, jsonb_build_object('${card}', jsonb_build_array(1, public.day_num(now()), 2, 0, public.day_num(now()) - 1)) from unnest(array[${ids}]::uuid[]) u`)
  sql(`insert into public.grade_events (user_id, day, card_id, week_start, grade, xp, received_at)
       select u, public.day_num(now()) - n, '${card}', public.league_week_of(now()), 0, 0, now() from unnest(array[${ids}]::uuid[]) u, generate_series(0, 1) n`)
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
    await expect(stats.getByRole('listitem').filter({ hasText: card })).toContainText('0 % de réussite sur 6 réponses')
    for (const [i, s] of scouts.entries()) {
      await expect(stats).not.toContainText(mails[i])
      await expect(stats).not.toContainText(s)
    }
  } finally {
    sql(`delete from auth.users where id in (${ids})`)
    sql(`delete from public.cards where id = '${card}'`)
  }
})
