-- Lot 5 : XP de ligue vérifiée par le serveur (A6, A7, A11), clôture rejouable et règles de montée/descente (A8).
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

create schema tests;
create function tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}'
    else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
end $$;
create function tests.uid(p_n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create function tests.dn(p_date date) returns integer language sql immutable as $$ select p_date - date '1970-01-01' $$;
-- n cartes en auto-évaluation (5 XP chacune) notées le jour d.
create function tests.self_batch(p_n integer, p_d integer) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('c', 'zz-s' || lpad(i::text, 2, '0'), 'd', p_d, 'g', 1) order by i), '[]')
  from generate_series(1, p_n) i $$;
create function tests.week_xp(p_uid uuid, p_week date) returns integer language sql as $$
  select coalesce(sum(xp), 0)::integer from public.grade_events where user_id = p_uid and week_start = p_week $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

-- Cartes de test : 40 QCM (bonne réponse « Bonne réponse NN »), 40 sans propositions, 1 brouillon.
insert into public.cards (id, zone, q, a, qcm, status)
select 'zz-q' || lpad(i::text, 2, '0'), 1, 'Question ' || i, 'Réponse ' || i,
       jsonb_build_object('ok', 'Bonne réponse ' || lpad(i::text, 2, '0'), 'no', jsonb_build_array('Faux A', 'Faux B', 'Faux C')),
       'published' from generate_series(1, 40) i;
insert into public.cards (id, zone, q, a, qcm, status)
select 'zz-s' || lpad(i::text, 2, '0'), 1, 'Question ' || i, 'Réponse ' || i, null, 'published' from generate_series(1, 40) i;
insert into public.cards (id, zone, q, a, status) values ('zz-draft', 1, 'Brouillon', 'Brouillon', 'draft');

-- A. Anti-triche, par save_progress (heure réelle). Le scout 900 vient de s'inscrire et a un pseudo.
insert into auth.users (id, email, created_at, aud, role) values (tests.uid(900), 'a900@test.sn', now(), 'authenticated', 'authenticated');
insert into public.scout_profiles (user_id, pseudo, pseudo_key, pseudo_state) values (tests.uid(900), 'Triche', 'triche', 'ok');
create temp table today as select public.day_num(now()) as d;
grant select on today to authenticated;
select tests.login(tests.uid(900));

select is((select week_xp from public.save_progress('{}', '[]', 10000000, '[]')), 0, 'p_xp = 10 000 000 : XP de ligue nulle');
select is((select week_xp from public.save_progress('{}', '[]', 0,
  jsonb_build_array(jsonb_build_object('c', 'zz-q01', 'd', (select d from today), 'a', '  Bonne   réponse 01 ')))), 10,
  'QCM : bonne proposition (espaces normalisés) = 10');
select is((select array[week_xp, grades_counted] from public.save_progress('{}', '[]', 0,
  jsonb_build_array(jsonb_build_object('c', 'zz-q02', 'd', (select d from today), 'a', 'Faux A')))), array[10, 1],
  'QCM : mauvaise proposition = 0 (la note compte dans le plafond)');
select is((select week_xp from public.save_progress('{}', '[]', 0, jsonb_build_array(
  jsonb_build_object('c', 'zz-q03', 'd', (select d from today), 'a', 'Texte inventé', 'g', 2),
  jsonb_build_object('c', 'zz-q04', 'd', (select d from today), 'g', 2)))), 10,
  'QCM : texte inventé ou « Su » déclaré sans proposition = 0');
select is((select week_xp from public.save_progress('{}', '[]', 0, jsonb_build_array(
  jsonb_build_object('c', 'zz-s01', 'd', (select d from today), 'g', 0),
  jsonb_build_object('c', 'zz-s02', 'd', (select d from today), 'g', 2)))), 20,
  'carte sans QCM = 5 quelle que soit la note');
reset role;
select is((select array_agg(grade order by card_id) from public.grade_events where user_id = tests.uid(900) and card_id in ('zz-q01', 'zz-q04')),
  array[2, 0]::smallint[], 'la note d''un QCM est celle du serveur, pas celle déclarée');
