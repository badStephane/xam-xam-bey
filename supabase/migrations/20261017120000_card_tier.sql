-- Paliers de difficulté des questions (2026-10-17) : 1 = base (toutes les questions existantes), 2 = approfondi, 3 = expert.
-- Le palier suivant d'une zone s'ouvre côté client (srs.ts, openTiers). À appliquer AVANT le déploiement du front :
-- le front lit la colonne `tier`.
alter table public.cards add column if not exists tier smallint not null default 1;
alter table public.cards drop constraint if exists cards_tier_check;
alter table public.cards add constraint cards_tier_check check (tier between 1 and 3);
