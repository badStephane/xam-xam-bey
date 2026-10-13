-- Lot 2 : écriture de progress réservée à la RPC (D6) et coupe des séances sous la borne (L1-12).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.sn', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@test.sn', now(), 'authenticated', 'authenticated');
insert into public.progress (user_id, cards, xp) values ('00000000-0000-0000-0000-0000000000b2', '{"b":[1,1,1,1,1]}', 50);

create schema tests;
create function tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}'
    else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
end $$;
-- n séances de jour d0 + i, chacune avec un libellé de 512 caractères (≈ 55 Kio pour 100 séances).
create function tests.big_sessions(p_d0 integer, p_n integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('d', p_d0 + i, 'n', 1, 'ok', 1, 'k', 'z', 'l', repeat(md5((p_d0 + i)::text), 16)) order by i)
  from generate_series(1, p_n) i $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

-- 0. L2-3 : ni MAINTAIN (m), ni TRUNCATE (D), ni REFERENCES (x), ni TRIGGER (t) pour anon et authenticated,
--    sur les tables existantes de public comme sur une table créée après la migration (privilèges par défaut).
create function tests.risky_grants(p_rel regclass default null) returns setof text language sql as $$
  select c.relname || ':' || pg_get_userbyid(a.grantee) || ':' || a.privilege_type
  from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f')
    and (p_rel is null or c.oid = p_rel)
    and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
    and a.privilege_type in ('MAINTAIN', 'TRUNCATE', 'REFERENCES', 'TRIGGER') $$;
select is_empty('select * from tests.risky_grants()', 'tables existantes : aucun m, D, x, t pour anon et authenticated');
select is_empty($$select a.privilege_type from pg_default_acl d, aclexplode(d.defaclacl) a
  where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r'
    and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
    and a.privilege_type in ('MAINTAIN', 'TRUNCATE', 'REFERENCES', 'TRIGGER')$$,
  'privilèges par défaut de postgres dans public : aucun m, D, x, t pour anon et authenticated');
create table public.zz_lot2_sonde (id integer);
select is((select pg_get_userbyid(relowner)::text from pg_class where oid = 'public.zz_lot2_sonde'::regclass), 'postgres',
  'la table sonde appartient à postgres, comme les tables des migrations');
select is_empty($$select * from tests.risky_grants('public.zz_lot2_sonde')$$, 'table future : n''hérite d''aucun m, D, x, t');
drop table public.zz_lot2_sonde;

-- 1. Forme de la fonction et des droits.
select ok((select prosecdef from pg_proc where oid = 'public.save_progress(jsonb, jsonb, integer)'::regprocedure), 'save_progress est security definer');
select is((select proconfig from pg_proc where oid = 'public.save_progress(jsonb, jsonb, integer)'::regprocedure), array['search_path=""'], 'search_path vide');
select ok(not has_table_privilege('authenticated', 'public.progress', 'insert'), 'authenticated n''a plus insert sur progress');
select ok(not has_table_privilege('authenticated', 'public.progress', 'update'), 'authenticated n''a plus update sur progress');
select ok(has_table_privilege('authenticated', 'public.progress', 'select'), 'authenticated garde select sur progress');
select ok(not has_table_privilege('authenticated', 'public.progress', 'truncate'), 'authenticated n''a pas truncate sur progress');
select is((select count(*) from pg_policy where polrelid = 'public.progress'::regclass and polcmd in ('a', 'w', '*')), 0::bigint,
  'plus aucune politique d''écriture sur progress');

-- 2. Écriture directe refusée, même sur sa propre ligne.
select tests.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$insert into public.progress (user_id) values ('00000000-0000-0000-0000-0000000000a2')$$, '42501', null, 'insert direct refusé');
select is((select xp from public.save_progress('{"a":[1,10,1,1,5]}', '[]', 10)), 10, 'la RPC crée la ligne de l''utilisateur');
select throws_ok($$update public.progress set xp = 999 where user_id = '00000000-0000-0000-0000-0000000000a2'$$, '42501', null, 'update direct refusé');
select throws_ok($$insert into public.progress (user_id, xp) values ('00000000-0000-0000-0000-0000000000a2', 999)
  on conflict (user_id) do update set xp = 999$$, '42501', null, 'upsert direct refusé');
select results_eq('select user_id, xp from public.progress', $$values ('00000000-0000-0000-0000-0000000000a2'::uuid, 10)$$,
  'lecture : sa ligne seulement, inchangée');
select is((select xp from public.save_progress('{}', '[]', 20)), 20, 'la RPC met à jour la ligne de l''utilisateur');

-- 3. Anon et session sans utilisateur refusés.
select tests.login(null);
select throws_ok($$select public.save_progress('{}', '[]', 0)$$, '42501', null, 'anon ne peut pas appeler save_progress');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select throws_ok($$select public.save_progress('{}', '[]', 0)$$, '42501', 'Session requise', 'auth.uid() nul : refus');

-- 4. L1-12 : deux appels valides dont l'union dépasse 64 Kio. Plus de 23514, les plus anciennes sont coupées.
select tests.login('00000000-0000-0000-0000-0000000000a2');
select ok(pg_column_size(tests.big_sessions(1000, 100)) between 49152 and 65536, 'chaque appel est valide (entre 48 et 64 Kio)');
select lives_ok($$select public.save_progress('{}', tests.big_sessions(1000, 100), 0)$$, 'premier appel accepté');
create temp table r2 as select cards, sessions, xp from public.save_progress('{}', tests.big_sessions(2000, 100), 0);
select ok((select pg_column_size(sessions) <= 65536 and jsonb_array_length(sessions) between 101 and 199 from r2),
  'union coupée sous la borne, sans 23514');
select ok((select (sessions -> 0 ->> 'd')::int > 1001 and (sessions -> -1 ->> 'd')::int = 2100
  and sessions @> tests.big_sessions(2000, 100) from r2), 'les plus anciennes sont coupées, les plus récentes gardées');

-- 5. Idempotence conservée après la coupe : rejouer l'un ou l'autre appel ne change rien.
select results_eq($$select cards, sessions, xp from public.save_progress('{}', tests.big_sessions(2000, 100), 0)$$,
  'select * from r2', 'rejouer le second appel donne le même état');
select results_eq($$select cards, sessions, xp from public.save_progress('{}', tests.big_sessions(1000, 100), 0)$$,
  'select * from r2', 'rejouer le premier appel ne fait rien reculer');

-- 6. La ligne de B n'a jamais été touchée.
reset role;
select results_eq($$select cards, xp from public.progress where user_id = '00000000-0000-0000-0000-0000000000b2'$$,
  $$values ('{"b":[1,1,1,1,1]}'::jsonb, 50)$$, 'la ligne de B est intacte');

select * from finish();
rollback;