select tests.login(tests.uid(900));
select is((select grades_counted from public.save_progress('{}', '[]', 0, jsonb_build_array(
  jsonb_build_object('c', 'inexistante', 'd', (select d from today), 'g', 2),
  jsonb_build_object('c', 'zz-draft', 'd', (select d from today), 'g', 2),
  jsonb_build_object('c', 'zz-s03', 'd', (select d from today) + 2, 'g', 2),
  jsonb_build_object('c', 'zz-s07', 'd', (select d from today) + 1, 'g', 2),
  jsonb_build_object('c', 'zz-s04', 'd', (select d from today) - 1, 'g', 2),
  jsonb_build_object('c', 'zz-s05', 'd', (select d from today) + 0.5, 'g', 2),
  jsonb_build_object('c', 'zz-s06', 'd', (select d from today)),
  'pas un objet'))), 0,
  'ignorés : carte inconnue, brouillon, demain (+1) et après-demain, avant l''inscription, jour non entier, sans note, non objet');
select is((select grades_counted from public.save_progress('{}', '[]', 0,
  jsonb_build_array(jsonb_build_object('c', 'zz-q01', 'd', (select d from today), 'a', 'Bonne réponse 01')))), 0,
  'renvoi de la même note : 0');
select is((select week_xp from public.save_progress('{}', '[]', 0, jsonb_build_array(
  jsonb_build_object('c', 'zz-q05', 'd', (select d from today), 'a', 'Faux B'),
  jsonb_build_object('c', 'zz-q05', 'd', (select d from today), 'a', 'Bonne réponse 05')))), 20,
  'même carte deux fois le même jour : la première note fait foi (pas de reprise payante)');
select is((select today_xp from public.save_progress('{}', '[]', 0, tests.self_batch(40, (select d from today)))),
  20 + 5 * (30 - 7), 'plafond : 30 cartes par jour, QCM ratés compris');
reset role;
select is((select count(*)::integer from public.grade_events where user_id = tests.uid(900)), 30, '30 notes enregistrées au plus');
select tests.login(tests.uid(900));
select throws_ok($$select public.save_progress('{}', '[]', 0, (select jsonb_agg(i) from generate_series(1, 501) i))$$,
  '22023', 'GRADES_INVALID', 'plus de 500 notes : 22023');
select throws_ok($$select public.save_progress('{}', '[]', 0, '{"c":"zz-s01"}')$$, '22023', 'GRADES_INVALID', 'p_grades non tableau : 22023');
select is((select xp from public.save_progress(p_cards => '{"zz-s01":[1,1,1,1,1]}', p_sessions => '[]', p_xp => 7)), 10000000,
  'appel du lot 4 à 3 paramètres nommés : inchangé');
reset role;
select is((select xp from public.league_members where user_id = tests.uid(900)), tests.week_xp(tests.uid(900), public.league_week_of(now())),
  'cache : league_members.xp = somme des notes de la semaine');

-- B. Voyage dans le temps (fonctions internes). Semaine de référence : lundi 2026-11-02, scouts inscrits le 2026-09-01.
-- Les dates écrites ci-dessous sont celles de la semaine de référence ; tests.day et tests.at les décalent de 4 semaines
-- en 4 semaines (même rang du défi, partie D) pour que la semaine du voyage arrive au moins deux semaines après la
-- semaine réelle de la partie A, restée ouverte : league_join refuse un groupe tant que la semaine précédente n'est pas
-- close, et league_close_due doit trouver la semaine réelle déjà échue. Sans décalage, le test cassait dès la semaine
-- réelle du 2026-10-26.
create function tests.base() returns date language sql stable as $$
  select date '2026-11-02' + 28 * greatest(0, ceil((public.league_week_of(now()) + 14 - date '2026-11-02') / 28.0)::integer) $$;
create function tests.day(p text) returns date language sql stable as $$ select p::date - date '2026-11-02' + tests.base() $$;
create function tests.at(p text) returns timestamptz language sql stable as $$
  select p::timestamptz + (tests.base() - date '2026-11-02') * interval '1 day' $$;
insert into auth.users (id, email, created_at, aud, role)
select tests.uid(i), 's' || i || '@test.sn', '2026-09-01', 'authenticated', 'authenticated' from generate_series(1, 45) i;
insert into public.scout_profiles (user_id, pseudo, pseudo_key, pseudo_state, tier)
select tests.uid(i), 'Scout' || i, 'scout' || i, 'ok',
       case when i <= 21 or i = 42 then 2 when i <= 26 then 3 when i <= 29 then 4 when i <= 33 or i in (43, 44) then 6
            when i <= 38 then 1 else 5 end
  from generate_series(1, 45) i;
