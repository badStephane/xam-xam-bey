-- Lot 5 (1/3) : XP de ligue vérifiée par le serveur, ligues hebdomadaires, défi, clôture.
-- Spécification : docs/squad/17-archi-lot5.md (ajustée par les arbitrages A5 à A11 de 15-lot5.md), contrat L5-1.
-- Les fonctions internes prennent p_now (testables par voyage dans le temps) et ne sont exécutables par aucun client.
-- Retour arrière : docs/squad/05-build.md, section « Lot 5 > Back ».

-- 1. Tables. Aucune n'est lisible ni modifiable par anon ou authenticated : seuls les RPC security definer y accèdent.
create table public.scout_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pseudo text check (char_length(pseudo) between 3 and 20),
  pseudo_key text unique,
  pseudo_state text not null default 'none' check (pseudo_state in ('none', 'ok', 'reset')),
  pseudo_changed_at timestamptz,
  league_opt_in boolean not null default true,
  tier smallint not null default 1 check (tier between 1 and 6),
  tier_from date,
  check ((pseudo is null) = (pseudo_key is null)),
  check ((pseudo is not null) = (pseudo_state = 'ok'))
);

create table public.pseudo_blocklist (
  word text primary key check (word ~ '^[a-z0-9]{2,30}$'),
  exact boolean not null default false
);

-- Une note par (scout, jour, carte). xp est calculée par le serveur (A11), jamais déclarée.
create table public.grade_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  day integer not null,
  card_id text not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  grade smallint not null check (grade between 0 and 2),
  xp smallint not null check (xp in (0, 5, 10)),
  received_at timestamptz not null,
  primary key (user_id, day, card_id)
);
create index grade_events_week_idx on public.grade_events (user_id, week_start);

create table public.league_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  closed_at timestamptz
);
create index league_weeks_open_idx on public.league_weeks (week_start) where closed_at is null;

create table public.league_groups (
  id bigint generated always as identity primary key,
  week_start date not null references public.league_weeks on delete cascade,
  tier smallint not null check (tier between 1 and 6)
);
create index league_groups_week_tier_idx on public.league_groups (week_start, tier);

create table public.league_members (
  week_start date not null references public.league_weeks on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id bigint not null references public.league_groups on delete cascade,
  tier smallint not null check (tier between 1 and 6),
  public_id uuid not null default gen_random_uuid() unique,
  xp integer not null default 0 check (xp >= 0),
  last_gain_at timestamptz not null,
  joined_at timestamptz not null,
  final_rank integer,
  outcome smallint check (outcome between -1 and 1),
  primary key (week_start, user_id)
);
create index league_members_group_idx on public.league_members (group_id);
create index league_members_user_idx on public.league_members (user_id);

create table public.user_badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge text not null check (badge in ('challenge', 'promoted', 'podium', 'polar_star')),
  week_start date not null,
  earned_at timestamptz not null,
  primary key (user_id, badge, week_start)
);

