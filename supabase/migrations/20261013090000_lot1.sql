-- Lot 1 : fusion serveur de la progression (contrat §1, BE-2, BE-6, BE-A2) et lecture admin du bucket (contrat §3, BE-1).
-- Idempotente : peut être rejouée sans effet de bord.

-- 0. Droits explicites. Les projets Supabase récents n'accordent plus de droits par défaut à anon/authenticated
--    sur les tables créées par postgres : les migrations précédentes reposaient sur ces droits implicites.
--    Sans effet là où ils existent déjà ; la RLS reste le contrôle d'accès effectif.
grant select, insert, update on public.progress to authenticated;
grant select on public.revision_content, public.admins to authenticated;
grant select, insert, update, delete on public.cards to authenticated;
grant insert, update, delete on public.documents to authenticated;

-- 1. Bornes de la table progress (le quota gratuit de 500 Mo ne doit pas être rempli par un seul compte).
alter table public.progress drop constraint if exists progress_cards_size;
alter table public.progress add constraint progress_cards_size check (pg_column_size(cards) <= 262144);
alter table public.progress drop constraint if exists progress_xp_max;
alter table public.progress add constraint progress_xp_max check (xp <= 10000000);
alter table public.progress drop constraint if exists progress_sessions_size;
alter table public.progress add constraint progress_sessions_size check (pg_column_size(sessions) <= 65536);

-- 2. Horodatage posé par le serveur, jamais par l'horloge du client.
drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before insert or update on public.progress
  for each row execute function public.touch_updated_at();

-- 3. Validation d'une entrée de carte : tableau de 5 entiers >= 0 (bornés à integer).
create or replace function public.is_card_progress(p_entry jsonb) returns boolean
  language plpgsql immutable set search_path = ''
as $$
declare v jsonb;
begin
  if jsonb_typeof(p_entry) is distinct from 'array' or jsonb_array_length(p_entry) <> 5 then return false; end if;
  for v in select value from jsonb_array_elements(p_entry) loop
    if jsonb_typeof(v) <> 'number' then return false; end if;
    if (v #>> '{}')::numeric not between 0 and 2147483647 or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.is_card_progress(jsonb) from public, anon;
grant execute on function public.is_card_progress(jsonb) to authenticated;

-- Valeur numérique d'un champ JSON, null sinon : les lignes héritées non numériques ne font jamais échouer un tri (L1-3).
create or replace function public.json_num(p_value jsonb) returns numeric
  language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(p_value) = 'number' then (p_value #>> '{}')::numeric end $$;
revoke all on function public.json_num(jsonb) from public, anon;
grant execute on function public.json_num(jsonb) to authenticated;

-- 4. Enregistrement de la progression : fusion avec la ligne existante, jamais un remplacement.
--    cartes : la plus vue gagne, puis la plus grande échéance, puis le plus grand tableau (ordre total, donc commutatif) ;
--    séances : union sans doublon, ordre canonique commun avec progressMerge.ts (L1-1) :
--      d, n, ok (numériques, null en tête), k, l (collation "C"), puis le JSON texte ; on garde les 200 dernières ; xp : greatest. Rejouer le même appel ne change rien.
create or replace function public.save_progress(p_cards jsonb, p_sessions jsonb, p_xp integer)
  returns table (cards jsonb, sessions jsonb, xp integer, updated_at timestamptz)
  language plpgsql security invoker set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_old public.progress%rowtype;
  v_cards jsonb;
  v_sessions jsonb;
begin
  if v_uid is null then
    raise exception 'Session requise' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cards) is distinct from 'object' or pg_column_size(p_cards) > 262144 then
    raise exception 'p_cards doit être un objet de 256 Kio au plus' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_cards) e where not public.is_card_progress(e.value)) then
    raise exception 'Chaque carte doit être un tableau de 5 entiers positifs' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sessions) is distinct from 'array' or jsonb_array_length(p_sessions) > 200 or pg_column_size(p_sessions) > 65536
     or exists (select 1 from jsonb_array_elements(p_sessions) s where jsonb_typeof(s) <> 'object') then
    raise exception 'p_sessions doit être un tableau de 200 objets et 64 Kio au plus' using errcode = '22023';
  end if;
  if p_xp is null or p_xp not between 0 and 10000000 then
    raise exception 'p_xp doit être compris entre 0 et 10 000 000' using errcode = '22023';
  end if;

  -- Ligne créée si absente, puis verrouillée : deux appareils qui enregistrent en même temps sont sérialisés.
  insert into public.progress (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_old from public.progress p where p.user_id = v_uid for update;

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_cards
  from (
    select distinct on (k) k, v
    from (select e.key as k, e.value as v from jsonb_each(v_old.cards) e
          union all
          select e.key, e.value from jsonb_each(p_cards) e) u
    order by k, public.json_num(v -> 2) desc nulls last, public.json_num(v -> 1) desc nulls last, v desc
  ) best;

  select coalesce(jsonb_agg(s order by public.json_num(s -> 'd') nulls first, public.json_num(s -> 'n') nulls first,
           public.json_num(s -> 'ok') nulls first, (s ->> 'k') collate "C" nulls first, (s ->> 'l') collate "C" nulls first,
           s::text collate "C"), '[]'::jsonb) into v_sessions
  from (
    select s from (select distinct s from jsonb_array_elements(v_old.sessions || p_sessions) s) d
    order by public.json_num(s -> 'd') desc nulls last, public.json_num(s -> 'n') desc nulls last,
             public.json_num(s -> 'ok') desc nulls last, (s ->> 'k') collate "C" desc nulls last,
             (s ->> 'l') collate "C" desc nulls last, s::text collate "C" desc
    limit 200
  ) kept;

  return query
    update public.progress p
       set cards = v_cards, sessions = v_sessions, xp = greatest(v_old.xp, p_xp)
     where p.user_id = v_uid
    returning p.cards, p.sessions, p.xp, p.updated_at;
end $$;
revoke all on function public.save_progress(jsonb, jsonb, integer) from public, anon;
grant execute on function public.save_progress(jsonb, jsonb, integer) to authenticated;

-- 5. Storage : remove() exige le droit select en plus de delete. Lecture réservée aux admins (pas de listage public).
drop policy if exists "Lecture des fichiers par les admins" on storage.objects;
create policy "Lecture des fichiers par les admins" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select public.is_admin()));
