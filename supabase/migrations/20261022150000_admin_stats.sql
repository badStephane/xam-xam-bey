-- Statistiques globales de l'Admin (2026-10-22) : évolution de l'activité, avancement par zone, questions les plus ratées.
-- Décision PM : agrégats seulement. Aucun user_id, e-mail ni pseudo ne sort de la fonction (vie privée de mineurs, lot 5).
-- Sources : grade_events (notes vérifiées par le serveur, tous les scouts, gardées 8 semaines par league_close_week)
-- et progress.cards ({ id: [niveau, échéance, vues, réussites, premier jour] }).
create function public.admin_stats() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c_weeks constant integer := 7;         -- semaines affichées, toutes encore présentes dans grade_events (8 gardées)
  c_acquired_lv constant integer := 4;   -- = ACQUIRED_LV (src/lib/constants.ts) : carte « acquise »
  c_min_answers constant integer := 5;   -- en dessous, un taux de réussite ne dit rien
  c_min_scouts constant integer := 3;    -- une ligne ne décrit jamais un seul scout
  c_hardest constant integer := 20;
  v_week date := public.league_week_of(now());
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'accounts', (select count(*) from public.progress p where p.cards <> '{}'::jsonb),
    'weeks', (
      select jsonb_agg(jsonb_build_object('week', w.week, 'scouts', coalesce(e.scouts, 0),
                                          'answers', coalesce(e.answers, 0), 'correct', coalesce(e.correct, 0)) order by w.week)
        from (select v_week - 7 * g as week from generate_series(0, c_weeks - 1) g) w
        left join (select g.week_start, count(distinct g.user_id) as scouts, count(*) as answers,
                          count(*) filter (where g.grade = 2) as correct
                     from public.grade_events g where g.week_start > v_week - 7 * c_weeks
                    group by g.week_start) e on e.week_start = w.week),
    'zones', (
      select coalesce(jsonb_agg(jsonb_build_object('zone', z.zone, 'scouts', z.scouts, 'seen', z.seen, 'acquired', z.acquired)
                                order by z.zone), '[]'::jsonb)
        from (select k.zone, count(distinct p.user_id) as scouts, count(*) as seen,
                     count(*) filter (where public.json_num(e.value -> 0) >= c_acquired_lv) as acquired
                from public.progress p
               cross join lateral jsonb_each(p.cards) e
                join public.cards k on k.id = e.key
               group by k.zone) z),
    'hardest', (
      select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'zone', h.zone, 'q', h.q, 'answers', h.answers, 'correct', h.correct)
                                order by h.n), '[]'::jsonb)
        from (select k.id, k.zone, k.q, count(*) as answers, count(*) filter (where g.grade = 2) as correct,
                     row_number() over (order by count(*) filter (where g.grade = 2)::numeric / count(*), count(*) desc, k.id) as n
                from public.grade_events g
                join public.cards k on k.id = g.card_id
               where g.week_start > v_week - 7 * c_weeks
               group by k.id, k.zone, k.q
              having count(*) >= c_min_answers and count(distinct g.user_id) >= c_min_scouts) h
       where h.n <= c_hardest)
  );
end $$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
