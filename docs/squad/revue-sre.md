# Revue SRE / exploitation : Xam Xam Bëy

Date : 2026-10-12. Mode Revue, lecture seule. Build local vérifié : `npm run build` passe (dist/ = 4,7 Mo, 188 fichiers).

## Hypothèses

- H1. On ne sait pas quelle cible sert la production aujourd'hui : Netlify (README:45, `.netlify/state.json`), Cloudflare Workers (`wrangler.jsonc`) ou Cloudflare Pages (`deploy:pages`, dernier commit). La revue recommande d'en garder une seule (Cloudflare Pages).
- H2. Usage : 100 à 300 responsables, 10 à 20 ouvertures de PDF par personne et par mois, avec des pics au lancement de chaque zone mensuelle.
- H3. Les quotas gratuits ci-dessous sont ceux publiés par les fournisseurs à date ; à revérifier une fois par an sur leurs pages de tarification (aucun appel réseau n'a été fait pendant la revue).
- H4. Le dépôt GitHub est privé : 2 000 minutes d'Actions gratuites par mois.

## Constats (triés par sévérité)

| ID | Sév. | Fichier:ligne | Constat | Scénario d'échec | Correctif proposé |
|---|---|---|---|---|---|
| OPS-1 | CRITIQUE | README.md:45 | L'Auth utilise le SMTP intégré de Supabase : environ 2 e-mails par heure, et seulement vers les adresses des membres de l'équipe Supabase. | Au lancement, 200 responsables demandent un lien magique : presque aucun ne le reçoit, la révision est inaccessible. | Avant l'ouverture, brancher un SMTP gratuit (Brevo : 300 e-mails/jour, sans domaine obligatoire ; Resend : 100/jour avec un domaine). Relever ensuite la limite Auth « emails per hour » et tester avec 3 adresses extérieures. |
| OPS-2 | HAUTE | package.json:13-14, wrangler.jsonc, netlify.toml, README.md:45,56-62 | Trois cibles de déploiement possibles, aucune désignée comme production. Aucun rollback documenté ni testé. | Un bénévole déploie sur Pages alors que l'URL partagée est Netlify : correctif invisible. Ou bien une régression arrive et personne ne sait revenir en arrière. | Garder une seule cible (Cloudflare Pages reliée à GitHub). Supprimer `netlify.toml`, `.netlify/` et `wrangler.jsonc`, ou les marquer « non utilisés ». Écrire la procédure de rollback (section B) et la tester une fois. |
| OPS-3 | HAUTE | package.json:14 | `deploy:pages` part du poste d'un bénévole avec `--commit-dirty=true`, son `node_modules` et son `.env.local`. Pas de CI (`.github/` absent). | Une modification non commitée part en production : impossible de savoir quel code tourne, impossible de le reconstruire. Des tests cassés partent aussi en production. | Déployer seulement depuis `main` via l'intégration Git de Pages. Une CI GitHub Actions bloque sur typecheck, tests et build (section A). Garder `deploy:pages` uniquement en secours, sans `--commit-dirty`. |
| OPS-4 | HAUTE | src/lib/supabase.ts:7-10,25-27 | Un build sans `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` réussit quand même. Les PDF pointent alors vers `f/…`, qui est absent de dist/, et la révision est désactivée. Seul un `console.error` le signale. | Les variables sont oubliées ou mal nommées dans Cloudflare : le site se déploie « vert », les 170 PDF répondent 404 et la connexion disparaît. | Faire échouer le build de production si une variable manque (contrôle dans `vite.config.ts` en mode `production`, à faire par le dev front). Ajouter un test de fumée après déploiement (section C). |
| OPS-5 | HAUTE | (offre Supabase Free) | Un projet gratuit est mis en pause après 7 jours sans activité. Il se réveille à la main depuis le tableau de bord. Après 90 jours de pause, il ne se restaure plus depuis le tableau de bord. | Pendant les vacances (juillet-août), plus personne ne révise, le projet passe en pause et la bibliothèque perd tous ses PDF. Les données sont perdues si personne ne réagit. | Ajouter une sonde quotidienne en GitHub Actions qui interroge l'API REST (section C). Elle sert à la fois d'alerte et de maintien en activité. En complément, une sauvegarde mensuelle (section D). |
| OPS-6 | HAUTE | (offre Supabase Free), README.md:27 | Aucune sauvegarde : l'offre gratuite n'a ni PITR ni sauvegarde téléchargeable, et aucun dump n'est prévu. Les PDF d'origine sont dans git (site/f, 170 fichiers), mais pas les PDF ajoutés par l'admin, ni `progress`, ni `cards` édités en ligne, ni `auth.users`. | Une suppression accidentelle par un admin, un projet perdu après la pause ou une migration ratée : progression et questions perdues sans retour possible. | Dump mensuel chiffré `public` + `auth` et copie du bucket (section D). Restauration testée une fois et chronométrée. RPO 30 j et RTO 4 h à valider par le PM. |
| OPS-7 | HAUTE | (absent) | Aucune supervision ni alerte. Aucun suivi d'erreurs front. | Une panne, un projet en pause ou un quota dépassé se découvrent par un message WhatsApp d'un responsable, des jours plus tard. | Deux alertes gratuites : la sonde GitHub Actions (section C) et UptimeRobot sur l'URL du site. Sentry (5 000 erreurs/mois gratuites) en annexe. |
| OPS-8 | MOYENNE | src/lib/supabase.ts:25, scripts/upload_documents.mjs:45 | Les PDF sont servis depuis Supabase Storage, donc l'egress compte dans le quota Supabase (voir le tableau des quotas). Avec 300 personnes actives, on approche des 5 Go. | Un mois de lancement chargé fait dépasser le quota. Supabase restreint alors le projet après une période de grâce : PDF et Auth bloqués. | Surveiller l'onglet Usage chaque semaine pendant le premier mois. Repli prêt : servir les PDF compressés depuis Cloudflare (129 Mo, plus gros fichier 7,7 Mo, sous la limite de 25 Mio, bande passante illimitée). Il suffit de copier `site/f-min` dans `dist/f` et de pointer `storageUrls.file` vers `f/`. Décision ADR à prendre par le back. |
| OPS-9 | MOYENNE | supabase/migrations/*_revision_content.sql:6,26 ; README.md:42-43 ; commit 038acdf | Deux façons d'appliquer les migrations : éditeur SQL (contenu découpé « pour l'éditeur ») et `supabase db push`. Les 3 migrations de contenu font `on conflict do update`. Aucune migration descendante. | Une migration appliquée dans l'éditeur n'est pas enregistrée dans `schema_migrations`. Le `db push` suivant la rejoue et écrase sans bruit `revision_content` avec l'ancien contenu. | Une seule voie : `supabase db push`. Vérifier avec `supabase migration list`, puis aligner avec `supabase migration repair --status applied <version>`. Faire un dump juste avant chaque migration et corriger en avant (pas de retour en arrière de schéma). |
| OPS-10 | MOYENNE | scripts/upload_documents.mjs:7, README.md:42 | La clé service role est tapée en clair dans la commande, donc enregistrée dans `~/.zsh_history`. Aucune procédure de rotation. | Le portable d'un bénévole est perdu ou son historique synchronisé : quelqu'un obtient un accès total qui contourne la RLS. | Saisie sans historique : `read -rs SUPABASE_SERVICE_ROLE_KEY; export SUPABASE_SERVICE_ROLE_KEY`. Utiliser une clé secrète `sb_secret_…` révocable seule, puis la révoquer après usage. Rotation décrite dans le runbook (section E). |
| OPS-11 | MOYENNE | README.md:45,62 ; src/lib/supabase.ts:19 | La Site URL et les Redirect URLs Supabase pointent vers « l'adresse Netlify ». Un changement de cible n'est pas reporté. | Après une bascule vers Pages, les liens magiques renvoient vers l'ancienne adresse ou sont refusés : plus aucune connexion. | Mettre l'URL de production retenue et `https://*.xam-xam-bey.pages.dev/**` (aperçus) dans les Redirect URLs. Ajouter cette étape à la checklist de bascule. |

### Annexe : constats mineurs (BASSE)

- OPS-12 `public/_headers` : pas de HSTS. Sans gravité sur `*.pages.dev`/`*.netlify.app`, dont les TLD (.dev, .app) sont préchargés en HSTS. À ajouter si un domaine propre arrive.
- OPS-13 `public/_headers` : aucune règle de cache pour `index.html`. Pages renvoie `max-age=0, must-revalidate`, mais Netlify et Workers peuvent différer. Ajouter `/index.html` avec `Cache-Control: no-cache`.
- OPS-14 `wrangler.jsonc:7` : `not_found_handling: "404-page"` sans `404.html` dans dist/. Le comportement diffère de Pages (repli SPA). Sans effet aujourd'hui, l'app n'ayant pas de routes par chemin.
- OPS-15 `public/_headers:6` : `font-src` sans `'self'` ni `blob:`. Vérifier en recette que pdf.js n'affiche aucune erreur CSP (polices standard chargées depuis `/pdfjs/`).
- OPS-16 `vite.config.ts:47` : `planches.html` (mode démo) est publié en production. L'exclure du build de prod ou l'assumer.
- OPS-17 `package.json` : `npx wrangler@4` est flottant, `^` sur supabase-js et pdfjs-dist. Sans gravité si `npm ci` est utilisé (le lockfile est présent). `/pdfjs/*` est mis en cache 7 jours sans hash de version.
- OPS-18 `.netlify/state.json` est versionné (siteId, non secret). À supprimer avec Netlify si la cible est abandonnée.
- OPS-19 `supabase/config.toml` absent : `supabase init` n'a pas été fait dans le dépôt. Certaines commandes CLI peuvent le réclamer.
- OPS-20 `.git` pèse 156 Mo à cause des PDF (site/f). C'est acceptable, et même utile comme sauvegarde hors site des originaux. Ne pas y ajouter `site/f-min`.
- OPS-21 Pas de scan de secrets ni de dépendances : activer Dependabot et le secret scanning GitHub (gratuits).
- OPS-22 Google Fonts sont chargées depuis un tiers, ce qui fait une dépendance et une latence de plus sur 3G. À voir avec le front (auto-héberger les polices).

## Quotas gratuits face à l'usage estimé (porte)

Calcul : poids moyen d'un PDF compressé = 129 Mo / 170 = 0,76 Mo.

| Quota (offre gratuite) | Limite | Usage estimé | Marge | Verdict |
|---|---|---|---|---|
| Supabase Storage | 1 Go | 129 Mo (f-min) ; 177 Mo si les originaux sont envoyés | 13 à 18 % utilisés | OK |
| Supabase egress non mis en cache | 5 Go/mois | 100 pers. x 10 PDF = 0,8 Go ; 300 x 20 = 4,6 Go | 15 % à 92 % | Risque à 300 actifs (OPS-8) |
| Supabase egress mis en cache (CDN) | 5 Go/mois, séparé | Avec `cacheControl 604800`, une grande partie des lectures du PDF du mois sera en cache | Réduit le chiffre ci-dessus | OK, à confirmer dans Usage |
| Supabase base de données | 500 Mo | Contenu ~1 Mo, `progress` ~30 Ko/pers. x 300 = 9 Mo | < 3 % | OK |
| Supabase MAU Auth | 50 000 | 300 | < 1 % | OK |
| Supabase e-mails Auth (SMTP intégré) | ~2/heure, équipe seulement | ~300 la première semaine, puis ~50/semaine | Insuffisant | BLOQUANT (OPS-1) |
| Brevo (SMTP de remplacement) | 300/jour | Pic ~100/jour au lancement | 3x | OK |
| Supabase inactivité | Pause après 7 j | Creux en vacances | 0 | Risque (OPS-5) |
| Cloudflare Pages | 500 builds/mois, 20 000 fichiers, 25 Mio/fichier, bande passante illimitée | ~30 builds, 188 fichiers, plus gros 1,4 Mo | Large | OK |
| GitHub Actions (dépôt privé) | 2 000 min/mois | CI 3 min x 40 + sonde 1 min x 30 + dump 2 min = ~155 min | 8 % | OK |
| UptimeRobot | 50 sondes, toutes les 5 min | 1 à 2 sondes | Large | OK |

## Plan d'exploitation minimal (coût nul)

### A. CI GitHub Actions (esquisse, à créer par un dev après validation)

Le déploiement reste assuré par l'intégration Git de Cloudflare Pages : variables de build `VITE_*` réglées dans Cloudflare, build sur chaque push, un aperçu par branche. La CI ne fait que bloquer le merge (protection de branche sur `main` : statut `ci` obligatoire).

```yaml
# .github/workflows/ci.yml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .node-version, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
        env:   # clé anon publique par conception ; secrets du dépôt pour ne pas les dupliquer en clair
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - run: test -f dist/index.html && test -f dist/_headers
```

Plus tard, une fois la confiance là : `npm audit --omit=dev --audit-level=high` et un test E2E de fumée (Playwright) sur l'URL d'aperçu.

### B. Rollback (porte : procédure concrète, objectif < 5 min)

1. **Site, cible Cloudflare Pages (recommandée)** : Workers & Pages, projet `xam-xam-bey`, Deployments. Sur le dernier déploiement Production sain, menu ⋯ puis « Rollback to this deployment ». C'est effectif en moins d'une minute, sans rebuild.
2. **Site, si la cible est un Worker** : `npx wrangler@4 deployments list`, puis `npx wrangler@4 rollback <version-id> --message "raison"`. Équivalent dans le tableau de bord : Worker, Deployments, Rollback.
3. **Site, si la cible est Netlify** : Deploys, choisir le déploiement sain, « Publish deploy ».
4. **Corriger ensuite dans git** : `git revert <sha>` puis push sur `main`. Le déploiement suivant repart d'un état propre (sinon le prochain push réintroduit le bug).
5. **Base de données** : pas de migration descendante, on corrige en avant. Avant toute migration : `supabase db dump --data-only -s public -f avant-<date>.sql`. En cas de dégât : restaurer les tables touchées depuis ce dump (`psql "$DB_URL" -f avant-<date>.sql` après un `truncate` ciblé), en suivant le runbook.
6. **Test** : un exercice dans le mois (déployer un changement visible, revenir en arrière, chronométrer). Noter la date et la durée en bas de ce fichier.

### C. Deux alertes gratuites

1. **Sonde quotidienne GitHub Actions** (`.github/workflows/sonde.yml`, `schedule: cron "0 7 * * *"` plus `workflow_dispatch`). Elle vérifie trois points, et un échec envoie un e-mail GitHub au mainteneur :
   - `curl -fsS <URL_PROD>/ | grep -q '<div id="root"'` : le site répond.
   - `curl -fsS "$SUPABASE_URL/rest/v1/documents?select=id&limit=1" -H "apikey: $ANON"` : la base répond. Cette requête sert aussi de maintien en activité contre la pause (OPS-5).
   - `curl -fsI "$SUPABASE_URL/storage/v1/object/public/documents/<un-pdf>.pdf"` : le stockage répond (détecte aussi OPS-4 et OPS-8).

   À savoir : GitHub n'envoie l'e-mail d'échec qu'à la personne qui a modifié le cron en dernier. Il faut donc que ce soit le mainteneur.
2. **UptimeRobot** (gratuit, usage non commercial) : sonde HTTP « mot-clé » sur l'URL de production toutes les 5 minutes, alerte par e-mail à 2 bénévoles. C'est indépendant de GitHub et de Cloudflare.

Seuils : 1 échec de la sonde quotidienne = agir le jour même ; UptimeRobot en panne plus de 10 min = suivre le runbook E.

### D. Sauvegarde (règle 3-2-1 version bénévole)

- **Mensuelle, faite par un admin** (le 1er du mois, ~10 min), avec la CLI liée au projet :
  `supabase db dump -f schema.sql` puis `supabase db dump --data-only -s public,auth -f data.sql`.
  Chiffrer (`gpg -c` ou `age -p`), puis déposer sur le Drive de l'association et en garder une copie sur un disque local. Le dump contient des e-mails : ne jamais le mettre dans git ni dans un artefact Actions en clair.
- **PDF** : les originaux sont dans git. Les PDF ajoutés par les admins sont à recopier chaque mois depuis le bucket public, avec un petit script de téléchargement (hors périmètre, à faire par le back).
- **Restauration testée** une fois par trimestre, dans un projet Supabase gratuit de test (2 projets gratuits par organisation). La chronométrer et l'inscrire ici.
- **Cibles proposées** (à valider par le PM) : RPO 30 jours (perte de progression tolérable), RTO 4 heures.

### E. Runbook : « le site ne charge plus »

```markdown
# Runbook : le site ne charge plus / les PDF ou la connexion ne marchent plus
Symptôme : alerte UptimeRobot ou sonde quotidienne, ou message d'un responsable.
Impact : responsables privés de la bibliothèque et/ou de la révision.
Tableaux de bord : Cloudflare (Workers & Pages > xam-xam-bey > Deployments) ; Supabase (Project > Usage, Logs, Auth) ; GitHub Actions (sonde).
Diagnostic rapide, dans l'ordre :
 1. Ouvrir l'URL de prod en navigation privée sur mobile. Page blanche ou erreur Cloudflare ? Voir www.cloudflarestatus.com.
 2. La page s'affiche mais les PDF ne s'ouvrent pas ou la connexion échoue : Supabase en pause (bandeau « Paused » dans le tableau de bord),
    quota dépassé (onglet Usage), ou panne (status.supabase.com).
 3. Le problème a commencé juste après un déploiement ? Comparer l'heure avec la liste Deployments.
 4. Console du navigateur : « VITE_SUPABASE_URL manquant » = build sans variables (OPS-4) ; erreur CSP = en-têtes cassés.
 5. Le lien magique n'arrive pas : Auth > Logs (rate limit), état du SMTP Brevo, Redirect URLs (OPS-11).
Mitigation (sûre, réversible) :
 - Régression après un déploiement : rollback (section B.1), en moins d'une minute.
 - Projet en pause : Supabase > Restore project (quelques minutes), puis relancer la sonde à la main.
 - Quota d'egress : prévenir les responsables (WhatsApp), activer le repli PDF via Cloudflare (OPS-8).
 - Clé service role exposée : Supabase > API Keys, révoquer la clé secrète et en créer une nouvelle.
   Si c'est la clé JWT historique, faire tourner le JWT secret : la clé anon change aussi, il faut alors mettre à jour VITE_SUPABASE_ANON_KEY dans Cloudflare et redéployer.
Communication : message dans le groupe WhatsApp des responsables au début, puis à la résolution.
Escalade : mainteneur technique, puis admin Supabase (propriétaire de l'organisation), puis support communautaire (GitHub Discussions Supabase).
Après : 5 lignes de postmortem (cause, durée, action) en bas de ce fichier.
Dernière vérification du runbook : 2026-10-12 (non exercé).
```

## Ordre de mise en œuvre conseillé

1. OPS-1 (SMTP) et OPS-11 (Redirect URLs), avant toute ouverture aux responsables.
2. Choisir la cible unique (OPS-2), relier Pages à GitHub, retirer `--commit-dirty` (OPS-3), poser la CI (A).
3. Sonde, UptimeRobot (C), puis premier dump et premier test de restauration (D).
4. Exercice de rollback (B.6), garde-fou sur les variables de build (OPS-4), puis les mineurs.

## Journal d'exploitation

| Date | Exercice / incident | Durée | Remarque |
|---|---|---|---|
| | | | |
