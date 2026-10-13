-- RPC save_progress (contrat lot 1 §1) et bornes de la table progress.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.sn', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.sn', now(), 'authenticated', 'authenticated');
insert into public.progress (user_id, xp) values ('00000000-0000-0000-0000-00000000000b', 50);

create schema tests;
create function tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}'
    else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
end $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

select has_function('public', 'save_progress', array['jsonb', 'jsonb', 'integer'], 'save_progress existe');

-- Droits : anon ne peut pas appeler la fonction.
select tests.login(null);
select throws_ok($$select public.save_progress('{}', '[]', 0)$$, '42501', null, 'anon ne peut pas appeler save_progress');

-- Première écriture : crée la ligne de A.
select tests.login('00000000-0000-0000-0000-00000000000a');
select is((select xp from public.save_progress('{"c1":[1,10,2,1,5]}', '[{"d":5,"n":1,"ok":1,"k":"z","l":"x"}]', 10)), 10, 'crée la ligne au premier appel');

-- Deuxième appareil : c1 moins vu, c2 nouvelle, une séance déjà connue, une plus ancienne, xp plus petit.
create temp table r2 as select * from public.save_progress('{"c1":[3,99,1,1,5],"c2":[0,7,1,0,7]}',
  '[{"d":5,"n":1,"ok":1,"k":"z","l":"x"},{"d":3,"n":2,"ok":0,"k":"z","l":"x"}]', 4);
select is((select cards from r2), '{"c1":[1,10,2,1,5],"c2":[0,7,1,0,7]}'::jsonb, 'union des cartes, la plus vue gagne');
select is((select sessions from r2), '[{"d":3,"n":2,"ok":0,"k":"z","l":"x"},{"d":5,"n":1,"ok":1,"k":"z","l":"x"}]'::jsonb,
  'séances : union sans doublon, triée par d');
select is((select xp from r2), 10, 'xp = greatest');
select ok((select updated_at from r2) is not null, 'updated_at renvoyé');

select is((select cards -> 'c1' from public.save_progress('{"c1":[2,20,3,2,5]}', '[]', 0)), '[2,20,3,2,5]'::jsonb, 'plus de vues : l''entrée reçue gagne');
select is((select cards -> 'c1' from public.save_progress('{"c1":[0,30,3,2,5]}', '[]', 0)), '[0,30,3,2,5]'::jsonb, 'égalité de vues : la plus grande échéance gagne');
select is((select cards -> 'c1' from public.save_progress('{"c1":[9,25,3,9,5]}', '[]', 0)), '[0,30,3,2,5]'::jsonb, 'égalité de vues, échéance plus petite : ignorée');

-- Idempotence : rejouer exactement le même appel ne change rien.
create temp table r3 as select cards, sessions, xp from public.save_progress('{"c3":[1,1,1,1,1]}', '[{"d":9,"n":1,"ok":1,"k":"z","l":"x"}]', 12);
select results_eq($$select cards, sessions, xp from public.save_progress('{"c3":[1,1,1,1,1]}', '[{"d":9,"n":1,"ok":1,"k":"z","l":"x"}]', 12)$$,
  'select * from r3', 'rejouer le même appel donne le même état');

-- Plafond de 200 séances : on garde les plus récentes.
create temp table r4 as select * from public.save_progress('{}',
  (select jsonb_agg(jsonb_build_object('d', 1000 + i, 'n', 1, 'ok', 1, 'k', 'z', 'l', 'x')) from generate_series(0, 199) i), 0);
select is((select jsonb_array_length(sessions) from r4), 200, 'au plus 200 séances');
select is((select (sessions -> 0 ->> 'd')::int from r4), 1000, 'les séances les plus anciennes sont retirées');

-- Entrées mal formées : erreur 22023.
select throws_ok($$select public.save_progress('[]', '[]', 0)$$, '22023', null, 'cards doit être un objet');
select throws_ok($$select public.save_progress('{"c":[1,2,3]}', '[]', 0)$$, '22023', null, 'entrée de carte de 5 éléments');
select throws_ok($$select public.save_progress('{"c":[1,2,3,4,-1]}', '[]', 0)$$, '22023', null, 'entiers positifs');
select throws_ok($$select public.save_progress('{"c":[1,2,3,4,1.5]}', '[]', 0)$$, '22023', null, 'entiers seulement');
select throws_ok($$select public.save_progress('{"c":[1,2,3,4,"5"]}', '[]', 0)$$, '22023', null, 'pas de chaîne dans une entrée');
select throws_ok($$select public.save_progress('{}', '{}', 0)$$, '22023', null, 'sessions doit être un tableau');
select throws_ok($$select public.save_progress('{}', '[1]', 0)$$, '22023', null, 'chaque séance est un objet');
select throws_ok($$select public.save_progress('{}', (select jsonb_agg(jsonb_build_object('d', i)) from generate_series(0, 200) i), 0)$$,
  '22023', null, 'au plus 200 séances reçues');
select throws_ok($$select public.save_progress('{}', '[]', 10000001)$$, '22023', null, 'xp plafonné');
select throws_ok($$select public.save_progress((select jsonb_object_agg(repeat('k', 300) || i, '[0,0,0,0,0]'::jsonb) from generate_series(1, 1000) i), '[]', 0)$$,
  '22023', null, 'cards plafonné à 256 Kio');

select throws_ok($$select public.save_progress('{}', (select jsonb_agg(jsonb_build_object('d', i, 'l', repeat(md5(i::text), 400))) from generate_series(1, 10) i), 0)$$,
  '22023', null, 'séances plafonnées à 64 Kio (L1-2)');
-- Ordre canonique à jour égal (L1-1) : n et ok numériques, puis k et l en collation C.
select is((select jsonb_build_array(sessions -> 197, sessions -> 198, sessions -> 199) from public.save_progress('{}',
  '[{"d":5000,"n":10,"ok":0,"k":"a","l":"x"},{"d":5000,"n":9,"ok":1,"k":"a","l":"x"},{"d":5000,"n":9,"ok":1,"k":"Z","l":"x"}]', 0)),
  '[{"d":5000,"n":9,"ok":1,"k":"Z","l":"x"},{"d":5000,"n":9,"ok":1,"k":"a","l":"x"},{"d":5000,"n":10,"ok":0,"k":"a","l":"x"}]'::jsonb,
  'à jour égal : n numérique (9 < 10), puis k en collation C (Z < a)');
-- La ligne de B n'est jamais touchée.
reset role;
select is((select xp from public.progress where user_id = '00000000-0000-0000-0000-00000000000b'), 50, 'la ligne de B est intacte');

-- Bornes de la table et horodatage serveur.
select throws_ok($$update public.progress set xp = 10000001 where user_id = '00000000-0000-0000-0000-00000000000b'$$, '23514', null, 'check xp');
select throws_ok($$update public.progress set sessions = (select jsonb_agg(jsonb_build_object('l', repeat(md5(i::text), 400))) from generate_series(1, 10) i)
  where user_id = '00000000-0000-0000-0000-00000000000b'$$, '23514', null, 'check taille des séances');
update public.progress set updated_at = '2000-01-01' where user_id = '00000000-0000-0000-0000-00000000000b';
select is((select updated_at from public.progress where user_id = '00000000-0000-0000-0000-00000000000b'), now(), 'updated_at posé par le serveur');

select * from finish();
rollback;
