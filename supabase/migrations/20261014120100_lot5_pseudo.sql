-- Lot 5 (2/3) : pseudo modéré, participation, lecture du classement, signalement, administration (contrat L5-2 à L5-5).
-- Tous les RPC : security definer, search_path vide, exécutables par authenticated seulement, aucun user_id en paramètre
-- côté scout. Les erreurs portent un code métier stable dans message (le front le traduit).

-- 1. Clé d'unicité et de filtrage : minuscules, sans accent, sans séparateur (Élodie_K = elodiek = ELODIE-K).
create function public.pseudo_key(p text) returns text
  language sql immutable set search_path = ''
as $$
  select regexp_replace(
    translate(replace(replace(replace(lower(normalize(p, NFC)), 'œ', 'oe'), 'æ', 'ae'), 'ß', 'ss'),
              'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿŋ', 'aaaaaaceeeeiiiinoooooouuuuyyn'),
    '[^a-z0-9]', '', 'g')
$$;

-- Mot refusé : la clé, sa forme « leet » (0→o 1→i 3→e 4→a 5→s 7→t) et sa forme sans chiffres sont comparées
-- à la liste (égalité pour les mots exacts, inclusion pour les autres).
create function public.pseudo_blocked(p_key text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  with f(k) as (values (p_key), (translate(p_key, '013457', 'oieast')), (regexp_replace(p_key, '[0-9]', '', 'g')))
  select exists (select 1 from public.pseudo_blocklist b, f
                  where (b.exact and f.k = b.word) or (not b.exact and strpos(f.k, b.word) > 0))
$$;

-- Format (design C5) : 3 à 20 caractères, commence par une lettre, lettres latines (accents et lettres wolof
-- ë ñ ŋ compris), chiffres, - et _ ; 4 chiffres au plus ; clé d'au moins 3 caractères. Renvoie la raison ou null.
create function public.pseudo_format_error(p text) returns text
  language sql immutable set search_path = ''
as $$
  select case
    when char_length(p) < 3 then 'too_short'
    when char_length(p) > 20 then 'too_long'
    when p !~ '^[A-Za-zÀ-ÖØ-öø-ÿŒœŊŋ0-9_-]+$' then 'chars'
    when p !~ '^[A-Za-zÀ-ÖØ-öø-ÿŒœŊŋ]' then 'first_char'
    when char_length(regexp_replace(p, '[^0-9]', '', 'g')) > 4 then 'digits'
    when char_length(public.pseudo_key(p)) < 3 then 'too_short'
  end
$$;

-- Suggestion libre si le pseudo est pris : même base, deux chiffres au hasard.
create function public.pseudo_suggest(p text) returns text
  language plpgsql volatile security definer set search_path = ''
as $$
declare v_base text := left(regexp_replace(p, '[0-9]+$', ''), 18); v_try text;
begin
  for i in 1..20 loop
    v_try := v_base || (10 + floor(random() * 90))::integer;
    if public.pseudo_format_error(v_try) is null and not public.pseudo_blocked(public.pseudo_key(v_try))
       and not exists (select 1 from public.scout_profiles s where s.pseudo_key = public.pseudo_key(v_try)) then
      return v_try;
    end if;
  end loop;
  return null;
end $$;

-- Retire le scout des semaines non closes (opt-out, pseudo retiré par lui-même).
create function public.league_leave(p_uid uuid) returns void
  language sql security definer set search_path = ''
as $$
  delete from public.league_members m using public.league_weeks w
   where m.user_id = p_uid and m.week_start = w.week_start and w.closed_at is null
$$;

-- 2. L5-2 : choisir, changer ou retirer son pseudo.
create function public.set_pseudo(p_pseudo text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_pseudo text := normalize(p_pseudo, NFC);
  v_key text;
  v_prof public.scout_profiles;
  v_err text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  insert into public.scout_profiles (user_id) values (v_uid) on conflict do nothing;
  select * into v_prof from public.scout_profiles where user_id = v_uid for update;

  if v_pseudo is null then
    update public.scout_profiles set pseudo = null, pseudo_key = null,
           pseudo_state = case when pseudo_state = 'reset' then 'reset' else 'none' end
     where user_id = v_uid;
    perform public.league_leave(v_uid);
    return jsonb_build_object('pseudo', null, 'state', (select pseudo_state from public.scout_profiles where user_id = v_uid));
  end if;

  v_err := public.pseudo_format_error(v_pseudo);
  if v_err is not null then raise exception 'PSEUDO_INVALID' using errcode = '22023', detail = v_err; end if;
  v_key := public.pseudo_key(v_pseudo);
  if public.pseudo_blocked(v_key) then raise exception 'PSEUDO_REFUSED' using errcode = '22023'; end if;
  -- Un changement par 24 h (le premier choix et le choix après réinitialisation par l'admin sont libres).
  if v_prof.pseudo_key is not null and v_prof.pseudo_key <> v_key
     and v_prof.pseudo_changed_at > v_now - interval '24 hours' then
    raise exception 'PSEUDO_TOO_SOON' using errcode = 'P0001',
      hint = to_char((v_prof.pseudo_changed_at + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  if exists (select 1 from public.scout_profiles s where s.pseudo_key = v_key and s.user_id <> v_uid) then
    raise exception 'PSEUDO_TAKEN' using errcode = '23505', hint = coalesce(public.pseudo_suggest(v_pseudo), '');
  end if;

  begin
    update public.scout_profiles
       set pseudo = v_pseudo, pseudo_key = v_key, pseudo_state = 'ok', league_opt_in = true,
           pseudo_changed_at = case when v_prof.pseudo_key is distinct from v_key then v_now else pseudo_changed_at end
     where user_id = v_uid;
  exception when unique_violation then
    raise exception 'PSEUDO_TAKEN' using errcode = '23505', hint = coalesce(public.pseudo_suggest(v_pseudo), '');
  end;
  -- Points déjà gagnés cette semaine : entrée en groupe tout de suite (repris depuis les notes).
  if exists (select 1 from public.grade_events e where e.user_id = v_uid and e.week_start = public.league_week_of(v_now)) then
    perform public.league_join(v_uid, public.league_week_of(v_now), v_now);
  end if;
  return jsonb_build_object('pseudo', v_pseudo, 'state', 'ok');
end $$;

-- L5-2 : participer ou non. false libère aussi le pseudo (design P-G) ; true vaut pour « Non merci » annulé.
create function public.set_league_opt_in(p_in boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if p_in is null then raise exception 'OPT_IN_INVALID' using errcode = '22023'; end if;
  insert into public.scout_profiles (user_id) values (v_uid) on conflict do nothing;
  if p_in then
    update public.scout_profiles set league_opt_in = true where user_id = v_uid;
    perform public.league_join(v_uid, public.league_week_of(v_now), v_now)
      where exists (select 1 from public.grade_events e where e.user_id = v_uid and e.week_start = public.league_week_of(v_now));
  else
    update public.scout_profiles
       set league_opt_in = false, pseudo = null, pseudo_key = null,
           pseudo_state = case when pseudo_state = 'reset' then 'reset' else 'none' end
     where user_id = v_uid;
    perform public.league_leave(v_uid);
  end if;
  return jsonb_build_object('optIn', p_in);
end $$;

-- 3. L5-3 : état de l'écran Ligue (clôture paresseuse comprise). Jamais d'user_id, d'e-mail ni de nom d'autrui.
create function public.league_state(p_uid uuid, p_now timestamptz) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_week date := public.league_week_of(p_now);
  v_prof public.scout_profiles;
  v_me public.league_members;
  v_status text;
  v_group jsonb := '[]'::jsonb;
  v_n integer := 0;
  v_up integer := 0;
  v_down integer := 0;
  v_ch record;
  v_last jsonb;
begin
  perform public.league_close_due(p_now);
  select * into v_prof from public.scout_profiles where user_id = p_uid;
  if v_prof.pseudo_state = 'ok' and v_prof.league_opt_in
     and exists (select 1 from public.grade_events e where e.user_id = p_uid and e.week_start = v_week) then
    perform public.league_join(p_uid, v_week, p_now);
  end if;
  select * into v_me from public.league_members where week_start = v_week and user_id = p_uid;

  v_status := case
    when v_prof.pseudo_state = 'reset' then 'reset'
    when v_prof.user_id is not null and not v_prof.league_opt_in then 'opted_out'
    when v_prof.pseudo_state is distinct from 'ok' then 'no_pseudo'
    when v_me.user_id is not null then 'active'
    when p_now < public.week_deadline(v_week - 7) then 'pending'
    else 'not_started' end;

  if v_status = 'active' then
    select count(*) into v_n from public.league_members m join public.scout_profiles p on p.user_id = m.user_id
     where m.group_id = v_me.group_id and p.pseudo_state = 'ok' and p.league_opt_in;
    v_up := case when v_me.tier < 6 then least(5, v_n / 3) else 0 end;
    v_down := case when v_me.tier > 1 then least(3, v_n / 5) else 0 end;
    select coalesce(jsonb_agg(jsonb_build_object('id', r.public_id, 'pseudo', r.pseudo, 'xp', r.xp, 'rank', r.rk,
             'zone', case when r.rk <= v_up and r.xp >= 50 then 'up'
                          when r.rk > v_n - v_down and r.xp < 100 then 'down' else 'stay' end,
             'isMe', r.user_id = p_uid) order by r.rk), '[]'::jsonb)
      into v_group
      from (select m.public_id, p.pseudo, m.xp, m.user_id,
                   row_number() over (order by m.xp desc, m.last_gain_at, m.joined_at, m.user_id) as rk
              from public.league_members m join public.scout_profiles p on p.user_id = m.user_id
             where m.group_id = v_me.group_id and p.pseudo_state = 'ok' and p.league_opt_in) r;
  end if;

  select jsonb_build_object('weekStart', m.week_start, 'rank', m.final_rank, 'outcome', m.outcome,
           'tierBefore', m.tier, 'tierAfter', m.tier + m.outcome,
           'groupSize', (select count(*) from public.league_members o where o.group_id = m.group_id and o.final_rank is not null))
    into v_last
    from public.league_members m join public.league_weeks w on w.week_start = m.week_start
   where m.user_id = p_uid and m.week_start = v_week - 7 and w.closed_at is not null and m.outcome is not null;

  select * into v_ch from public.league_challenge(v_week);
  return jsonb_build_object(
    'status', v_status,
    'weekStart', v_week, 'weekEnd', v_week + 6,
    'endsAt', public.week_ends_at(v_week), 'deadline', public.week_deadline(v_week),
    'pseudo', v_prof.pseudo, 'pseudoState', coalesce(v_prof.pseudo_state, 'none'),
    'optIn', coalesce(v_prof.league_opt_in, true),
    'tier', coalesce(v_prof.tier, 1),
    'weekXp', (select coalesce(sum(e.xp), 0) from public.grade_events e where e.user_id = p_uid and e.week_start = v_week),
    'todayXp', (select coalesce(sum(e.xp), 0) from public.grade_events e where e.user_id = p_uid and e.day = public.day_num(p_now)),
    'groupSize', v_n, 'upCount', v_up, 'downCount', v_down,
    'group', v_group,
    'lastResult', v_last,
    'challenge', jsonb_build_object('kind', v_ch.kind, 'target', v_ch.target,
       'progress', public.league_challenge_progress(p_uid, v_week),
       'done', public.league_challenge_progress(p_uid, v_week) >= v_ch.target,
       'zone', case when v_ch.kind = 'zone_cards' then public.zone_of_day(public.day_num(p_now)) end),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('badge', b.badge, 'weekStart', b.week_start, 'earnedAt', b.earned_at)
                 order by b.earned_at, b.badge), '[]'::jsonb) from public.user_badges b where b.user_id = p_uid),
    'serverTime', p_now);
end $$;

create function public.get_league_state() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  return public.league_state(auth.uid(), now());
end $$;

-- 4. L5-4 : signaler un pseudo de son groupe (A4). p_member = group[].id, identifiant opaque de la semaine.
create function public.report_pseudo(p_member uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  c_daily_reports constant integer := 10;
  v_uid uuid := auth.uid();
  v_week date := public.league_week_of(now());
  v_target uuid;
  v_key text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  select o.user_id, p.pseudo_key into v_target, v_key
    from public.league_members me
    join public.league_members o on o.group_id = me.group_id and o.user_id <> me.user_id
    join public.scout_profiles p on p.user_id = o.user_id and p.pseudo_state = 'ok'
   where me.week_start = v_week and me.user_id = v_uid and o.public_id = p_member;
  if v_target is null then raise exception 'MEMBER_NOT_FOUND' using errcode = '22023'; end if;
  if (select count(*) from public.pseudo_reports r
       where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= c_daily_reports then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  insert into public.pseudo_reports (reporter_id, target_id, pseudo_key) values (v_uid, v_target, v_key)
  on conflict do nothing;
end $$;

-- 5. L5-5 : administration (is_admin(), sinon 42501 FORBIDDEN).
create function public.assert_admin() returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
end $$;

-- Liste : signalés d'abord, puis les plus récents (design P-H). Curseur opaque = colonne cursor de la dernière ligne.
create function public.admin_list_pseudos(p_search text default null, p_after text default null, p_limit integer default 50)
  returns table (user_id uuid, pseudo text, tier smallint, changed_at timestamptz, reports integer, cursor text)
  language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_search text := nullif(public.pseudo_key(coalesce(p_search, '')), '');
  v_k1 integer;
  v_k2 numeric;
  v_k3 uuid;
begin
  perform public.assert_admin();
  if p_after is not null then
    if p_after !~ '^-?[0-9]+\|-?[0-9]+(\.[0-9]+)?\|[0-9a-f-]{36}$' then
      raise exception 'CURSOR_INVALID' using errcode = '22023';
    end if;
    v_k1 := split_part(p_after, '|', 1)::integer;
    v_k2 := split_part(p_after, '|', 2)::numeric;
    v_k3 := split_part(p_after, '|', 3)::uuid;
  end if;
  return query
    select x.user_id, x.pseudo, x.tier, x.changed_at, x.reports, (-x.reports) || '|' || x.k2 || '|' || x.user_id
      from (select s.user_id, s.pseudo, s.tier, s.pseudo_changed_at as changed_at,
                   (select count(*) from public.pseudo_reports r where r.target_id = s.user_id
                       and r.pseudo_key = s.pseudo_key and r.dismissed_at is null)::integer as reports,
                   -coalesce(extract(epoch from s.pseudo_changed_at), 0) as k2
              from public.scout_profiles s
             where s.pseudo is not null and (v_search is null or strpos(s.pseudo_key, v_search) > 0)) x
     where p_after is null or (-x.reports, x.k2, x.user_id) > (v_k1, v_k2, v_k3)
     order by -x.reports, x.k2, x.user_id
     limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $$;

-- reset : pseudo retiré ; refuse : idem et clé ajoutée aux mots refusés exacts ; ignore : signalements écartés.
create function public.admin_moderate_pseudo(p_user uuid, p_action text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_key text;
begin
  perform public.assert_admin();
  if p_action is null or p_action not in ('reset', 'refuse', 'ignore') then
    raise exception 'ACTION_INVALID' using errcode = '22023';
  end if;
  select pseudo_key into v_key from public.scout_profiles where user_id = p_user and pseudo is not null for update;
  if v_key is null then raise exception 'USER_NOT_FOUND' using errcode = '22023'; end if;
  update public.pseudo_reports set dismissed_at = now() where target_id = p_user and dismissed_at is null;
  if p_action = 'ignore' then return; end if;
  if p_action = 'refuse' then
    insert into public.pseudo_blocklist (word, exact) values (v_key, true) on conflict do nothing;
  end if;
  update public.scout_profiles set pseudo = null, pseudo_key = null, pseudo_state = 'reset' where user_id = p_user;
end $$;

-- Mots refusés (A10) : lecture et édition par l'admin seulement, jamais montrés aux scouts.
create function public.admin_list_blocked_words() returns table (word text, exact boolean)
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query select b.word, b.exact from public.pseudo_blocklist b order by b.word;
end $$;

create function public.admin_set_blocked_word(p_word text, p_exact boolean default false) returns text
  language plpgsql security definer set search_path = ''
as $$
declare v_word text := public.pseudo_key(coalesce(p_word, ''));
begin
  perform public.assert_admin();
  if v_word !~ '^[a-z0-9]{2,30}$' then raise exception 'WORD_INVALID' using errcode = '22023'; end if;
  insert into public.pseudo_blocklist (word, exact) values (v_word, coalesce(p_exact, false))
  on conflict (word) do update set exact = excluded.exact;
  return v_word;
end $$;

create function public.admin_remove_blocked_word(p_word text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  delete from public.pseudo_blocklist where word = public.pseudo_key(coalesce(p_word, ''));
end $$;

-- 6. Liste amorcée (A10). exact = true pour les mots courts ou contenus dans des mots innocents
--    (con/faucon, bite/habite, cul/calcul, pute/député, viol/violon, nique/technique, nazi/Nazir, salaud/Salaudin).
--    Wolof : à relire par un locuteur (A12) ; les mots qui sont aussi des noms ou surnoms usuels sont laissés à l'admin
--    (écran Mots refusés).
insert into public.pseudo_blocklist (word, exact) values
  -- français, inclusion
  ('connard', false), ('connasse', false), ('salope', false), ('salopard', false),
  ('encule', false), ('batard', false), ('putain', false), ('petasse', false), ('pouffiasse', false),
  ('merde', false), ('couille', false), ('tagueule', false), ('niquetamere', false), ('niquer', false),
  ('enfoire', false), ('gouine', false), ('branleur', false), ('branlette', false), ('foutre', false),
  ('trouduc', false), ('sexe', false), ('porno', false), ('penis', false), ('vagin', false), ('sodomi', false),
  ('fellation', false), ('pedophile', false), ('violeur', false), ('hitler', false),
  ('negre', false), ('bougnoule', false), ('suicide', false), ('sucemoi', false), ('baiseur', false),
  -- français, mot exact
  ('con', true), ('cons', true), ('pute', true), ('putes', true), ('bite', true), ('cul', true), ('chatte', true),
  ('nique', true), ('ntm', true), ('fdp', true), ('pd', true), ('pede', true), ('tg', true), ('zizi', true),
  ('viol', true), ('pedo', true), ('suce', true), ('baise', true), ('tapette', true), ('garce', true),
  ('negro', true), ('nazi', true), ('salaud', true), ('debile', true), ('cretin', true), ('abruti', true), ('admin', true), ('moderateur', true),
  -- wolof
  ('doomuxaraam', false), ('domuxaram', false), ('sagasandey', false), ('sagaandey', false), ('mbaamxuux', false),
  ('sandey', true), ('xaj', true), ('mbaam', true), ('taat', true)
on conflict do nothing;

-- 7. Droits : RPC publics pour authenticated seulement ; tout le reste révoqué (pg_default_acl local).
revoke all on function public.pseudo_key(text), public.pseudo_blocked(text), public.pseudo_format_error(text),
  public.pseudo_suggest(text), public.league_leave(uuid), public.league_state(uuid, timestamptz), public.assert_admin()
  from public, anon, authenticated;
revoke all on function public.set_pseudo(text), public.set_league_opt_in(boolean), public.get_league_state(),
  public.report_pseudo(uuid), public.admin_list_pseudos(text, text, integer), public.admin_moderate_pseudo(uuid, text),
  public.admin_list_blocked_words(), public.admin_set_blocked_word(text, boolean), public.admin_remove_blocked_word(text)
  from public, anon;
grant execute on function public.set_pseudo(text), public.set_league_opt_in(boolean), public.get_league_state(),
  public.report_pseudo(uuid), public.admin_list_pseudos(text, text, integer), public.admin_moderate_pseudo(uuid, text),
  public.admin_list_blocked_words(), public.admin_set_blocked_word(text, boolean), public.admin_remove_blocked_word(text)
  to authenticated;
