-- Suivi d'un scout par l'admin (2026-10-22). Choix de l'utilisateur : recherche par e-mail ou pseudo, fiche de progression
-- nominative, scouts prévenus (écran de connexion, compte, progression) et chaque consultation notée dans un journal.
-- Tout passe par des RPC security definer réservées aux admins (assert_admin, sinon 42501 FORBIDDEN).

-- 1. Journal des consultations : quel admin a ouvert la fiche de quel compte, et quand. Gardé un an.
create table public.admin_views (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  target_id uuid not null references auth.users (id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index admin_views_viewed_idx on public.admin_views (viewed_at desc);
create index admin_views_target_idx on public.admin_views (target_id);
alter table public.admin_views enable row level security;
revoke all on public.admin_views from public, anon, authenticated;

-- 2. Recherche : une partie de l'e-mail, ou du pseudo (normalisé comme pseudo_key). Les plus actifs récemment d'abord.
create function public.admin_find_scouts(p_search text)
  returns table (user_id uuid, email text, pseudo text, last_active timestamptz)
  language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  c_min_chars constant integer := 3;
  c_max_rows constant integer := 20;
  v_text text := lower(trim(coalesce(p_search, '')));
  v_key text := public.pseudo_key(coalesce(p_search, ''));
begin
  perform public.assert_admin();
  if char_length(v_text) < c_min_chars then
    raise exception 'SEARCH_TOO_SHORT' using errcode = '22023';
  end if;
  return query
    select u.id, u.email::text, s.pseudo, p.updated_at
      from auth.users u
      left join public.scout_profiles s on s.user_id = u.id
      left join public.progress p on p.user_id = u.id
     where strpos(lower(u.email), v_text) > 0
        or (char_length(v_key) >= c_min_chars and strpos(s.pseudo_key, v_key) > 0)
     order by p.updated_at desc nulls last, u.email
     limit c_max_rows;
end $$;

-- 3. Fiche d'un compte : identité, 7 semaines de réponses (grade_events), avancement par zone (progress.cards),
--    10 dernières séances (progress.sessions : { d, n, ok, k, l }). La consultation est notée avant la lecture.
create function public.admin_scout_progress(p_user uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $$
declare
  c_weeks constant integer := 7;         -- comme admin_stats ; grade_events en garde 8
  c_acquired_lv constant integer := 4;   -- = ACQUIRED_LV (src/lib/constants.ts)
  c_recent_sessions constant integer := 10;
  c_log_days constant integer := 365;
  v_week date := public.league_week_of(now());
  v_email text;
  v_created timestamptz;
  v_progress public.progress%rowtype;
begin
  perform public.assert_admin();
  select u.email::text, u.created_at into v_email, v_created from auth.users u where u.id = p_user;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.admin_views (admin_id, target_id) values (auth.uid(), p_user);
  delete from public.admin_views where viewed_at < now() - make_interval(days => c_log_days);

  select * into v_progress from public.progress p where p.user_id = p_user;
  return jsonb_build_object(
    'email', v_email,
    'pseudo', (select s.pseudo from public.scout_profiles s where s.user_id = p_user),
    'createdAt', v_created,
    'lastActive', v_progress.updated_at,
    'xp', coalesce(v_progress.xp, 0),
    'weeks', (
      select jsonb_agg(jsonb_build_object('week', w.week, 'answers', coalesce(e.answers, 0),
                                          'correct', coalesce(e.correct, 0), 'days', coalesce(e.days, 0)) order by w.week)
        from (select v_week - 7 * g as week from generate_series(0, c_weeks - 1) g) w
        left join (select g.week_start, count(*) as answers, count(*) filter (where g.grade = 2) as correct,
                          count(distinct g.day) as days
                     from public.grade_events g
                    where g.user_id = p_user and g.week_start > v_week - 7 * c_weeks
                    group by g.week_start) e on e.week_start = w.week),
    'zones', (
      select coalesce(jsonb_agg(jsonb_build_object('zone', z.zone, 'total', z.total, 'seen', z.seen, 'acquired', z.acquired)
                                order by z.zone), '[]'::jsonb)
        from (select k.zone, count(*) filter (where k.status = 'published') as total, count(e.key) as seen,
                     count(*) filter (where public.json_num(e.value -> 0) >= c_acquired_lv) as acquired
                from public.cards k
                left join jsonb_each(coalesce(v_progress.cards, '{}'::jsonb)) e on e.key = k.id
               where k.status = 'published' or e.key is not null
               group by k.zone) z),
    'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object('d', x.s -> 'd', 'n', x.s -> 'n', 'ok', x.s -> 'ok', 'l', x.s -> 'l')
                                order by x.n), '[]'::jsonb)
        from (select s, row_number() over (order by public.json_num(s -> 'd') desc nulls last, o desc) as n
                from jsonb_array_elements(coalesce(v_progress.sessions, '[]'::jsonb)) with ordinality as a(s, o)) x
       where x.n <= c_recent_sessions)
  );
end $$;

-- 4. Journal visible des admins : les 50 dernières consultations.
create function public.admin_list_views()
  returns table (viewed_at timestamptz, admin_email text, target_email text)
  language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  c_max_rows constant integer := 50;
begin
  perform public.assert_admin();
  return query
    select v.viewed_at, a.email::text, t.email::text
      from public.admin_views v
      left join auth.users a on a.id = v.admin_id
      join auth.users t on t.id = v.target_id
     order by v.viewed_at desc, v.id desc
     limit c_max_rows;
end $$;

revoke all on function public.admin_find_scouts(text), public.admin_scout_progress(uuid), public.admin_list_views()
  from public, anon;
grant execute on function public.admin_find_scouts(text), public.admin_scout_progress(uuid), public.admin_list_views()
  to authenticated;
