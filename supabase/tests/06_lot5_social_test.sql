-- Lot 5 : pseudo (C5, P3, A10), lecture du classement sans fuite (L5-3), signalement (A4), admin (L5-5), droits.
begin;
create extension if not exists pgtap with schema extensions;
select plan(70);

create schema tests;
create function tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}'
    else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
end $$;
create function tests.uid(p_n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid $$;
-- Indice (hint) d'une erreur : la suggestion de pseudo libre.
create function tests.err_hint(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v = pg_exception_hint;
  return v;
end $$;
create function tests.note(p_card text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('c', p_card, 'd', (current_date - date '1970-01-01'), 'g', 1)) $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

insert into public.cards (id, zone, q, a, qcm, status)
select 'zz-s' || lpad(i::text, 2, '0'), 1, 'Question ' || i, 'Réponse ' || i, null, 'published' from generate_series(1, 5) i;
insert into auth.users (id, email, email_confirmed_at, created_at, aud, role)
select tests.uid(i), 'p' || i || '@test.sn', now(), now() - interval '30 days', 'authenticated', 'authenticated' from generate_series(1, 7) i;
insert into public.admins (email) values ('p7@test.sn');

-- 1. Format (C5) : erreurs avec code métier stable.
select tests.login(tests.uid(1));
select throws_ok($$select public.set_pseudo('ab')$$, '22023', 'PSEUDO_INVALID', 'pseudo de 2 caractères refusé');
select throws_ok($$select public.set_pseudo('Abcdefghijklmnopqrstu')$$, '22023', 'PSEUDO_INVALID', 'pseudo de 21 caractères refusé');
select throws_ok($$select public.set_pseudo('Calao Agile')$$, '22023', 'PSEUDO_INVALID', 'espace refusé');
select throws_ok($$select public.set_pseudo('Calao.Agile')$$, '22023', 'PSEUDO_INVALID', 'point refusé (C5 : tiret et tiret bas seulement)');
select throws_ok($$select public.set_pseudo('7Calao')$$, '22023', 'PSEUDO_INVALID', 'doit commencer par une lettre');
select throws_ok($$select public.set_pseudo('Calao77123')$$, '22023', 'PSEUDO_INVALID', 'plus de 4 chiffres refusé (numéro)');
select throws_ok($$select public.set_pseudo('calao@sn')$$, '22023', 'PSEUDO_INVALID', 'arobase refusée');
select throws_ok($$select public.set_pseudo('a__')$$, '22023', 'PSEUDO_INVALID', 'clé de moins de 3 caractères refusée');
select is(public.set_pseudo('Ñdeye_Ŋoor'), '{"pseudo": "Ñdeye_Ŋoor", "state": "ok"}'::jsonb, 'lettres wolof et accents acceptés');
select tests.login(tests.uid(4));
select is(public.set_pseudo('Élodie_K') ->> 'state', 'ok', 'pseudo accentué accepté');

-- 2. Unicité sans casse, accents ni séparateurs ; mots refusés ; délai de 24 h.
select tests.login(tests.uid(2));
select throws_ok($$select public.set_pseudo('NDEYE-NOOR')$$, '23505', 'PSEUDO_TAKEN', 'collision casse et séparateur');
select throws_ok($$select public.set_pseudo('ndéyé_noor')$$, '23505', 'PSEUDO_TAKEN', 'collision accents');
select ok(tests.err_hint($$select public.set_pseudo('ndeye_noor')$$) ~ '^ndeye_noor[0-9]{2}$', 'pseudo pris : suggestion libre dans hint');
select throws_ok($$select public.set_pseudo('Salope')$$, '22023', 'PSEUDO_REFUSED', 'mot refusé');
select throws_ok($$select public.set_pseudo('GrosseSal0pe')$$, '22023', 'PSEUDO_REFUSED', 'mot refusé contenu, variante 0→o');
select throws_ok($$select public.set_pseudo('Con27')$$, '22023', 'PSEUDO_REFUSED', 'mot exact avec chiffres ajoutés');
select throws_ok($$select public.set_pseudo('doomu_xaraam')$$, '22023', 'PSEUDO_REFUSED', 'mot refusé wolof');
select is(public.set_pseudo('Faucon27') ->> 'state', 'ok', 'Faucon n''est pas bloqué par « con » (mot exact)');
select is(public.set_pseudo('FAUCON27') ->> 'pseudo', 'FAUCON27', 'changer la casse seulement : permis');
select throws_ok($$select public.set_pseudo('Gazelle12')$$, 'P0001', 'PSEUDO_TOO_SOON', 'deuxième changement dans les 24 h refusé');
select ok(tests.err_hint($$select public.set_pseudo('Gazelle12')$$) ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$', 'hint = date ISO du prochain changement');

-- 2 bis. Non-régression de la liste amorcée (L5-3) : prénoms et noms usuels acceptés, insultes toujours refusées.
reset role;
select is_empty($$select n from unnest(array['Nazir', 'Nazira', 'Naziha', 'Nazim', 'Salahoudine', 'Salaudin', 'Anazi', 'Golo', 'Dof',
  'Saga', 'Faucon', 'Calcul', 'Habite', 'Violette']) n where public.pseudo_blocked(public.pseudo_key(n))$$,
  'prénoms et mots usuels : aucun refusé');
select is((select count(*)::integer from unnest(array['Nazi', 'N4zi', 'Nazi88', 'Salaud', 'Salaud2', 'Salope', 'Connard']) n
  where public.pseudo_blocked(public.pseudo_key(n))), 7, 'insultes : toujours refusées (exact, avec chiffres ou leet)');

-- 3. Classement : 4 scouts avec pseudo dans un groupe, 1 sans pseudo, 1 parti. Aucune fuite.
select tests.login(tests.uid(3));
select public.set_pseudo('Lion77');
select tests.login(tests.uid(6));
select is(public.set_league_opt_in(false), '{"optIn": false}'::jsonb, '« Non merci » enregistré');
select tests.login(tests.uid(1));
select is((public.get_league_state() ->> 'status'), 'not_started', 'pseudo sans note de la semaine : not_started');
select tests.login(tests.uid(1)); select grades_counted from public.save_progress('{}', '[]', 0, tests.note('zz-s01'));
select tests.login(tests.uid(2)); select grades_counted from public.save_progress('{}', '[]', 0, tests.note('zz-s01'));
select tests.login(tests.uid(3)); select grades_counted from public.save_progress('{}', '[]', 0, tests.note('zz-s01'));
select tests.login(tests.uid(4)); select grades_counted from public.save_progress('{}', '[]', 0, tests.note('zz-s01'));
select tests.login(tests.uid(5)); select grades_counted from public.save_progress('{}', '[]', 0, tests.note('zz-s01'));
select tests.login(tests.uid(6)); select grades_counted from public.save_progress('{}', '[]', 0, tests.note('zz-s01'));
select tests.login(tests.uid(1));
create temp table st as select public.get_league_state() as j;
select is(j ->> 'status', 'active', 'scout classé : active') from st;
select is(jsonb_array_length(j -> 'group'), 4, 'groupe : les 4 scouts avec pseudo, ni le scout sans pseudo ni celui parti') from st;
select is((select count(*)::integer from st, jsonb_array_elements(j -> 'group') g where (g ->> 'isMe')::boolean), 1, 'une seule ligne isMe') from st;
select ok(position('@' in j::text) = 0, 'aucun e-mail dans la réponse') from st;
select ok(not exists (select 1 from generate_series(1, 7) i where position(tests.uid(i)::text in (select j::text from st)) > 0),
  'aucun user_id (ni le sien ni celui des autres) dans la réponse');
select is((select array_agg(k order by k) from st, jsonb_array_elements(j -> 'group') g, jsonb_object_keys(g) k where g ->> 'pseudo' = 'Lion77'),
  array['id', 'isMe', 'pseudo', 'rank', 'xp', 'zone'], 'ligne du classement : 6 champs seulement');
select is((select j -> 'challenge' ->> 'kind' from st) is not null and (select jsonb_typeof(j -> 'badges') from st) = 'array', true,
  'défi et badges toujours présents');
select is((select (j ->> 'weekXp')::integer from st), 5, 'weekXp = XP vérifiée de la semaine');
select tests.login(tests.uid(5));
select is((public.get_league_state() ->> 'status'), 'no_pseudo', 'sans pseudo : no_pseudo, group vide');
select tests.login(tests.uid(6));
select is((public.get_league_state() ->> 'status'), 'opted_out', 'parti : opted_out');
select is(public.set_pseudo('Pelican') ->> 'state', 'ok', 'revenir = choisir un pseudo (opt-in rétabli)');
select is((public.get_league_state() ->> 'status'), 'active', 'de retour avec l''XP de la semaine reprise');

-- 4. Signalement (A4) : par identifiant opaque du groupe, sans doublon, borné.
select tests.login(tests.uid(1));
create temp table ids as select g ->> 'pseudo' as pseudo, (g ->> 'id')::uuid as id from st, jsonb_array_elements(j -> 'group') g;
grant select on ids to authenticated;
select lives_ok($$select public.report_pseudo((select id from ids where pseudo = 'FAUCON27'))$$, 'signaler un membre du groupe');
select lives_ok($$select public.report_pseudo((select id from ids where pseudo = 'FAUCON27'))$$, 'deuxième signalement du même pseudo : sans effet');
select throws_ok($$select public.report_pseudo((select id from ids where pseudo = 'Ñdeye_Ŋoor'))$$, '22023', 'MEMBER_NOT_FOUND', 'se signaler soi-même : refusé');
select throws_ok($$select public.report_pseudo(gen_random_uuid())$$, '22023', 'MEMBER_NOT_FOUND', 'identifiant inconnu : refusé');
select throws_ok($$select public.report_pseudo('00000000-0000-0000-0000-000000000002')$$, '22023', 'MEMBER_NOT_FOUND', 'user_id au lieu de l''id opaque : refusé');
reset role;
insert into public.pseudo_reports (reporter_id, target_id, pseudo_key)
select tests.uid(3), tests.uid(1), 'ancien' || i from generate_series(1, 10) i;
select tests.login(tests.uid(3));
select throws_ok($$select public.report_pseudo((select id from ids where pseudo = 'Élodie_K'))$$, 'P0001', 'RATE_LIMITED', '10 signalements en 24 h : RATE_LIMITED');

-- 5. Administration.
select throws_ok($$select * from public.admin_list_pseudos()$$, '42501', 'FORBIDDEN', 'non-admin : liste refusée');
select throws_ok($$select public.admin_moderate_pseudo('00000000-0000-0000-0000-000000000002', 'reset')$$, '42501', 'FORBIDDEN', 'non-admin : modération refusée');
select throws_ok($$select public.admin_set_blocked_word('grosmot')$$, '42501', 'FORBIDDEN', 'non-admin : liste de mots refusée');
select tests.login(tests.uid(7));
select is((select array[pseudo, reports::text] from public.admin_list_pseudos() limit 1), array['FAUCON27', '1'], 'admin : signalés en tête');
select is((select count(*)::integer from public.admin_list_pseudos(null, null, 2)), 2, 'admin : limite respectée');
select is((select count(*)::integer from public.admin_list_pseudos(null, (select cursor from public.admin_list_pseudos(null, null, 2) offset 1), 100)), 3,
  'admin : page suivante par curseur (5 pseudos)');
select is((select pseudo from public.admin_list_pseudos('lion')), 'Lion77', 'admin : recherche sans casse');
select throws_ok($$select * from public.admin_list_pseudos(null, 'x')$$, '22023', 'CURSOR_INVALID', 'curseur invalide refusé');
select lives_ok($$select public.admin_moderate_pseudo('00000000-0000-0000-0000-000000000002', 'ignore')$$, 'admin : ignorer');
select is((select reports from public.admin_list_pseudos('faucon')), 0, 'signalements écartés');
select lives_ok($$select public.admin_moderate_pseudo('00000000-0000-0000-0000-000000000001', 'refuse')$$, 'admin : refuser');
select throws_ok($$select public.admin_moderate_pseudo('00000000-0000-0000-0000-000000000001', 'bannir')$$, '22023', 'ACTION_INVALID', 'action inconnue');
select is(public.admin_set_blocked_word('Gros Mot', true), 'grosmot', 'admin : mot ajouté, normalisé');
select tests.login(tests.uid(1));
select is((public.get_league_state() ->> 'status'), 'reset', 'pseudo refusé : état reset vu par le scout');
select throws_ok($$select public.set_pseudo('ndeye-noor')$$, '22023', 'PSEUDO_REFUSED', 'pseudo refusé : réutilisation impossible');
select throws_ok($$select public.set_pseudo('Gros-Mot')$$, '22023', 'PSEUDO_REFUSED', 'mot ajouté par l''admin : appliqué');
select is(public.set_pseudo('Baobab') ->> 'state', 'ok', 'après réinitialisation : nouveau pseudo sans délai');
select tests.login(tests.uid(3));
select is((select count(*)::integer from jsonb_array_elements(public.get_league_state() -> 'group') g where g ->> 'pseudo' = 'Ñdeye_Ŋoor'), 0,
  'pseudo retiré : plus affiché aux autres');

-- 6. Droits : anon n'exécute aucune fonction du lot 5, authenticated seulement les RPC publics ; tables fermées.
reset role;
create temp table lot5_fn as select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
  'league_week_of', 'week_ends_at', 'week_deadline', 'day_num', 'zone_of_day', 'qcm_text', 'league_challenge', 'league_challenge_progress',
  'league_join', 'league_ingest', 'league_refresh', 'league_close_week', 'league_close_due', 'pseudo_key', 'pseudo_blocked',
  'pseudo_format_error', 'pseudo_suggest', 'league_leave', 'league_state', 'assert_admin', 'save_progress', 'set_pseudo',
  'set_league_opt_in', 'get_league_state', 'report_pseudo', 'admin_list_pseudos', 'admin_moderate_pseudo', 'admin_list_blocked_words',
  'admin_set_blocked_word', 'admin_remove_blocked_word');
select is((select count(*)::integer from lot5_fn), 30, '30 fonctions du lot 5 recensées');
select is_empty($$select proname from lot5_fn where has_function_privilege('anon', oid, 'execute')$$, 'anon n''exécute aucune fonction du lot 5');
select is((select array_agg(proname::text order by proname) from lot5_fn where has_function_privilege('authenticated', oid, 'execute')),
  array['admin_list_blocked_words', 'admin_list_pseudos', 'admin_moderate_pseudo', 'admin_remove_blocked_word', 'admin_set_blocked_word',
        'get_league_state', 'report_pseudo', 'save_progress', 'set_league_opt_in', 'set_pseudo'],
  'authenticated n''exécute que les 10 RPC publics');
select ok((select bool_and(prosecdef) and bool_and(proconfig = array['search_path=""']) from lot5_fn
  where proname not in ('league_week_of', 'week_ends_at', 'week_deadline', 'day_num', 'zone_of_day', 'qcm_text', 'league_challenge',
                        'pseudo_key', 'pseudo_format_error')), 'RPC et fonctions d''accès : security definer, search_path vide');
create temp table lot5_tab as select c.oid, c.relname, c.relrowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace
  and c.relname in ('scout_profiles', 'pseudo_blocklist', 'grade_events', 'league_weeks', 'league_groups', 'league_members',
                    'user_badges', 'pseudo_reports');
select ok((select count(*) = 8 and bool_and(relrowsecurity) from lot5_tab), '8 tables, RLS active partout');
select is((select count(*)::integer from pg_policy where polrelid in (select oid from lot5_tab)), 0, 'aucune politique : rien n''est lisible en direct');
select is_empty($$select relname, r, priv from lot5_tab, unnest(array['anon', 'authenticated']) r,
  unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) priv
  where has_table_privilege(r, oid, priv)$$, 'aucun droit de table pour anon ni authenticated');
select tests.login(tests.uid(1));
select throws_ok($$select pseudo from public.scout_profiles$$, '42501', null, 'lecture directe des profils refusée');
select tests.login(null);
select throws_ok($$select public.get_league_state()$$, '42501', null, 'anon : get_league_state refusé');

select * from finish();
rollback;
