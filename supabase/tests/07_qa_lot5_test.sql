-- QA lot 5 (P7) : tentatives de triche complémentaires, ex aequo, pseudo retiré en cours de semaine.
-- L5-1 et L5-2 (18-qa-lot5.md) corrigés par le back : les anciens TODO sont devenus des tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create schema qa5;
create function qa5.uid(p_n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad((7000 + p_n)::text, 12, '0'))::uuid $$;
create function qa5.dn(p_date date) returns integer language sql immutable as $$ select p_date - date '1970-01-01' $$;
-- n QCM bien répondus (10 XP chacun) notés le jour d, sans t.
create function qa5.good(p_n integer, p_d integer) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('c', 'qa-q' || lpad(i::text, 2, '0'), 'd', p_d, 'a', 'Bonne ' || i) order by i), '[]')
  from generate_series(1, p_n) i $$;
create function qa5.week_xp(p_uid uuid, p_week date) returns integer language sql as $$
  select coalesce(sum(xp), 0)::integer from public.grade_events where user_id = p_uid and week_start = p_week $$;

insert into public.cards (id, zone, q, a, qcm, status)
select 'qa-q' || lpad(i::text, 2, '0'), 1, 'Q' || i, 'R' || i,
       jsonb_build_object('ok', 'Bonne ' || i, 'no', jsonb_build_array('Faux A', 'Faux B', 'Faux C')), 'published'
  from generate_series(1, 40) i;
insert into auth.users (id, email, created_at, aud, role)
select qa5.uid(i), 'qa5-' || i || '@test.sn', '2026-09-01', 'authenticated', 'authenticated' from generate_series(1, 9) i;
insert into public.scout_profiles (user_id, pseudo, pseudo_key, pseudo_state, tier)
select qa5.uid(i), 'Qa' || i || 'scout', 'qa' || i || 'scout', 'ok', 3 from generate_series(1, 9) i;

-- A. Jour déclaré (A6, A7). Mercredi 2026-11-04 10:00 : le scout 1 envoie en un appel 30 QCM réussis pour chaque jour
--    de dimanche 01/11 à jeudi 05/11 (demain), sans t. Après L5-1 : dimanche (semaine close) et demain refusés.
create temp table cal as select qa5.dn('2026-11-01') as sun, qa5.dn('2026-11-04') as wed;
select is(public.league_ingest(qa5.uid(1),
  (select jsonb_agg(e) from generate_series(-3, 1) k, jsonb_array_elements(qa5.good(30, (select wed from cal) + k)) e), '2026-11-04 10:00Z'),
  90, 'rattrapage déclaré : seuls les jours passés de la semaine ouverte (3 x 30) passent ; dimanche clos et demain refusés');
select ok(qa5.week_xp(qa5.uid(1), '2026-11-02') <= 7 * 300, 'XP de la semaine bornée : 7 jours x 300 au plus');
select is(public.league_ingest(qa5.uid(2), qa5.good(1, (select wed from cal) + 1), '2026-11-04 10:00Z'), 0,
  'note datée de demain refusée');
select public.league_ingest(qa5.uid(1), qa5.good(1, (select sun from cal)), '2026-11-02 05:00Z');
select is((select week_start from public.grade_events where user_id = qa5.uid(1) and day = (select sun from cal) limit 1), '2026-10-26'::date,
  'note de dimanche sans t : semaine du dimanche, pas la suivante');
delete from public.grade_events where user_id in (qa5.uid(1), qa5.uid(2));
delete from public.league_members where user_id in (qa5.uid(1), qa5.uid(2));
delete from public.league_weeks where week_start = '2026-10-26';  -- semaine créée par la note de dimanche (voyage dans le temps)

-- B. Plafond réparti sur deux appels le même jour.
select public.league_ingest(qa5.uid(9), qa5.good(20, (select wed from cal)), '2026-11-04 08:00Z');
select is(public.league_ingest(qa5.uid(9), (select jsonb_agg(jsonb_build_object('c', 'qa-q' || lpad(i::text, 2, '0'), 'd', (select wed from cal),
  'a', 'Bonne ' || i)) from generate_series(21, 40) i), '2026-11-04 09:00Z'), 10, 'deux appels du même jour : 30 cartes au plus');
delete from public.grade_events where user_id = qa5.uid(9);
delete from public.league_members where user_id = qa5.uid(9);

-- C. Ex aequo (A8) : 2 et 3 finissent à 60 XP ; 2 y arrive à 09:00, 3 à 10:00. À 11:00, 2 rate un QCM (0 XP).
--    Groupe de 5 (ligue 3) : 1 monte. Celui qui a atteint son total le plus tôt (2) doit passer devant.
select public.league_ingest(qa5.uid(2), qa5.good(6, (select wed from cal)), '2026-11-04 09:00Z');
select public.league_ingest(qa5.uid(3), qa5.good(6, (select wed from cal)), '2026-11-04 10:00Z');
select public.league_ingest(qa5.uid(i), qa5.good(1, (select wed from cal)), '2026-11-04 08:00Z') from generate_series(4, 6) i;
select public.league_ingest(qa5.uid(2), jsonb_build_array(jsonb_build_object('c', 'qa-q30', 'd', (select wed from cal), 'a', 'Faux A')), '2026-11-04 11:00Z');
select is((select count(distinct group_id)::integer from public.league_members where user_id in (select qa5.uid(i) from generate_series(2, 6) i)), 1,
  'les 5 scouts sont dans le même groupe');
-- D. Pseudo retiré en cours de semaine (admin) : le scout 7 garde ses notes mais n'est ni classé ni déplacé.
select public.league_ingest(qa5.uid(7), qa5.good(20, (select wed from cal)), '2026-11-04 08:30Z');
update public.scout_profiles set pseudo = null, pseudo_key = null, pseudo_state = 'reset' where user_id = qa5.uid(7);

select is(public.league_close_week('2026-11-02', '2026-11-09 06:05Z'), true, 'clôture');
select is((select outcome from public.league_members where user_id = qa5.uid(2) and week_start = '2026-11-02'), 1::smallint,
  'ex aequo : le premier arrivé à 60 XP monte malgré un QCM raté ensuite');
select is((select array[final_rank, outcome] from public.league_members where user_id = qa5.uid(7)), array[null, null]::integer[],
  'pseudo retiré : ni rang ni issue');
select is((select tier from public.scout_profiles where user_id = qa5.uid(7)), 3::smallint, 'pseudo retiré : ligue inchangée');
select is((select count(*)::integer from public.user_badges where badge = 'podium' and user_id = qa5.uid(7)), 0, 'pseudo retiré : pas de podium');

-- E. t falsifié pour viser une semaine close : note du lundi 09/11 présentée comme faite dimanche 19:00, reçue lundi 07:00.
select is(public.league_ingest(qa5.uid(8), jsonb_build_array(jsonb_build_object('c', 'qa-q01', 'd', qa5.dn('2026-11-09'), 'a', 'Bonne 1',
  't', extract(epoch from timestamptz '2026-11-08 19:00Z'))), '2026-11-09 07:00Z'), 0, 't vers une semaine close : refusée');

select * from finish();
rollback;
