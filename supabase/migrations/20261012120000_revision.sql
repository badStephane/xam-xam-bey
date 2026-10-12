-- Xam Xam Bëy : contenu de révision (lecture pour toute personne connectée) et progression personnelle.

-- Contenu : documents « plan », « fiche-N », « cards-N ». Écriture réservée au rôle service (SQL, CLI, tableau de bord).
create table if not exists public.revision_content (
  id text primary key check (id ~ '^(plan|fiche-[0-9]+|cards-[0-9]+)$'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.revision_content enable row level security;

drop policy if exists "Lecture du contenu par les personnes connectées" on public.revision_content;
create policy "Lecture du contenu par les personnes connectées"
  on public.revision_content for select
  to authenticated
  using (true);

revoke all on public.revision_content from anon;
revoke insert, update, delete on public.revision_content from authenticated;

-- Progression : une ligne par personne, visible et modifiable par elle seule.
-- cards : { "t1-01": [niveau, jour d'échéance, vues, réussites, premier jour] }, jours comptés depuis 1970 (UTC).
create table if not exists public.progress (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  cards jsonb not null default '{}'::jsonb check (jsonb_typeof(cards) = 'object'),
  sessions jsonb not null default '[]'::jsonb check (jsonb_typeof(sessions) = 'array' and jsonb_array_length(sessions) <= 200),
  xp integer not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

drop policy if exists "Lecture de sa progression" on public.progress;
create policy "Lecture de sa progression"
  on public.progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Création de sa progression" on public.progress;
create policy "Création de sa progression"
  on public.progress for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Mise à jour de sa progression" on public.progress;
create policy "Mise à jour de sa progression"
  on public.progress for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.progress from anon;
revoke delete on public.progress from authenticated;
