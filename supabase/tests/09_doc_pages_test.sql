-- Pages de révision par document (2026-10-18) : forme des données et droits (RLS). Tout est annulé en fin de fichier.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000009a1', 'page-lecteur@test.sn', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000009c1', 'page-admin@test.sn', now(), 'authenticated', 'authenticated');
insert into public.admins (email) values ('page-admin@test.sn');

create schema pages_tests;
create function pages_tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}'
    else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
end $$;
grant usage on schema pages_tests to anon, authenticated;
grant execute on all functions in schema pages_tests to anon, authenticated;

create table pages_tests.ids as select (select min(id) from public.documents) as pub, (select max(id) from public.documents) as brouillon;
grant select on pages_tests.ids to anon, authenticated;

insert into public.doc_pages (document_id, status, data) select pub, 'published', '{"objectifs":["o"],"sections":[{"h":"S","items":["a"]}]}' from pages_tests.ids;
insert into public.doc_pages (document_id, status, data) select brouillon, 'draft', '{"objectifs":["o"],"sections":[{"h":"S","items":["b"]}]}' from pages_tests.ids;

select throws_ok($$insert into public.doc_pages (document_id, data) values ((select min(id) + 1 from public.documents), '{"objectifs":[]}')$$, '23514', null, 'sections obligatoires');
select throws_ok($$insert into public.doc_pages (document_id, data) values ((select min(id) + 1 from public.documents), '{"objectifs":[],"sections":[]}')$$, '23514', null, 'au moins une section');
select throws_ok($$insert into public.doc_pages (document_id, status, data) values ((select min(id) + 1 from public.documents), 'archive', '{"objectifs":[],"sections":[{}]}')$$, '23514', null, 'statut inconnu refusé');
select throws_ok($$insert into public.doc_pages (document_id, data) values (-1, '{"objectifs":[],"sections":[{}]}')$$, '23503', null, 'document inexistant refusé');

select pages_tests.login(null);
select throws_ok('select * from public.doc_pages', '42501', null, 'anon ne lit pas doc_pages');

select pages_tests.login('00000000-0000-0000-0000-0000000009a1');
select is((select count(*) from public.doc_pages p, pages_tests.ids i where p.document_id in (i.pub, i.brouillon)), 1::bigint, 'connecté : la page publiée seulement');
select is((select p.status from public.doc_pages p, pages_tests.ids i where p.document_id = i.pub), 'published', 'connecté : lit la page publiée');
select throws_ok($$insert into public.doc_pages (document_id, data) values ((select min(id) + 2 from public.documents), '{"objectifs":[],"sections":[{}]}')$$, '42501', null, 'connecté : ajout refusé');
update public.doc_pages p set status = 'draft' from pages_tests.ids i where p.document_id = i.pub;

select pages_tests.login('00000000-0000-0000-0000-0000000009c1');
select is((select p.status from public.doc_pages p, pages_tests.ids i where p.document_id = i.pub), 'published', 'connecté : modification sans effet');
select is((select count(*) from public.doc_pages p, pages_tests.ids i where p.document_id in (i.pub, i.brouillon)), 2::bigint, 'admin : lit aussi les brouillons');
update public.doc_pages p set status = 'published' from pages_tests.ids i where p.document_id = i.brouillon;
select is((select p.status from public.doc_pages p, pages_tests.ids i where p.document_id = i.brouillon), 'published', 'admin : publie');
delete from public.doc_pages p using pages_tests.ids i where p.document_id = i.brouillon;
select is((select count(*) from public.doc_pages p, pages_tests.ids i where p.document_id = i.brouillon), 0::bigint, 'admin : supprime');

select * from finish();
rollback;
