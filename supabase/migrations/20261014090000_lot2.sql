-- Lot 2 : écriture de progress réservée à la RPC (D6, annexe 07-qa) et coupe des séances sous la borne (L1-12).
-- Compatible avec le front du lot 1 : il lit progress en direct mais n'écrit que par save_progress.
-- Retour arrière : docs/squad/05-build.md, section « Lot 2 > Back ».

-- 1. D6 : plus d'écriture directe sur progress. Double verrou : droits retirés et politiques d'écriture supprimées
--    (sans politique insert/update, la RLS refuse même si un droit réapparaît). La lecture de sa ligne reste.
revoke insert, update, delete on public.progress from authenticated;
-- Durcissement constaté en local : truncate (qui ignore la RLS), references, trigger et maintain étaient accordés à
-- anon et authenticated sur toutes les tables. PostgREST ne les expose pas, on les retire quand même.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
-- L2-3 : même retrait pour les tables futures. Les migrations s'exécutent en postgres, propriétaire de toutes les
-- tables de public ; ce sont donc ses privilèges par défaut qui comptent. Un revoke déjà fait est sans effet (idempotent).
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
-- MAINTAIN (VACUUM, ANALYZE, LOCK TABLE) n'existe qu'à partir de Postgres 17 : sans erreur sur une version antérieure.
do $$
begin
  if current_setting('server_version_num')::integer >= 170000 then
    execute 'revoke maintain on all tables in schema public from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke maintain on tables from anon, authenticated';
  end if;
end $$;
drop policy if exists "Création de sa progression" on public.progress;
drop policy if exists "Mise à jour de sa progression" on public.progress;

-- 2. save_progress en security definer : seule voie d'écriture, ligne ciblée par auth.uid() seul.
--    Mêmes règles de fusion que le lot 1 (contrat §1), plus la coupe L1-12 : si l'union gardée (200 dernières)
--    dépasse la borne progress_sessions_size, on retire les plus anciennes jusqu'à passer sous la borne.
create or replace function public.save_progress(p_cards jsonb, p_sessions jsonb, p_xp integer)
  returns table (cards jsonb, sessions jsonb, xp integer, updated_at timestamptz)
  language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  c_cards_max_bytes constant integer := 262144;    -- = progress_cards_size
  c_sessions_max_bytes constant integer := 65536;  -- = progress_sessions_size
  c_sessions_kept constant integer := 200;
  v_uid uuid := auth.uid();
  v_old public.progress%rowtype;
  v_cards jsonb;
  v_sessions jsonb;
begin
  if v_uid is null then
    raise exception 'Session requise' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cards) is distinct from 'object' or pg_column_size(p_cards) > c_cards_max_bytes then
    raise exception 'p_cards doit être un objet de 256 Kio au plus' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_cards) e where not public.is_card_progress(e.value)) then
    raise exception 'Chaque carte doit être un tableau de 5 entiers positifs' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sessions) is distinct from 'array' or jsonb_array_length(p_sessions) > c_sessions_kept
     or pg_column_size(p_sessions) > c_sessions_max_bytes
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
    limit c_sessions_kept
  ) kept;

  -- L1-12 : le tableau est trié du plus ancien au plus récent, on retire par la tête.
  while pg_column_size(v_sessions) > c_sessions_max_bytes loop
    v_sessions := v_sessions - 0;
  end loop;

  return query
    update public.progress p
       set cards = v_cards, sessions = v_sessions, xp = greatest(v_old.xp, p_xp)
     where p.user_id = v_uid
    returning p.cards, p.sessions, p.xp, p.updated_at;
end $$;
revoke all on function public.save_progress(jsonb, jsonb, integer) from public, anon;
grant execute on function public.save_progress(jsonb, jsonb, integer) to authenticated;