create table public.pseudo_reports (
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  pseudo_key text not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  primary key (reporter_id, target_id, pseudo_key)
);
create index pseudo_reports_target_idx on public.pseudo_reports (target_id);
create index pseudo_reports_reporter_idx on public.pseudo_reports (reporter_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['scout_profiles', 'pseudo_blocklist', 'grade_events', 'league_weeks', 'league_groups',
                           'league_members', 'user_badges', 'pseudo_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- 2. Calendrier (UTC = heure de Dakar). Semaine de ligue : lundi 00:00 au dimanche 20:00 (A7) ; une note faite
--    entre dimanche 20:00 et lundi 00:00 compte pour la semaine suivante, d'où le décalage de 4 h.
create function public.league_week_of(p_at timestamptz) returns date
  language sql stable set search_path = ''
as $$ select date_trunc('week', (p_at at time zone 'UTC') + interval '4 hours')::date $$;
-- Fin de la semaine (dimanche 20:00) et date limite de réception des notes (lundi 06:00, grâce de synchronisation).
create function public.week_ends_at(p_week date) returns timestamptz
  language sql stable set search_path = ''
as $$ select ((p_week + 6)::timestamp + interval '20 hours') at time zone 'UTC' $$;
create function public.week_deadline(p_week date) returns timestamptz
  language sql stable set search_path = ''
as $$ select ((p_week + 7)::timestamp + interval '6 hours') at time zone 'UTC' $$;
create function public.day_num(p_at timestamptz) returns integer
  language sql stable set search_path = ''
as $$ select (p_at at time zone 'UTC')::date - date '1970-01-01' $$;
-- Zone du mois d'un jour (même règle que currentZone côté front : octobre 2026 = 1, borné à 1..12).
create function public.zone_of_day(p_day integer) returns integer
  language sql immutable set search_path = ''
as $$
  select least(12, greatest(1, ((extract(year from d) - 2026) * 12 + extract(month from d) - 10 + 1)::integer))
  from (select date '1970-01-01' + p_day as d) x
$$;
-- Texte d'une proposition comparable : NFC, espaces réduits à un seul, sans espace autour (A11).
create function public.qcm_text(p text) returns text
  language sql immutable set search_path = ''
as $$ select btrim(regexp_replace(normalize(p, NFC), '\s+', ' ', 'g')) $$;

-- 3. Défi de la semaine (A9, design C4) : rotation fixe, identique pour tous, semaine du 2026-10-12 = rang 0.
create function public.league_challenge(p_week date, out kind text, out target integer)
  language sql immutable set search_path = ''
as $$
  select (array['active_days', 'zone_cards', 'su', 'cards'])[r + 1], (array[4, 30, 40, 60])[r + 1]
  from (select (((p_week - date '2026-10-12') / 7) % 4 + 4) % 4 as r) x
$$;
create function public.league_challenge_progress(p_uid uuid, p_week date) returns integer
  language sql stable security definer set search_path = ''
as $$
  select case (public.league_challenge(p_week)).kind
    when 'active_days' then (select count(distinct e.day) from public.grade_events e where e.user_id = p_uid and e.week_start = p_week)
    when 'zone_cards' then (select count(*) from public.grade_events e join public.cards k on k.id = e.card_id
                            where e.user_id = p_uid and e.week_start = p_week and k.zone = public.zone_of_day(e.day))
    when 'su' then (select count(*) from public.grade_events e where e.user_id = p_uid and e.week_start = p_week and e.grade = 2)
    else (select count(*) from public.grade_events e where e.user_id = p_uid and e.week_start = p_week)
  end::integer
$$;

-- 4. Entrée dans un groupe (paresseuse, ADR-4). Null si le scout n'est pas classable, ou si la semaine précédente
--    n'est pas encore close (sa ligue de la semaine n'est pas connue).
create function public.league_join(p_uid uuid, p_week date, p_now timestamptz) returns bigint
  language plpgsql security definer set search_path = ''
as $$
declare
  c_group_size constant integer := 20;
  v_prof public.scout_profiles;
  v_group bigint;
begin
  select * into v_prof from public.scout_profiles where user_id = p_uid;
  if not found or v_prof.pseudo_state <> 'ok' or not v_prof.league_opt_in then return null; end if;
  select group_id into v_group from public.league_members where week_start = p_week and user_id = p_uid;
  if found then return v_group; end if;
  if p_now < public.week_deadline(p_week - 7)
     or exists (select 1 from public.league_weeks w where w.week_start = p_week - 7 and w.closed_at is null) then
    return null;
  end if;
  insert into public.league_weeks (week_start) values (p_week) on conflict do nothing;
  -- Sérialise les arrivées dans une même ligue : jamais plus de 20 membres par groupe.
  perform pg_advisory_xact_lock(hashtextextended('xxb-league:' || p_week || ':' || v_prof.tier, 0));
  select g.id into v_group from public.league_groups g
   where g.week_start = p_week and g.tier = v_prof.tier
     and (select count(*) from public.league_members m where m.group_id = g.id) < c_group_size
   order by (select count(*) from public.league_members m where m.group_id = g.id) desc, g.id
   limit 1;
  if v_group is null then
    insert into public.league_groups (week_start, tier) values (p_week, v_prof.tier) returning id into v_group;
  end if;
  insert into public.league_members (week_start, user_id, group_id, tier, xp, last_gain_at, joined_at)
  select p_week, p_uid, v_group, v_prof.tier, coalesce(sum(e.xp), 0),
         coalesce(max(e.received_at) filter (where e.xp > 0), p_now), p_now
    from public.grade_events e where e.user_id = p_uid and e.week_start = p_week;
  return v_group;
end $$;

-- 5. Ingestion des notes : seule source de l'XP de ligue (A11). p_xp de save_progress n'est jamais lu ici.
--    Élément : { c: id de carte, d: dayNum, a?: texte de la proposition choisie, g?: note 0..2, t?: secondes epoch }.
--    Carte avec QCM : 10 si qcm_text(a) = qcm_text(qcm.ok), sinon 0 (a absent compris). Carte sans QCM : 5, note g.
--    Un élément invalide, en double, hors borne, d'une semaine close ou au-delà de 30 cartes par jour est ignoré.
create function public.league_ingest(p_uid uuid, p_grades jsonb, p_now timestamptz) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  c_daily_cards constant integer := 30;     -- A6
  c_max_grades constant integer := 500;
  c_max_bytes constant integer := 262144;
  c_clock_skew constant integer := 300;     -- secondes d'avance tolérées sur t
  v_today integer := public.day_num(p_now);
  v_first integer;
  v_added integer;
  v_weeks date[];
  v_week date;
begin
  if jsonb_typeof(p_grades) is distinct from 'array' or jsonb_array_length(p_grades) > c_max_grades
     or pg_column_size(p_grades) > c_max_bytes then
    raise exception 'GRADES_INVALID' using errcode = '22023';
  end if;
  -- Inscription inconnue : seules les notes du jour (et du lendemain) passent.
  select coalesce(public.day_num(u.created_at), v_today) into v_first from auth.users u where u.id = p_uid;
  v_first := coalesce(v_first, v_today);

  with parsed as (
    select x.ord, x.e ->> 'c' as c, public.json_num(x.e -> 'd') as d, public.json_num(x.e -> 'g') as g,
           public.json_num(x.e -> 't') as t, case when jsonb_typeof(x.e -> 'a') = 'string' then x.e ->> 'a' end as a
      from jsonb_array_elements(p_grades) with ordinality as x(e, ord)
     where jsonb_typeof(x.e) = 'object' and jsonb_typeof(x.e -> 'c') = 'string'),
  bounded as (
    -- Jour borné : pas avant l'inscription ni plus de 8 jours en arrière, jamais après aujourd'hui (UTC = Dakar, L5-1).
    select distinct on (p.d, p.c) p.ord, p.c, p.d::integer as d, p.a,
           case when p.g in (0, 1, 2) then p.g::smallint end as g,
           -- Heure de la note : t si plausible (même jour à ±1, pas dans le futur), sinon le début du jour d (L5-1) :
           -- sans t, une note de dimanche reste dans sa semaine si elle arrive avant la fin de la grâce.
           case when p.t = trunc(p.t) and p.t <= extract(epoch from p_now) + c_clock_skew
                     and floor(p.t / 86400) between p.d - 1 and p.d + 1
                then to_timestamp(p.t::double precision)
                else (date '1970-01-01' + p.d::integer)::timestamp at time zone 'UTC'
           end as noted_at
      from parsed p
     where p.d = trunc(p.d) and p.d between greatest(v_today - 8, v_first) and v_today
       and (p.a is null or char_length(p.a) <= 500)
     order by p.d, p.c, p.ord),
  scored as (
    select b.ord, b.c, b.d, public.league_week_of(b.noted_at) as w,
           case when k.qcm is null then 5
                when b.a is not null and public.qcm_text(b.a) = public.qcm_text(k.qcm ->> 'ok') then 10 else 0 end as xp,
           case when k.qcm is null then coalesce(b.g, 0)
                when b.a is not null and public.qcm_text(b.a) = public.qcm_text(k.qcm ->> 'ok') then 2 else 0 end as grade
      from bounded b join public.cards k on k.id = b.c and k.status = 'published'
     where (k.qcm is not null or b.g is not null)
       and not exists (select 1 from public.grade_events e where e.user_id = p_uid and e.day = b.d and e.card_id = b.c)),
  open_week as (
    select s.* from scored s where p_now < public.week_deadline(s.w)),
  ranked as (
    select o.*, row_number() over (partition by o.d order by o.ord) as rn,
           (select count(*) from public.grade_events e where e.user_id = p_uid and e.day = o.d) as used
      from open_week o),
  ins as (
    insert into public.grade_events (user_id, day, card_id, week_start, grade, xp, received_at)
    select p_uid, r.d, r.c, r.w, r.grade, r.xp, p_now from ranked r where r.rn <= c_daily_cards - r.used
    on conflict do nothing
    returning week_start)
  select count(*), array_agg(distinct week_start) into v_added, v_weeks from ins;

  if v_added = 0 then return 0; end if;
  foreach v_week in array v_weeks loop
    perform public.league_refresh(p_uid, v_week, p_now);
  end loop;
  return v_added;
end $$;

-- XP du membre recalculée depuis les notes (cache), entrée en groupe si besoin, badge du défi.
-- last_gain_at ne bouge que si l'XP change : une note à 0 XP ne fait pas perdre un ex aequo (L5-2).
create function public.league_refresh(p_uid uuid, p_week date, p_now timestamptz) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ch record;
  v_xp integer := (select coalesce(sum(e.xp), 0) from public.grade_events e where e.user_id = p_uid and e.week_start = p_week);
begin
  update public.league_members m
     set xp = v_xp, last_gain_at = case when m.xp <> v_xp then p_now else m.last_gain_at end
   where m.week_start = p_week and m.user_id = p_uid;
  if not found then perform public.league_join(p_uid, p_week, p_now); end if;
  select * into v_ch from public.league_challenge(p_week);
  if public.league_challenge_progress(p_uid, p_week) >= v_ch.target then
    insert into public.user_badges (user_id, badge, week_start, earned_at)
    values (p_uid, 'challenge', p_week, p_now) on conflict do nothing;
  end if;
end $$;

-- 6. Clôture d'une semaine (ADR-3) : refusée avant la date limite, verrou + closed_at (rejouer = sans effet),
--    tier affecté (jamais incrémenté). Règles A8 : montent les min(5, n/3) premiers ayant >= 50 XP ; descendent les
--    min(3, n/5) derniers sauf >= 100 XP. Ex aequo : le premier arrivé au total. Seuls les membres classables comptent.
create function public.league_close_week(p_week date, p_now timestamptz) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_closed timestamptz;
  v_uid uuid;
begin
  if p_now < public.week_deadline(p_week) then return false; end if;
  select closed_at into v_closed from public.league_weeks where week_start = p_week for update;
  if not found or v_closed is not null then return false; end if;

  update public.league_members m
     set xp = (select coalesce(sum(e.xp), 0) from public.grade_events e where e.user_id = m.user_id and e.week_start = p_week)
   where m.week_start = p_week;

  with ranked as (
    select m.user_id, m.tier, m.xp,
           row_number() over (partition by m.group_id order by m.xp desc, m.last_gain_at, m.joined_at, m.user_id) as r,
           count(*) over (partition by m.group_id) as n
      from public.league_members m join public.scout_profiles p on p.user_id = m.user_id
     where m.week_start = p_week and p.pseudo_state = 'ok' and p.league_opt_in),
  decided as (
    select d.*, case when d.tier < 6 then least(5, d.n / 3) else 0 end as k_up,
                case when d.tier > 1 then least(3, d.n / 5) else 0 end as k_down
      from ranked d)
  update public.league_members m
     set final_rank = d.r,
         outcome = case when d.r <= d.k_up and d.xp >= 50 then 1
                        when d.r > d.n - d.k_down and d.xp < 100 then -1 else 0 end
    from decided d
   where m.week_start = p_week and m.user_id = d.user_id;

  update public.scout_profiles p set tier = m.tier + m.outcome, tier_from = p_week + 7
    from public.league_members m
   where m.week_start = p_week and m.user_id = p.user_id and m.outcome is not null;

  -- Badges serveur (design C6). Podium : 1er à 3e d'un groupe d'au moins 5 classés.
  insert into public.user_badges (user_id, badge, week_start, earned_at)
  select m.user_id, 'podium', p_week, p_now from public.league_members m
   where m.week_start = p_week and m.final_rank <= 3
     and (select count(*) from public.league_members o where o.group_id = m.group_id and o.final_rank is not null) >= 5
  on conflict do nothing;
  insert into public.user_badges (user_id, badge, week_start, earned_at)
  select m.user_id, 'promoted', p_week, p_now from public.league_members m
   where m.week_start = p_week and m.outcome = 1
     and not exists (select 1 from public.user_badges b where b.user_id = m.user_id and b.badge = 'promoted')
  on conflict do nothing;
  insert into public.user_badges (user_id, badge, week_start, earned_at)
  select m.user_id, 'polar_star', p_week, p_now from public.league_members m
   where m.week_start = p_week and m.tier + m.outcome = 6
     and not exists (select 1 from public.user_badges b where b.user_id = m.user_id and b.badge = 'polar_star')
  on conflict do nothing;

  update public.league_weeks set closed_at = p_now where week_start = p_week;
  -- Rétention : 8 semaines de notes et de signalements.
  delete from public.grade_events where week_start < p_week - 49;
  delete from public.pseudo_reports where created_at < p_now - interval '56 days';

  -- Scouts déjà actifs dans la semaine suivante : entrée en groupe avec leur nouvelle ligue.
  for v_uid in select distinct e.user_id from public.grade_events e
                where e.week_start = p_week + 7
                  and not exists (select 1 from public.league_members m where m.week_start = p_week + 7 and m.user_id = e.user_id) loop
    perform public.league_join(v_uid, p_week + 7, p_now);
  end loop;
  return true;
end $$;

-- Ferme toutes les semaines échues non closes, dans l'ordre. Appelée par pg_cron et par get_league_state.
create function public.league_close_due(p_now timestamptz default now()) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare v_week date; v_n integer := 0;
begin
  for v_week in select week_start from public.league_weeks
                 where closed_at is null and public.week_deadline(week_start) <= p_now order by week_start loop
    if public.league_close_week(v_week, p_now) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- 7. save_progress à 4 paramètres (L5-1). L'ancienne version doit disparaître : avec deux surcharges, PostgREST ne
--    saurait pas choisir pour un appel à 3 clés (front du lot 4, toujours en production). p_grades a un défaut.
drop function public.save_progress(jsonb, jsonb, integer);
create function public.save_progress(p_cards jsonb, p_sessions jsonb, p_xp integer, p_grades jsonb default '[]'::jsonb)
  returns table (cards jsonb, sessions jsonb, xp integer, updated_at timestamptz,
                 week_xp integer, grades_counted integer, today_xp integer)
  language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  c_cards_max_bytes constant integer := 262144;    -- = progress_cards_size
  c_sessions_max_bytes constant integer := 65536;  -- = progress_sessions_size
  c_sessions_kept constant integer := 200;
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_old public.progress%rowtype;
  v_cards jsonb;
  v_sessions jsonb;
  v_counted integer;
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

  -- Ligne créée si absente, puis verrouillée : deux appareils qui enregistrent en même temps sont sérialisés
  -- (fusion comme plafond quotidien des notes).
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

  while pg_column_size(v_sessions) > c_sessions_max_bytes loop
    v_sessions := v_sessions - 0;
  end loop;

  v_counted := public.league_ingest(v_uid, coalesce(p_grades, '[]'::jsonb), v_now);

  return query
    update public.progress p
       set cards = v_cards, sessions = v_sessions, xp = greatest(v_old.xp, p_xp)
     where p.user_id = v_uid
    returning p.cards, p.sessions, p.xp, p.updated_at,
      (select coalesce(sum(e.xp), 0)::integer from public.grade_events e
        where e.user_id = v_uid and e.week_start = public.league_week_of(v_now)),
      v_counted,
      (select coalesce(sum(e.xp), 0)::integer from public.grade_events e
        where e.user_id = v_uid and e.day = public.day_num(v_now));
end $$;

-- 8. Droits. pg_default_acl de postgres accorde EXECUTE à anon et authenticated sur toute nouvelle fonction :
--    chaque fonction interne est donc révoquée explicitement ; save_progress n'est accordée qu'à authenticated.
revoke all on function public.league_week_of(timestamptz), public.week_ends_at(date), public.week_deadline(date),
  public.day_num(timestamptz), public.zone_of_day(integer), public.qcm_text(text), public.league_challenge(date),
  public.league_challenge_progress(uuid, date), public.league_join(uuid, date, timestamptz),
  public.league_ingest(uuid, jsonb, timestamptz), public.league_refresh(uuid, date, timestamptz),
  public.league_close_week(date, timestamptz), public.league_close_due(timestamptz)
  from public, anon, authenticated;
revoke all on function public.save_progress(jsonb, jsonb, integer, jsonb) from public, anon;
grant execute on function public.save_progress(jsonb, jsonb, integer, jsonb) to authenticated;
