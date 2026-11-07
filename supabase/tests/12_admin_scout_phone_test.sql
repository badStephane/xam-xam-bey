-- Connexion par numéro (2026-11-07) : l'admin trouve un compte sans e-mail par une partie de son numéro, l'identifiant
-- affiché et noté au journal est « +221… ». Tout est annulé en fin de fichier.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, phone, phone_confirmed_at, email_confirmed_at, aud, role, created_at) values
  ('00000000-0000-0000-0000-000000000c01', null, '221771112233', now(), null, 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000c02', 'tel-mail@test.sn', null, null, now(), 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000c0c', 'tel-admin@test.sn', null, null, now(), 'authenticated', 'authenticated', now());
insert into public.admins (email) values ('tel-admin@test.sn');

create schema phone_tests;
create function phone_tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema phone_tests to authenticated;
grant execute on all functions in schema phone_tests to authenticated;

select phone_tests.login('00000000-0000-0000-0000-000000000c0c');

select results_eq($$select user_id, email from public.admin_find_scouts('77 111')$$,
  $$values ('00000000-0000-0000-0000-000000000c01'::uuid, '+221771112233')$$,
  'recherche : une partie du numéro (espaces ignorés) trouve le compte sans e-mail, affiché en +221…');
select results_eq($$select user_id from public.admin_find_scouts('+221 77 111 22 33')$$,
  $$values ('00000000-0000-0000-0000-000000000c01'::uuid)$$,
  'recherche : le numéro complet au format international trouve le compte');
select results_eq($$select user_id from public.admin_find_scouts('tel-mail')$$,
  $$values ('00000000-0000-0000-0000-000000000c02'::uuid)$$,
  'recherche : les comptes e-mail restent trouvés par leur adresse');
select is((public.admin_scout_progress('00000000-0000-0000-0000-000000000c01')) ->> 'email', '+221771112233',
  'fiche : le numéro sert d’identifiant au compte sans e-mail');

reset role;
select is((select target_email from public.admin_views where target_id = '00000000-0000-0000-0000-000000000c01'), '+221771112233',
  'journal : la fiche ouverte est notée avec le numéro');

-- Un compte téléphone ne devient pas admin, même si son numéro figurait par erreur dans la liste (e-mails seulement).
select phone_tests.login('00000000-0000-0000-0000-000000000c01');
select is(public.is_admin(), false, 'droits : un compte sans e-mail confirmé n’est pas admin');

select * from finish();
rollback;
