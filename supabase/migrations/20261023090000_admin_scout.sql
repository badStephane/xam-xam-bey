-- Suivi d'un scout par l'admin (2026-10-22). Choix de l'utilisateur : recherche par e-mail ou pseudo, fiche de progression
-- nominative, scouts prévenus (écran de connexion, compte, progression) et chaque consultation notée dans un journal (ADR-5).
-- Tout passe par des RPC security definer réservées aux admins (assert_admin, sinon 42501 FORBIDDEN).

-- 1. Journal : chaque recherche (elle affiche des e-mails) et chaque fiche ouverte. Les e-mails sont recopiés pour que la
--    trace survive à la suppression d'un compte, jusqu'à la purge d'un an.
create table public.admin_views (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  admin_email text not null,
  target_id uuid references auth.users (id) on delete set null,
  target_email text,
  search text,
  viewed_at timestamptz not null default now(),
  check ((target_email is null) <> (search is null))
);
create index admin_views_viewed_idx on public.admin_views (viewed_at desc);
alter table public.admin_views enable row level security;
revoke all on public.admin_views from public, anon, authenticated;
revoke all on sequence public.admin_views_id_seq from public, anon, authenticated;

-- Écriture du journal (interne) : l'admin courant, une fiche ou une recherche ; purge des lignes de plus d'un an.
create function public.admin_log_view(p_target uuid, p_target_email text, p_search text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  c_log_days constant integer := 365;
begin
  insert into public.admin_views (admin_id, admin_email, target_id, target_email, search)
    select u.id, u.email::text, p_target, p_target_email, p_search from auth.users u where u.id = auth.uid();
  delete from public.admin_views where viewed_at < now() - make_interval(days => c_log_days);
end $$;

-- 2. Recherche : une partie de l'e-mail, ou du pseudo (normalisé comme pseudo_key). Les plus actifs récemment d'abord.
create function public.admin_find_scouts(p_search text)
  returns table (user_id uuid, email text, pseudo text, last_active timestamptz)
  language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  c_min_chars constant integer := 3;
  c_max_chars constant integer := 100;
  c_max_rows constant integer := 20;
  v_text text := lower(trim(left(coalesce(p_search, ''), c_max_chars)));
  v_key text := public.pseudo_key(v_text);
begin
  perform public.assert_admin();
  if char_length(v_text) < c_min_chars then
    raise exception 'SEARCH_TOO_SHORT' using errcode = '22023';
  end if;
  perform public.admin_log_view(null, null, v_text);
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

-- 3. Fiche d'un compte : identité, 7 semaines de réponses (grade_events), avancement par zone (cartes publiées),
--    10 dernières séances (progress.sessions : { d, n, ok, k, l }). La consultation est notée avant la lecture.
create function public.admin_scout_progress(p_user uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $$
declare
  c_weeks constant integer := 7;         -- comme admin_stats ; grade_events en garde 8
  c_acquired_lv constant integer := 4;   -- = ACQUIRED_LV (src/lib/constants.ts)
  c_recent_sessions constant integer := 10;
  c_label_chars constant integer := 60;  -- l est écrit par l'appareil du scout
  v_week date := public.league_week_of(now());
  v_email text;
  v_created timestamptz;
  v_progress public.progress%rowtype;
begin
  perform public.assert_admin();
  select u.email::text, u.created_at into v_email, v_created from auth.users u where u.id = p_user;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  perform public.admin_log_view(p_user, v_email, null);

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
        from (select k.zone, count(*) as total, count(e.key) as seen,
                     count(*) filter (where public.json_num(e.value -> 0) >= c_acquired_lv) as acquired
                from public.cards k
                left join jsonb_each(coalesce(v_progress.cards, '{}'::jsonb)) e on e.key = k.id
               where k.status = 'published'
               group by k.zone) z),
    'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object('d', x.s -> 'd', 'n', x.s -> 'n', 'ok', x.s -> 'ok',
                                                   'l', left(x.s ->> 'l', c_label_chars)) order by x.n), '[]'::jsonb)
        from (select s, row_number() over (order by public.json_num(s -> 'd') desc nulls last, o desc) as n
                from jsonb_array_elements(coalesce(v_progress.sessions, '[]'::jsonb)) with ordinality as a(s, o)) x
       where x.n <= c_recent_sessions)
  );
end $$;

-- 4. Journal visible des admins : les 50 dernières entrées de moins d'un an.
create function public.admin_list_views()
  returns table (viewed_at timestamptz, admin_email text, target_email text, search text)
  language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  c_log_days constant integer := 365;
  c_max_rows constant integer := 50;
begin
  perform public.assert_admin();
  return query
    select v.viewed_at, v.admin_email, v.target_email, v.search
      from public.admin_views v
     where v.viewed_at >= now() - make_interval(days => c_log_days)
     order by v.viewed_at desc, v.id desc
     limit c_max_rows;
end $$;

revoke all on function public.admin_log_view(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_find_scouts(text), public.admin_scout_progress(uuid), public.admin_list_views()
  from public, anon;
grant execute on function public.admin_find_scouts(text), public.admin_scout_progress(uuid), public.admin_list_views()
  to authenticated;
