-- Pages de révision par document (2026-10-18) : une page de session guidée par document de la bibliothèque,
-- en brouillon puis publiée par un admin, comme les questions. Lue par les personnes connectées une fois publiée.
create table if not exists public.doc_pages (
  document_id bigint primary key references public.documents (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published')),
  -- coalesce : une clé absente donnerait null, et un check à null passe.
  data jsonb not null check (coalesce(
    jsonb_typeof(data -> 'objectifs') = 'array'
    and jsonb_typeof(data -> 'sections') = 'array'
    and jsonb_array_length(data -> 'sections') between 1 and 12
    and octet_length(data::text) <= 60000, false)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
alter table public.doc_pages enable row level security;

drop policy if exists "Lecture des pages publiées" on public.doc_pages;
create policy "Lecture des pages publiées" on public.doc_pages for select to authenticated
  using (status = 'published' or (select public.is_admin()));
drop policy if exists "Ajout de pages par les admins" on public.doc_pages;
create policy "Ajout de pages par les admins" on public.doc_pages for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "Modification de pages par les admins" on public.doc_pages;
create policy "Modification de pages par les admins" on public.doc_pages for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Suppression de pages par les admins" on public.doc_pages;
create policy "Suppression de pages par les admins" on public.doc_pages for delete to authenticated using ((select public.is_admin()));

revoke all on public.doc_pages from anon;
grant select, insert, update, delete on public.doc_pages to authenticated;

drop trigger if exists doc_pages_touch on public.doc_pages;
create trigger doc_pages_touch before update on public.doc_pages for each row execute function public.touch_updated_at();
