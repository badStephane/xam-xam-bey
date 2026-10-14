-- Lot 5 (3/3) : clôture hebdomadaire planifiée (ADR-3). Fichier séparé : le SRE peut le sauter si pg_cron est refusé,
-- la clôture paresseuse de get_league_state suffit alors (première ouverture de l'écran Ligue après lundi 06:00 UTC).
-- Toutes les heures à la minute 5 : la semaine est close à 06:05 UTC le lundi au plus tard. Rejouable sans effet.
create extension if not exists pg_cron;
select cron.schedule('xxb-close-weeks', '5 * * * *', 'select public.league_close_due()');
