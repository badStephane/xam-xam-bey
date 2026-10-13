-- RLS : les 12 assertions de revue-qa.md §4 point 3, plus la lecture admin du bucket (contrat lot 1 §3).
-- Lancer : supabase test db (base locale). Tout est annulé en fin de fichier.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Fixtures : A et B (utilisateurs), C (admin confirmé), D (admin à l'e-mail non confirmé).
insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.sn', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.sn', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'admin@test.sn', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'attente@test.sn', null, 'authenticated', 'authenticated');
insert into public.admins (email) values ('admin@test.sn'), ('attente@test.sn');
insert into public.progress (user_id, xp) values ('00000000-0000-0000-0000-00000000000a', 1), ('00000000-0000-0000-0000-00000000000b', 2);
insert into public.cards (id, zone, q, a, status) values ('test-brouillon', 1, 'Q', 'R', 'draft');
insert into storage.objects (bucket_id, name) values ('documents', 'test-rls.pdf');

create schema tests;
create function tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}'
    else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
end $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

-- 1. anon
select tests.login(null);
select ok((select count(*) from public.documents) > 0, 'anon lit documents');
select throws_ok('select * from public.cards', '42501', null, 'anon ne lit pas cards');
select throws_ok('select * from public.progress', '42501', null, 'anon ne lit pas progress');
select throws_ok('select * from public.revision_content', '42501', null, 'anon ne lit pas revision_content');
select throws_ok('select * from public.admins', '42501', null, 'anon ne lit pas admins');
select throws_ok($$insert into public.documents (zone, title, file_name, storage_path, size) values (1, 't', 't.pdf', 'anon.pdf', 1)$$,
  '42501', null, 'anon n''écrit pas documents');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('documents', 'anon.pdf')$$, '42501', null, 'anon n''écrit pas storage');
select is(public.is_admin(), false, 'anon : is_admin() = false');

-- 2. utilisateur A
select tests.login('00000000-0000-0000-0000-00000000000a');
select results_eq('select user_id from public.progress', $$values ('00000000-0000-0000-0000-00000000000a'::uuid)$$, 'A ne lit que sa progression');
select throws_ok($$insert into public.progress (user_id) values ('00000000-0000-0000-0000-00000000000b')$$, '42501', null, 'A ne crée pas la ligne de B');
update public.progress set xp = 99 where user_id = '00000000-0000-0000-0000-00000000000b';
select is((select count(*) from public.cards where status = 'draft'), 0::bigint, 'A ne voit pas les brouillons');
select throws_ok($$insert into public.documents (zone, title, file_name, storage_path, size) values (1, 't', 't.pdf', 'a.pdf', 1)$$,
  '42501', null, 'A n''écrit pas documents');
select throws_ok($$insert into public.cards (id, zone, q, a) values ('test-a', 1, 'Q', 'R')$$, '42501', null, 'A n''écrit pas cards');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('documents', 'a.pdf')$$, '42501', null, 'A n''écrit pas storage');
select is(public.is_admin(), false, 'A : is_admin() = false');
select is((select count(*) from storage.objects where bucket_id = 'documents'), 0::bigint, 'A ne liste pas le bucket documents');
-- Même chemin que l'API Storage, qui lève le verrou storage.protect_delete pour sa requête.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'documents' and name = 'test-rls.pdf';
reset role;
select is((select xp from public.progress where user_id = '00000000-0000-0000-0000-00000000000b'), 2, 'A ne modifie pas la progression de B');
select is((select count(*) from storage.objects where name = 'test-rls.pdf'), 1::bigint, 'A ne supprime pas un fichier du bucket');

-- 3. admin à l'e-mail non confirmé
select tests.login('00000000-0000-0000-0000-00000000000d');
select is(public.is_admin(), false, 'admin non confirmé : is_admin() = false');
select is((select count(*) from public.cards where status = 'draft'), 0::bigint, 'admin non confirmé ne voit pas les brouillons');

-- 4. admin confirmé
select tests.login('00000000-0000-0000-0000-00000000000c');
select is(public.is_admin(), true, 'admin : is_admin() = true');
select lives_ok($$insert into public.cards (id, zone, q, a) values ('test-admin', 1, 'Q', 'R');
  update public.cards set q = 'Q2', status = 'published' where id = 'test-admin'$$, 'admin crée et modifie une carte');
select is((select count(*) from public.cards where id in ('test-admin', 'test-brouillon')), 2::bigint, 'admin voit brouillons et publiées');
select results_eq($$delete from public.cards where id = 'test-admin' returning id$$, $$values ('test-admin'::text)$$, 'admin supprime une carte');
insert into public.documents (zone, title, file_name, storage_path, size) values (1, 't', 't.pdf', 'test-admin.pdf', 1);
select results_eq($$update public.documents set title = 't2' where storage_path = 'test-admin.pdf' returning title$$,
  $$values ('t2'::text)$$, 'admin crée et modifie un document');
select results_eq($$delete from public.documents where storage_path = 'test-admin.pdf' returning storage_path$$, $$values ('test-admin.pdf'::text)$$,
  'admin supprime un document');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('documents', 'nom invalide.pdf')$$, '42501', null, 'admin : nom hors regex refusé');
select is((select count(*) from storage.objects where bucket_id = 'documents' and name = 'test-rls.pdf'), 1::bigint,
  'admin lit le bucket documents (condition de remove())');
select results_eq($$delete from storage.objects where bucket_id = 'documents' and name = 'test-rls.pdf' returning name$$,
  $$values ('test-rls.pdf'::text)$$, 'admin supprime le fichier : remove() renvoie 1 objet (BE-1)');

reset role;
select * from finish();
rollback;