create temp table cal as select tests.dn(tests.day('2026-11-03')) as tue, tests.dn(tests.day('2026-11-08')) as sun, tests.dn(tests.day('2026-11-09')) as mon;

-- Ligue 2 : 20 scouts (XP 30 à 125) puis un 21e ; ligue 3 : 5 scouts de 130 à 150 ; ligue 4 : 3 scouts sous 50 ;
-- ligue 6 : 200, 150, 100 ; ligue 1 : 60, 50, 40, 30, 10 ; ligue 5 : deux ex aequo à 60 (le 40 arrivé avant) et 10.
select public.league_ingest(tests.uid(i), tests.self_batch(i + 5, (select tue from cal)), tests.at('2026-11-03 10:00Z')) from generate_series(1, 21) i;
select public.league_ingest(tests.uid(i), tests.self_batch(52 - i, (select tue from cal)), tests.at('2026-11-03 10:00Z')) from generate_series(22, 26) i;
select public.league_ingest(tests.uid(i), tests.self_batch(35 - i, (select tue from cal)), tests.at('2026-11-03 10:00Z')) from generate_series(27, 29) i;
select public.league_ingest(tests.uid(31), tests.self_batch(20, (select tue from cal)), tests.at('2026-11-03 10:00Z'));
select public.league_ingest(tests.uid(31), tests.self_batch(20, (select tue from cal) + 1), tests.at('2026-11-04 10:00Z'));
select public.league_ingest(tests.uid(32), tests.self_batch(30, (select tue from cal)), tests.at('2026-11-03 10:00Z'));
select public.league_ingest(tests.uid(33), tests.self_batch(20, (select tue from cal)), tests.at('2026-11-03 10:00Z'));
select public.league_ingest(tests.uid(i), tests.self_batch(case i when 34 then 12 when 35 then 10 when 36 then 8 when 37 then 6 else 2 end,
  (select tue from cal)), tests.at('2026-11-03 10:00Z')) from generate_series(34, 38) i;
select public.league_ingest(tests.uid(40), tests.self_batch(12, (select tue from cal)), tests.at('2026-11-03 09:00Z'));
select public.league_ingest(tests.uid(39), tests.self_batch(12, (select tue from cal)), tests.at('2026-11-03 11:00Z'));
select public.league_ingest(tests.uid(41), tests.self_batch(2, (select tue from cal)), tests.at('2026-11-03 11:00Z'));

select is((select count(*)::integer from public.league_members where week_start = tests.day('2026-11-02') and tier = 2 group by group_id order by 1 desc limit 1), 20,
  'groupe plein à 20');
select is((select count(distinct group_id)::integer from public.league_members where week_start = tests.day('2026-11-02') and tier = 2), 2,
  'le 21e scout ouvre un nouveau groupe');
select is((select xp from public.league_members where user_id = tests.uid(31) and week_start = tests.day('2026-11-02')), 200,
  'XP recalculée au fil des jours (100 + 100)');
select is((select count(*)::integer from public.league_members where user_id = tests.uid(42)), 0, 'scout inactif : aucun groupe');

-- Hors ligne (A7) : note de dimanche 15:00 reçue lundi 05:00 comptée, reçue lundi 07:00 refusée ; note de dimanche
-- 21:00 (t) pour la semaine suivante ; sans t, une note de dimanche est datée du début du jour : sa semaine (L5-1).
select is(public.league_ingest(tests.uid(43), jsonb_build_array(jsonb_build_object('c', 'zz-s01', 'd', (select sun from cal), 'g', 1,
  't', extract(epoch from tests.at('2026-11-08 15:00Z')))), tests.at('2026-11-09 05:00Z')), 1, 'note de dimanche reçue lundi 05:00 : acceptée');
select is(tests.week_xp(tests.uid(43), tests.day('2026-11-02')), 5, '... et comptée pour la semaine écoulée');
select is(public.league_ingest(tests.uid(44), jsonb_build_array(jsonb_build_object('c', 'zz-s01', 'd', (select sun from cal), 'g', 1,
  't', extract(epoch from tests.at('2026-11-08 15:00Z')))), tests.at('2026-11-09 07:00Z')), 0, 'reçue lundi 07:00 : refusée');
