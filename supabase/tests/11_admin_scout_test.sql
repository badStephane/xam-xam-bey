-- Suivi d'un scout par l'admin (2026-10-22) : recherche par e-mail ou pseudo, fiche de progression, journal des recherches et fiches.
-- Tout est annulé en fin de fichier.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, email_confirmed_at, aud, role, created_at) values
  ('00000000-0000-0000-0000-000000000b01', 'suivi-amadou@test.sn', now(), 'authenticated', 'authenticated', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000b02', 'suivi-fatou@test.sn', now(), 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000b0c', 'suivi-admin@test.sn', now(), 'authenticated', 'authenticated', now());
insert into public.admins (email) values ('suivi-admin@test.sn');
insert into public.scout_profiles (user_id, pseudo, pseudo_key, pseudo_state, pseudo_changed_at)
  values ('00000000-0000-0000-0000-000000000b01', 'LionRapide', public.pseudo_key('LionRapide'), 'ok', now());

create schema scout_tests;
create function scout_tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}'
    else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
end $$;
grant usage on schema scout_tests to anon, authenticated;
grant execute on all functions in schema scout_tests to anon, authenticated;

-- Deux cartes publiées d'une même zone.
create table scout_tests.ids as
  select k.zone, min(k.id) as a, max(k.id) as b, public.league_week_of(now()) as week, public.day_num(now()) as day,
         (select count(*) from public.cards c where c.status = 'published' and c.zone = k.zone) as total
    from (select zone, id from public.cards where status = 'published'
           and zone = (select min(zone) from public.cards where status = 'published')
           order by position limit 2) k
   group by k.zone;
create table scout_tests.res (label text primary key, s jsonb not null);
grant select on scout_tests.ids to authenticated;
grant select, insert on scout_tests.res to authenticated;

-- Amadou : A acquise, B vue ; 3 séances (la plus ancienne avec un libellé trop long) ; 3 réponses cette semaine sur 2 jours, dont 2 réussies.
insert into public.progress (user_id, cards, sessions, xp)
  select '00000000-0000-0000-0000-000000000b01',
         jsonb_build_object(i.a, jsonb_build_array(4, i.day + 9, 6, 5, i.day - 20), i.b, jsonb_build_array(1, i.day, 2, 0, i.day - 3)),
         jsonb_build_array(jsonb_build_object('d', i.day - 1, 'n', 10, 'ok', 7, 'k', 'day', 'l', 'Jour'),
                           jsonb_build_object('d', i.day, 'n', 5, 'ok', 5, 'k', 'day', 'l', 'Jour'),
                           jsonb_build_object('d', i.day - 2, 'n', 3, 'ok', 1, 'k', 'day', 'l', repeat('x', 200))), 120
    from scout_tests.ids i;
insert into public.grade_events (user_id, day, card_id, week_start, grade, xp, received_at)
  select '00000000-0000-0000-0000-000000000b01', i.day - x.n, x.card, i.week, x.grade, 0, now()
    from scout_tests.ids i cross join lateral (values (0, i.a, 2), (1, i.a, 0), (0, i.b, 2)) x(n, card, grade);

select scout_tests.login(null);
select throws_ok($$select * from public.admin_find_scouts('suivi')$$, '42501', null, 'anon : recherche refusée');

select scout_tests.login('00000000-0000-0000-0000-000000000b01');
select throws_ok($$select * from public.admin_find_scouts('suivi')$$, '42501', 'FORBIDDEN', 'scout : recherche refusée');
select throws_ok($$select public.admin_scout_progress('00000000-0000-0000-0000-000000000b02')$$, '42501', 'FORBIDDEN', 'scout : fiche refusée');
select throws_ok($$select * from public.admin_list_views()$$, '42501', 'FORBIDDEN', 'scout : journal refusé');
select throws_ok('select * from public.admin_views', '42501', null, 'scout : table du journal illisible');

select scout_tests.login('00000000-0000-0000-0000-000000000b0c');
select throws_ok($$select * from public.admin_find_scouts(' ab ')$$, '22023', 'SEARCH_TOO_SHORT', 'recherche : 3 caractères au moins');
select results_eq($$select user_id from public.admin_find_scouts('suivi-amad')$$,
  $$values ('00000000-0000-0000-0000-000000000b01'::uuid)$$, 'recherche par une partie de l’e-mail');
