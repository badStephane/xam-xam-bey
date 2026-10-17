# Contexte partagé de l'équipe

## Demande

Audit complet du projet **Xam Xam Bëy** (mode Revue) : chaque rôle relit son périmètre et produit `docs/squad/revue-<rôle>.md`. L'orchestrateur consolide un tableau unique trié par sévérité. Pas de modification du code applicatif pendant l'audit.

## Produit

Plateforme de ressources et de révision scoute (District Grand Dakar, Sénégal). Utilisateurs : responsables scouts, et depuis le 2026-10-16 tout public (révision ouverte à tous, sans changement d’accès : tout e-mail peut déjà créer un compte), majoritairement sur téléphone Android d'entrée de gamme, réseau mobile parfois lent.

- **Bibliothèque publique** : environ 170 PDF classés en 12 zones mensuelles (oct. 2026 à sept. 2027), avec recherche, filtres, aperçu PDF (pdf.js).
- **Révision** (connexion par lien magique) : session du jour, répétition espacée, QCM, plan annuel, fiches, progression (XP, niveaux, séries).
- **Admin** (e-mails listés dans la table `admins`) : envoi, modification et retrait de PDF ; écriture des questions (brouillon puis publié).

## Stack

- React 18 + TypeScript + Vite 5, sans routeur ni bibliothèque UI ; CSS maison (`src/styles/app.css`).
- Supabase : Auth (lien magique), Postgres + RLS, Storage (bucket public `documents`). Le client utilise la clé anon dans le navigateur.
- Tests : Vitest (`src/lib/*.test.ts`, `src/planches/frames.test.ts`). Pas de tests de composants ni d'E2E.
- Hébergement : Cloudflare (Workers assets via `wrangler.jsonc`, ou Pages via `npm run deploy:pages`), Netlify en option (`netlify.toml`). Pas de CI (`.github/` absent). Les en-têtes de sécurité et la CSP sont dans `public/_headers`.
- Scripts : Python (`scripts/*.py`, avec chemins absolus) et Node (`scripts/upload_documents.mjs` avec la clé service role).

## Carte du code (~4 000 lignes TS/TSX)

- `src/App.tsx`, `src/AppContext.tsx`, `src/main.tsx` : entrée, état global.
- `src/components/library/*` : bibliothèque, aperçu, lecteur PDF.
- `src/components/revision/*` : session, entraînement, plan, fiches, progression.
- `src/components/admin/*` + `src/lib/adminApi.ts` : espace admin.
- `src/lib/*` : logique pure (catalogue, srs, session, qcm, pdf, storage, supabase).
- `supabase/migrations/*.sql` (5 migrations, dont `20261012191639_library.sql` : documents, cards, admins, is_admin, bucket) ; `supabase/content/*.sql` : contenu généré.
- `src/planches/*` + `planches.html` : guide de style et planche des écrans (mode démo).

## Contraintes

- Bénévoles, budget nul (offres gratuites Supabase et Cloudflare).
- Contenu en français. Dépôt privé ; les documents appartiennent à l'association.
- Mobile d'abord (360 px vérifié récemment).

## Hypothèses

- Quelques dizaines à quelques centaines d'utilisateurs ; moins de 5 admins.
- Les données personnelles se limitent à l'e-mail et à la progression de révision.