select public.league_ingest(tests.uid(33), jsonb_build_array(jsonb_build_object('c', 'zz-q01', 'd', (select sun from cal), 'a', 'Bonne réponse 01',
  't', extract(epoch from tests.at('2026-11-08 21:00Z')))), tests.at('2026-11-08 21:00Z'));
select public.league_ingest(tests.uid(33), jsonb_build_array(jsonb_build_object('c', 'zz-s02', 'd', (select sun from cal), 'g', 2)), tests.at('2026-11-08 21:30Z'));
select is((select array_agg(week_start order by card_id) from public.grade_events where user_id = tests.uid(33) and day = (select sun from cal)),
  array[tests.day('2026-11-09'), tests.day('2026-11-02')], 'dimanche : avec t après 20:00, semaine suivante ; sans t, semaine du dimanche');
select is(tests.week_xp(tests.uid(33), tests.day('2026-11-02')), 105, 'semaine écoulée : seule la note sans t s''ajoute');
select is(public.league_ingest(tests.uid(41), jsonb_build_array(jsonb_build_object('c', 'zz-s05', 'd', (select sun from cal), 'g', 1)),
  tests.at('2026-11-09 05:30Z')), 1, 'note de dimanche sans t reçue lundi 05:30 (grâce) : acceptée');
select is((select week_start from public.grade_events where user_id = tests.uid(41) and card_id = 'zz-s05'), tests.day('2026-11-02'),
  '... et rangée dans la semaine du dimanche');
-- t dans le futur : ignoré, la note est datée de sa réception.
select public.league_ingest(tests.uid(45), jsonb_build_array(jsonb_build_object('c', 'zz-s03', 'd', (select sun from cal), 'g', 1,
  't', extract(epoch from tests.at('2026-11-08 18:00Z')))), tests.at('2026-11-08 17:00Z'));
select is((select week_start from public.grade_events where user_id = tests.uid(45) and card_id = 'zz-s03'), tests.day('2026-11-02'),
  't dans le futur : remplacé par l''heure de réception');

-- Lundi 02:00 : semaine précédente non close, la note compte mais le scout attend son groupe.
select is(public.league_ingest(tests.uid(34), tests.self_batch(2, (select mon from cal)), tests.at('2026-11-09 02:00Z')), 2, 'note du lundi matin acceptée');
select is((select count(*)::integer from public.league_members where user_id = tests.uid(34) and week_start = tests.day('2026-11-09')), 0,
  'pas de groupe avant la clôture');

-- C. Clôture.
select is(public.league_close_week(tests.day('2026-11-02'), tests.at('2026-11-09 05:59Z')), false, 'clôture refusée avant lundi 06:00');
select is(public.league_close_week(tests.day('2026-11-02'), tests.at('2026-11-09 06:05Z')), true, 'clôture faite à 06:05');
select is(public.league_close_due('2026-11-09 06:30Z'), 1, 'league_close_due : ferme seulement la semaine réelle restée ouverte (partie A)');
create temp table snap as select user_id, tier, tier_from from public.scout_profiles;
create temp table snap_badges as select * from public.user_badges;
select is(public.league_close_week(tests.day('2026-11-02'), tests.at('2026-11-09 07:00Z')), false, 'clôture rejouée : sans effet');
select is(public.league_close_due('2026-11-09 08:00Z'), 0, 'league_close_due rejouée : rien à fermer');
-- Rejeu forcé (closed_at effacé à la main) : les ligues sont affectées, jamais incrémentées.
update public.league_weeks set closed_at = null where week_start = tests.day('2026-11-02');
select is(public.league_close_week(tests.day('2026-11-02'), tests.at('2026-11-09 09:00Z')), true, 'rejeu forcé exécuté');
select is_empty($$select user_id, tier, tier_from from public.scout_profiles except select * from snap$$, 'rejeu forcé : aucune double promotion');
select is_empty($$select user_id, badge, week_start from public.user_badges except select user_id, badge, week_start from snap_badges$$,
  'rejeu forcé : aucun badge en plus');

select is((select array_agg(tier order by user_id) from public.scout_profiles where user_id in (select tests.uid(i) from generate_series(16, 20) i)),
  array[3, 3, 3, 3, 3]::smallint[], 'groupe de 20 : les 5 premiers montent');
select is((select array_agg(tier order by user_id) from public.scout_profiles where user_id in (select tests.uid(i) from generate_series(1, 4) i)),
  array[1, 1, 1, 2]::smallint[], 'groupe de 20 : les 3 derniers descendent, le 4e dernier reste');
