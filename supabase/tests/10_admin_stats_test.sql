-- Statistiques globales de l'Admin (2026-10-22) : droits, forme, calculs, aucune donnée nominative.
-- Les calculs sont vérifiés par différence (avant / après les données de test) : la base locale peut déjà en contenir.
-- Tout est annulé en fin de fichier.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-000000000a01', 'stats-un@test.sn', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000a02', 'stats-deux@test.sn', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000a03', 'stats-trois@test.sn', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000a0c', 'stats-admin@test.sn', now(), 'authenticated', 'authenticated');
insert into public.admins (email) values ('stats-admin@test.sn');

create schema stats_tests;
create function stats_tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}'
    else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
end $$;
grant usage on schema stats_tests to anon, authenticated;
grant execute on all functions in schema stats_tests to anon, authenticated;

-- Deux cartes publiées d'une même zone (A ratée, B réussie), sans note antérieure.
create table stats_tests.ids as
  select k.zone, min(k.id) as a, max(k.id) as b, public.league_week_of(now()) as week, public.day_num(now()) as day
    from (select zone, id from public.cards where status = 'published'
           and zone = (select min(zone) from public.cards where status = 'published')
           order by position limit 2) k
   group by k.zone;
create table stats_tests.snap (label text primary key, s jsonb not null);
grant select on stats_tests.ids to authenticated;
grant select, insert on stats_tests.snap to authenticated;
delete from public.grade_events e using stats_tests.ids i where e.card_id in (i.a, i.b);

select stats_tests.login(null);
select throws_ok('select public.admin_stats()', '42501', null, 'anon : refusé');

select stats_tests.login('00000000-0000-0000-0000-000000000a01');
select throws_ok('select public.admin_stats()', '42501', 'FORBIDDEN', 'scout : refusé');

select stats_tests.login('00000000-0000-0000-0000-000000000a0c');
insert into stats_tests.snap select 'avant', public.admin_stats();

select set_config('role', 'postgres', true);
-- Progression : un et deux ont vu des cartes de la zone (A acquise chez les deux), trois n'a rien vu.
insert into public.progress (user_id, cards)
  select '00000000-0000-0000-0000-000000000a01'::uuid, jsonb_build_object(i.a, jsonb_build_array(4, i.day + 9, 6, 5, i.day - 20), i.b, jsonb_build_array(1, i.day, 2, 0, i.day - 3)) from stats_tests.ids i
  union all
  select '00000000-0000-0000-0000-000000000a02', jsonb_build_object(i.a, jsonb_build_array(5, i.day + 30, 9, 9, i.day - 40)) from stats_tests.ids i
  union all
  select '00000000-0000-0000-0000-000000000a03', '{}'::jsonb from stats_tests.ids i;
-- Notes de la semaine : 3 scouts × 2 jours × 2 cartes ; A réussie une fois sur 6, B 6 fois sur 6.
insert into public.grade_events (user_id, day, card_id, week_start, grade, xp, received_at)
  select u.id, i.day - d.n, c.card, i.week,
         case when c.card = i.b or (u.id = '00000000-0000-0000-0000-000000000a01' and d.n = 0) then 2 else 0 end,
         case when c.card = i.b or (u.id = '00000000-0000-0000-0000-000000000a01' and d.n = 0) then 10 else 0 end, now()
    from stats_tests.ids i
   cross join (values ('00000000-0000-0000-0000-000000000a01'::uuid), ('00000000-0000-0000-0000-000000000a02'), ('00000000-0000-0000-0000-000000000a03')) u(id)
   cross join (values (0), (1)) d(n)
   cross join lateral (values (i.a), (i.b)) c(card);

select stats_tests.login('00000000-0000-0000-0000-000000000a0c');
insert into stats_tests.snap select 'apres', public.admin_stats();

select set_config('role', 'postgres', true);
create function stats_tests.delta(p_path text[]) returns numeric language sql as $$
  select coalesce((select (s #>> p_path)::numeric from stats_tests.snap where label = 'apres'), 0)
       - coalesce((select (s #>> p_path)::numeric from stats_tests.snap where label = 'avant'), 0)
$$;
create function stats_tests.week_delta(p_key text) returns numeric language sql as $$
  select coalesce((select (w ->> p_key)::numeric from stats_tests.snap, stats_tests.ids i, jsonb_array_elements(s -> 'weeks') w
                    where label = 'apres' and (w ->> 'week')::date = i.week), 0)
       - coalesce((select (w ->> p_key)::numeric from stats_tests.snap, stats_tests.ids i, jsonb_array_elements(s -> 'weeks') w
                    where label = 'avant' and (w ->> 'week')::date = i.week), 0)
$$;
create function stats_tests.zone_delta(p_key text) returns numeric language sql as $$
  select coalesce((select (z ->> p_key)::numeric from stats_tests.snap, stats_tests.ids i, jsonb_array_elements(s -> 'zones') z
                    where label = 'apres' and (z ->> 'zone')::int = i.zone), 0)
       - coalesce((select (z ->> p_key)::numeric from stats_tests.snap, stats_tests.ids i, jsonb_array_elements(s -> 'zones') z
                    where label = 'avant' and (z ->> 'zone')::int = i.zone), 0)
$$;

select is((select jsonb_array_length(s -> 'weeks') from stats_tests.snap where label = 'apres'), 7, '7 semaines');
select is((select (s -> 'weeks' -> 6 ->> 'week')::date from stats_tests.snap where label = 'apres'), (select week from stats_tests.ids), 'la dernière semaine est la semaine en cours');
select is(stats_tests.delta('{accounts}'), 2::numeric, 'comptes : seuls ceux qui ont vu une carte');
select is(stats_tests.week_delta('scouts'), 3::numeric, 'semaine : 3 scouts actifs de plus');
select is(stats_tests.week_delta('answers'), 12::numeric, 'semaine : 12 réponses de plus');
select is(stats_tests.week_delta('correct'), 7::numeric, 'semaine : 7 réussites de plus');
select is(stats_tests.zone_delta('scouts'), 2::numeric, 'zone : 2 scouts de plus');
select is(stats_tests.zone_delta('seen'), 3::numeric, 'zone : 3 cartes vues de plus');
select is(stats_tests.zone_delta('acquired'), 2::numeric, 'zone : 2 cartes acquises de plus (niveau 4 et plus)');
select is((select h - 'q' from stats_tests.snap, stats_tests.ids i, jsonb_array_elements(s -> 'hardest') h
            where label = 'apres' and h ->> 'id' = i.a),
          (select jsonb_build_object('id', i.a, 'zone', i.zone, 'answers', 6, 'correct', 1) from stats_tests.ids i),
          'questions ratées : A avec 6 réponses dont 1 réussie');
select ok((select coalesce(bool_and(r.rate >= coalesce(r.prev, 0)), true)
             from (select (h ->> 'correct')::numeric / (h ->> 'answers')::numeric as rate,
                          lag((h ->> 'correct')::numeric / (h ->> 'answers')::numeric) over (order by n) as prev
                     from stats_tests.snap, jsonb_array_elements(s -> 'hardest') with ordinality as x(h, n) where label = 'apres') r),
          'questions ratées : du taux de réussite le plus bas au plus haut');
select ok((select s::text !~ '(@|0000-000000000a0)' from stats_tests.snap where label = 'apres'), 'aucun e-mail ni identifiant de compte');

select * from finish();
rollback;