select results_eq($$select user_id, pseudo from public.admin_find_scouts('lion rap')$$,
  $$values ('00000000-0000-0000-0000-000000000b01'::uuid, 'LionRapide'::text)$$, 'recherche par le pseudo, sans casse ni espace');
select results_eq($$select email, pseudo from public.admin_find_scouts('SUIVI-FATOU')$$,
  $$values ('suivi-fatou@test.sn'::text, null::text)$$, 'recherche sans casse, compte sans pseudo');

insert into scout_tests.res select 'amadou', public.admin_scout_progress('00000000-0000-0000-0000-000000000b01');
insert into scout_tests.res select 'fatou', public.admin_scout_progress('00000000-0000-0000-0000-000000000b02');

select is((select s ->> 'email' from scout_tests.res where label = 'amadou') || ' ' || (select s ->> 'pseudo' from scout_tests.res where label = 'amadou'),
  'suivi-amadou@test.sn LionRapide', 'fiche : e-mail et pseudo');
select is((select (s ->> 'xp')::int from scout_tests.res where label = 'amadou'), 120, 'fiche : XP');
select is((select jsonb_build_object('n', jsonb_array_length(s -> 'weeks'), 'last', (s -> 'weeks' -> 6) - 'week')
             from scout_tests.res where label = 'amadou'),
          '{"n": 7, "last": {"answers": 3, "correct": 2, "days": 2}}'::jsonb, 'fiche : 7 semaines, la dernière avec 3 réponses, 2 réussies, 2 jours');
select is((select z from scout_tests.res, scout_tests.ids i, jsonb_array_elements(s -> 'zones') z
            where label = 'amadou' and (z ->> 'zone')::int = i.zone),
          (select jsonb_build_object('zone', i.zone, 'total', i.total, 'seen', 2, 'acquired', 1) from scout_tests.ids i),
          'fiche : zone avec cartes vues, acquises et total publié');
select is((select jsonb_agg(x -> 'n') from scout_tests.res, jsonb_array_elements(s -> 'sessions') x where label = 'amadou'),
          '[5, 10, 3]'::jsonb, 'fiche : séances de la plus récente à la plus ancienne');
select is((select char_length(s -> 'sessions' -> 2 ->> 'l') from scout_tests.res where label = 'amadou'), 60, 'fiche : libellé de séance coupé à 60 caractères');
select is((select jsonb_build_object('xp', s -> 'xp', 'sessions', s -> 'sessions', 'lastActive', s -> 'lastActive')
             from scout_tests.res where label = 'fatou'),
          '{"xp": 0, "sessions": [], "lastActive": null}'::jsonb, 'fiche : compte sans progression');
select throws_ok($$select public.admin_scout_progress('00000000-0000-0000-0000-0000000000ff')$$, 'P0002', 'NOT_FOUND', 'fiche : compte inconnu');

select results_eq($$select admin_email, target_email from public.admin_list_views() where search is null limit 2$$,
  $$values ('suivi-admin@test.sn'::text, 'suivi-fatou@test.sn'::text), ('suivi-admin@test.sn'::text, 'suivi-amadou@test.sn'::text)$$,
  'journal : chaque fiche ouverte est notée, la plus récente en premier');
select results_eq($$select search from public.admin_list_views() where search is not null$$,
  $$values ('suivi-fatou'::text), ('lion rap'), ('suivi-amad')$$, 'journal : chaque recherche est notée (pas celle refusée)');

select set_config('role', 'postgres', true);
select ok(not has_sequence_privilege('authenticated', 'public.admin_views_id_seq', 'usage'), 'journal : compteur interne fermé');
delete from auth.users where id = '00000000-0000-0000-0000-000000000b02';
select is((select count(*) from public.admin_views where target_email = 'suivi-fatou@test.sn' and target_id is null), 1::bigint,
  'journal : la trace reste après la suppression du compte');
select is((select count(*) from public.admin_views where target_id = '00000000-0000-0000-0000-0000000000ff'), 0::bigint,
  'journal : rien de noté pour un compte inconnu');

select * from finish();
rollback;