select is((select count(*)::integer from public.scout_profiles where tier = 2 and user_id in (select tests.uid(i) from generate_series(4, 15) i)), 12,
  'groupe de 20 : le milieu reste');
select is((select array[p.tier, m.outcome] from public.scout_profiles p join public.league_members m using (user_id)
  where user_id = tests.uid(21) and week_start = tests.day('2026-11-02')), array[2, 0]::smallint[], 'seul dans son groupe : ni montée ni descente');
select is((select array_agg(tier order by user_id) from public.scout_profiles where user_id in (select tests.uid(i) from generate_series(22, 26) i)),
  array[4, 3, 3, 3, 3]::smallint[], 'groupe de 5 : 1 monte ; le dernier (130 XP) est protégé par le filet de 100 XP');
select is((select count(*)::integer from public.user_badges where badge = 'podium' and user_id in (select tests.uid(i) from generate_series(22, 26) i)), 3,
  'groupe de 5 : podium pour les 3 premiers');
select is((select count(*)::integer from public.user_badges where badge = 'podium' and user_id in (select tests.uid(i) from generate_series(27, 29) i)), 0,
  'groupe de 3 : pas de podium');
select is((select array_agg(tier order by user_id) from public.scout_profiles where user_id in (select tests.uid(i) from generate_series(27, 29) i)),
  array[4, 4, 4]::smallint[], 'moins de 50 XP : pas de montée');
select is((select array_agg(tier order by user_id) from public.scout_profiles where user_id in (select tests.uid(i) from generate_series(31, 33) i)),
  array[6, 6, 6]::smallint[], 'ligue la plus haute : personne ne monte ni ne descend (groupe de 4)');
select is((select array_agg(tier order by user_id) from public.scout_profiles where user_id in (select tests.uid(i) from generate_series(34, 38) i)),
  array[2, 1, 1, 1, 1]::smallint[], 'ligue la plus basse : 1 monte, personne ne descend');
select is((select array[(select tier from public.scout_profiles where user_id = tests.uid(40)), (select tier from public.scout_profiles where user_id = tests.uid(39))]),
  array[6, 5]::smallint[], 'ex aequo : le premier arrivé au total passe devant');
select is((select array_agg(badge order by badge) from public.user_badges where user_id = tests.uid(40)),
  array['polar_star', 'promoted'], 'montée en ligue 6 : badges Première montée et Étoile polaire');
select is((select tier from public.scout_profiles where user_id = tests.uid(42)), 2::smallint, 'inactif : ligue gardée');
select is((select tier from public.league_members where user_id = tests.uid(34) and week_start = tests.day('2026-11-09')), 2::smallint,
  'scout en attente : placé par la clôture dans sa nouvelle ligue');
select is((select count(*)::integer from public.league_members m where m.week_start = tests.day('2026-11-02')
  and m.xp <> tests.week_xp(m.user_id, tests.day('2026-11-02'))), 0, 'cache recalculable : xp = somme des notes pour tous les membres');
select is(public.league_ingest(tests.uid(35), tests.self_batch(1, (select sun from cal) - 1), tests.at('2026-11-09 10:00Z')), 0,
  'semaine close : note de samedi refusée');

-- D. Défi (rotation fixe C4) : semaine du 2026-11-02 = rang 3 « Noter 60 cartes ».
select is((select array[kind, target::text] from public.league_challenge(tests.day('2026-11-02'))), array['cards', '60'], 'défi de la semaine 3 : 60 cartes');
select is((select array_agg((public.league_challenge(w)).kind order by w) from (values (date '2026-10-12'), ('2026-10-19'), ('2026-10-26')) v(w)),
  array['active_days', 'zone_cards', 'su'], 'rotation : 4 jours, zone du mois, 40 Su');
select is((select count(*)::integer from public.user_badges where badge = 'challenge' and week_start = tests.day('2026-11-02')), 0, 'aucun scout à 60 cartes');
select public.league_ingest(tests.uid(32), tests.self_batch(30, (select tue from cal) + 1), tests.at('2026-11-04 10:00Z'));
select is((select count(*)::integer from public.user_badges where badge = 'challenge' and user_id = tests.uid(32)), 1,
  'défi relevé dès 60 cartes : badge attribué');

select * from finish();
rollback;
