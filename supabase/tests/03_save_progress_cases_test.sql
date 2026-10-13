-- QA lot 1 : cas manquants de save_progress (lignes héritées de l'ancien client, entrées nulles, rejeu intercalé).
-- La concurrence entre deux connexions ne se teste pas dans une transaction pgTAP : voir docs/squad/07-qa.md (preuve 4).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@test.sn', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@test.sn', now(), 'authenticated', 'authenticated');
-- Ligne écrite par l'ancien client (upsert entier) : entrée corrompue par NaN (QA-9), séance sans jour.
insert into public.progress (user_id, cards, sessions, xp) values
  ('00000000-0000-0000-0000-0000000000e1', '{"n":[3,20745,null,null,20738],"k":[1,20740,2,1,20739]}',
   '[{"foo":1},{"d":3,"n":1,"ok":1,"k":"z","l":"x"}]', 7),
  ('00000000-0000-0000-0000-0000000000e2', '{"bad":[1,2,"x",4,5]}', '[]', 0);

create schema tests;
create function tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

select tests.login('00000000-0000-0000-0000-0000000000e1');
create temp table r1 as select * from public.save_progress('{"n":[1,20750,1,1,20749]}', '[]', 1);
select is((select cards -> 'n' from r1), '[1,20750,1,1,20749]'::jsonb, 'entrée héritée à vues nulles : remplacée par l''entrée valide');
select is((select cards -> 'k' from r1), '[1,20740,2,1,20739]'::jsonb, 'carte héritée absente de l''appel : conservée');
select is((select xp from r1), 7, 'xp hérité plus grand : conservé');
select is((select sessions -> 1 ->> 'd' from r1), '3', 'séance héritée conservée, séance sans jour triée en tête');

-- Rejeu intercalé : A envoie X, un autre appareil envoie Y, A renvoie X (nouvel essai après expiration) : rien ne recule.
create temp table r2 as select cards, sessions, xp from public.save_progress('{"y":[5,30000,5,5,29990]}', '[{"d":9,"n":1,"ok":1,"k":"z","l":"x"}]', 40);
select results_eq($$select cards, sessions, xp from public.save_progress('{"n":[1,20750,1,1,20749]}', '[]', 1)$$,
  'select * from r2', 'rejouer un ancien appel après un autre appareil ne fait rien reculer');

select throws_ok($$select public.save_progress('{}', '[]', null)$$, '22023', null, 'xp nul refusé');
select throws_ok($$select public.save_progress('{}', null, 0)$$, '22023', null, 'séances nulles refusées');

-- L1-3 (corrigé) : une ligne héritée dont une entrée contient un texte ne fait plus échouer l'appel (tri via json_num).
select tests.login('00000000-0000-0000-0000-0000000000e2');
select lives_ok($$select public.save_progress('{}', '[]', 0)$$, 'ligne héritée avec un texte dans une entrée : appel accepté');

select * from finish();
rollback;
