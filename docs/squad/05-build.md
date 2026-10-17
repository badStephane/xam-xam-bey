# 05 : Build, lot 1

## SRE

Livré : `.github/workflows/ci.yml`, `.github/workflows/sonde.yml`, `package.json` (scripts), `docs/squad/06-ops.md`. Audit visé : points 1 (procédure), 8, 9, 18 (branchement CI).

- **CI** (`ci.yml`, push et PR sur `main`, `permissions: contents: read`, `concurrency` par ref, annulation des runs dépassés) :
  - job `app` : `npm ci`, `npm run typecheck`, `npm test`, `npm run build` avec `VITE_SUPABASE_URL=https://ci.invalid` et `VITE_SUPABASE_ANON_KEY=ci-anon-key` (contrat API §4), contrôle `dist/index.html` et `dist/_headers`, puis `python3 scripts/check_content.py`.
  - job `db` : `supabase/setup-cli@v1` (CLI figée en 2.109.1, la version locale), `supabase start` sans analytics, edge-runtime, functions, imgproxy, inbucket, meta, realtime, studio, vector ; `supabase test db` (lit `supabase/tests/`) ; `supabase stop` en fin.
  - `scripts/check_content.py` n'avait pas de chemin absolu (chemin relatif au script) : aucune modification. Il passe en local (11 zones, 0 erreur).
- **Sonde** (`sonde.yml`, chaque jour à 06:17 UTC + lancement manuel) : HTTP 200 et `id="root"` sur `SITE_URL` ; HTTP 200 sur `SUPABASE_URL/rest/v1/documents?select=id&limit=1` avec `apikey`. 3 essais par requête. Ce passage quotidien maintient aussi le projet Supabase actif. Secrets à créer : 06-ops.md §F.
- **package.json** : `--commit-dirty=true` retiré de `deploy:pages` (wrangler avertit de nouveau quand l'arbre de travail est modifié, sans bloquer) ; nouveau script `check` = typecheck + test + build.
- **Non supprimés** (en attente du choix de cible) : `netlify.toml`, `.netlify/`, `wrangler.jsonc`, `deploy:cloudflare`. Checklist de retrait : 06-ops.md §B8.
- **Limite** : dépôt privé gratuit, donc pas de protection de branche. Une CI rouge ne bloque pas le déploiement Pages. Parade : régler la commande de build Pages sur `npm run check` (06-ops.md §B3).
- **Vérifications faites** : YAML des 2 workflows parsé (Ruby Psych ; PyYAML et actionlint absents) ; `package.json` JSON valide. **Non exécutés** : les workflows sur GitHub, `supabase start` en local (aucun appel réseau autorisé).

## Front-end

Audit visé : points 2, 3, 4 et 8 (partie build). Revues : FE-2, FE-11, FE-13, FE-18 (partiel), QA-1, QA-2, QA-9, QA-11, QA-12.

**Hypothèses** : la RPC `save_progress` renvoie un tableau d'une ligne (`returns table`), et la lecture au chargement reste un `select` sur `progress` (le contrat ne couvre que l'écriture).

### Fichiers
- Nouveaux (logique pure, testée) : `src/lib/progressMerge.ts` (`mergeProgress`, `parseStoredProgress`, `progressEquals`), `src/lib/progressSync.ts` (copie locale `xxb.progress.v1.<user_id>`, `reconcileOnLoad`, `saveArgs`, `fromSaveResult`), `src/lib/keepalive.ts` (`withKeepalive`), `src/lib/clock.ts` (`dayChanged`, `nextNow`, `msUntilNextDay`), `src/lib/buildEnv.ts` (`assertBuildEnv`), avec leurs `*.test.ts`.
- Nouveau hook : `src/hooks/useNow.ts` (date renouvelée au passage de minuit, à `visibilitychange`, `pageshow` et `focus`, seulement si le jour change).
- Modifiés : `src/hooks/useRevision.ts` (RPC, copie locale, garde de séquence), `src/AppContext.tsx` (`useNow()` remplace `useMemo(() => new Date(), [])`), `src/lib/supabase.ts` (`global.fetch` = `withKeepalive`), `src/lib/constants.ts` (`KEPT_SESSIONS` 60 → 200, aligné sur le contrat), `vite.config.ts` (`loadEnv` + `assertBuildEnv` en mode `production`).

### Comportement
- Chaque note écrit la copie locale. Au chargement : fusion de la ligne serveur, de la copie locale et de l'état en mémoire du même utilisateur. Si la copie locale apporte du nouveau, un enregistrement est planifié.
- L'enregistrement appelle `supabase.rpc('save_progress', { p_cards, p_sessions, p_xp })` (au plus 200 séances, XP bornée à 10 000 000), puis adopte `mergeProgress(réponse, état en mémoire)`. Si le compte change pendant l'appel, la réponse est ignorée.
- `keepalive: true` seulement sur `POST .../rpc/save_progress` dont le corps fait au plus 60 000 octets : au-delà, le navigateur refuserait la requête (quota de 64 Kio).
- Garde de séquence : un `loadFor` dépassé (second chargement ou déconnexion) n'installe ni progression ni contenu. Un second `loadFor` pour le même utilisateur pendant un chargement est ignoré (doublon `init` / `SIGNED_IN`, FE-18).
- Les planches (`?demo`, `?frame`) n'écrivent rien, ni sur le serveur ni en local.

### Commandes et résultats
| Commande | Résultat |
|---|---|
| `npm run typecheck` | OK |
| `npm test` | 16 fichiers, 123 tests verts (dont 46 nouveaux) |
| `npm run test:coverage` (lignes) | `progressMerge` 100 % (branches 98,4), `progressSync` 100, `keepalive` 100, `clock` 100, `buildEnv` 100 ; `src/lib` global 88,4 |
| `VITE_SUPABASE_URL=https://ci.invalid VITE_SUPABASE_ANON_KEY=x npm run build` | vert. Attention : `dist/` contient maintenant ce build factice, il faut rebuilder avant tout envoi manuel |
| `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --mode production` | échec attendu (code 1) : « Build de production impossible : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY manquant(s) » |

Vite 5 n'a pas d'option CLI `--envDir`. Pour tester l'échec, j'ai passé des variables vides : `loadEnv` les fait primer sur `.env.local`, qui n'a été ni lu ni affiché. `env -u ...` seul ne suffit pas sur ce poste, parce que `.env.local` fournit les valeurs. En CI il n'y a pas de `.env.local`, donc c'est bien l'échec qui s'applique.

### Écarts et précisions sur le contrat
- Égalité de vues et d'échéance pour une carte : le départage se fait sur les éléments `[0]`, `[3]`, puis `[4]`. C'est équivalent au `v desc` de la migration du back.
- Séances d'un même jour : je départage sur le JSON à clés triées, le back sur l'ordre jsonb. Les deux ensembles ne diffèrent que si la coupure à 200 tombe au milieu d'un jour. Effet possible : un renvoi inutile, sans perte (RPC idempotente).
- `parseStoredProgress` ignore les séances qui n'ont pas `d`, `n`, `ok` numériques et `k`, `l` texte. Le serveur, lui, accepte tout objet.

### Hors périmètre (non fait)
- Tests du hook `useRevision` avec un client simulé et E2E Playwright (`page.clock` à minuit ; noter, fermer, rouvrir) : à faire avec le QA.
- Délai d'expiration du client (FE-5) et message d'échec visible (FE-15) : lot 2.

## Back-end

Audit visé : points 2, 5, 18, 25. Revues : BE-1, BE-2, BE-6, BE-7 (partiel), BE-A2, QA-6, QA-5 (retrait de fichier seulement).

### Fichiers
- `supabase/migrations/20261013090000_lot1.sql` (109 lignes, idempotente, rejouée deux fois sans erreur) : droits explicites (§0, voir écarts), `check` `progress_cards_size` (≤ 262 144 octets) et `progress_xp_max` (≤ 10 000 000), déclencheur `progress_touch` (`before insert or update`, réutilise `touch_updated_at`), RPC `save_progress` (security invoker, `search_path = ''`, exécution `authenticated` seulement, verrou `for update` sur la ligne), fonctions d'aide `is_card_progress` et `session_day`, politique `select` admin sur `storage.objects` (bucket `documents`).
- `supabase/tests/01_rls_test.sql` (29 assertions : les 12 de revue-qa §4 point 3, plus listage et suppression storage par un non-admin, lecture et suppression par l'admin) ; `supabase/tests/02_save_progress_test.sql` (26 assertions : fusion par vues puis échéance, union des séances triée sans doublon, plafond de 200, `xp = greatest`, idempotence, 10 refus `22023`, ligne de B intacte, anon refusé, `check` xp, `updated_at` serveur).
- `src/lib/adminApi.ts` : `removeOneFile()` ; `deleteDocument` et le nettoyage après échec d'insertion lèvent une erreur visible si `remove()` ne supprime pas exactement 1 objet. `src/lib/adminApi.test.ts` (5 tests, client simulé).
- `supabase/config.toml` (créé par `supabase init`) : ports 553xx (un autre projet local occupe les 543xx), studio, realtime, edge runtime et analytics coupés, seed désactivé, `[auth.email] enable_confirmations = true`, `secure_password_change = true`, `site_url` local en 5173.

### Commandes et résultats
| Commande | Résultat |
|---|---|
| `supabase test db` sans la migration lot 1 (rouge attendu) | FAIL : `save_progress` absente (26/26 en échec) ; RLS arrêté sur `permission denied for table progress` |
| `supabase test db` avec la migration sans la politique storage | FAIL : tests 28 et 29 (« admin lit le bucket », « remove() renvoie 1 objet ») : BE-1 reproduit |
| `supabase db reset --local` puis `supabase test db` | `01_rls_test.sql .. ok`, `02_save_progress_test.sql .. ok`, `All tests successful. Files=2, Tests=55`, `Result: PASS` |
| `npx vitest run src/lib/adminApi.test.ts` avant puis après correctif | 3 en échec, puis 5/5 verts |
| `npm test` | 16 fichiers, 123 tests verts (dont les 5 de `adminApi.test.ts`), relancé après le journal |
| `npm run typecheck` | OK |

### Écarts au contrat et constats
- **Droits implicites absents (constat majeur)** : sur la CLI 2.109.1, les tables créées par `postgres` dans `public` n'ont aucun `grant` pour `anon`/`authenticated`. `progress`, `cards`, `revision_content`, `admins` n'étaient donc lisibles par personne en local. La migration ajoute des `grant` explicites conformes à l'intention des migrations existantes (la RLS reste le contrôle). En prod, à vérifier : si le projet a été créé avec cette règle, la révision ne fonctionne pas aujourd'hui.
- Hors lettre du contrat : `is_card_progress(jsonb)` et `session_day(jsonb)` sont exposées en RPC à `authenticated` (fonctions pures, sans accès aux données) ; une séance dont `d` n'est pas un nombre est triée en tête et coupée en premier.
- Si la fusion dépasse 256 Kio alors que chaque entrée est valide, l'erreur est `23514` (contrainte de table), pas `22023`.
- BE-7 : `config.toml` ne permet pas de couper le mot de passe sans couper l'inscription par lien magique (`[auth.email] enable_signup` couvre les deux). Avec `enable_confirmations = true`, un `signUp` par mot de passe ne confirme plus l'adresse, ce qui neutralise le scénario. Réglages du projet distant non touchés.
- `storage.protect_delete` bloque tout `delete` SQL direct sur `storage.objects` ; les tests posent `storage.allow_delete_query`, comme le fait l'API Storage.

### Corrections après validation QA (L1-1 à L1-3)
- **L1-2** : contrainte `progress_sessions_size check (pg_column_size(sessions) <= 65536)` (idempotente). Même borne dans `save_progress` (`22023`). Tests ajoutés : refus d'un appel de plus de 64 Kio, `23514` sur une écriture directe.
- **L1-3** : la fonction `json_num(jsonb)` remplace `session_day` et les casts `::numeric`. Une entrée héritée non numérique est classée en `null` (dernière pour les cartes, première pour les séances) au lieu de lever `22P02`. Le `todo` de `03_save_progress_cases_test.sql` est maintenant un test normal.
- **L1-1** (décision PM) : à jour égal, l'ordre canonique est `n`, `ok` (numériques, `null` en tête), puis `k`, `l` (`collate "C"`), et enfin `s::text collate "C"` pour les objets porteurs de clés en plus. Il sert au tri final et, inversé, à la coupure aux 200 dernières. Un test vérifie que `n` 9 passe avant 10 et `k` « Z » avant « a ».
- Commandes : `supabase start`, puis `supabase db reset --local`, puis `supabase test db` : `Files=3, Tests=66, All tests successful, Result: PASS`. Rejeu de la migration via `psql -f` : code 0. `XXB_PARITY_DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres npx vitest run src/lib/progressParity.test.ts` : 6 sur 6 verts, dont les 2 cas L1-1 (le front avait déjà retiré les `it.fails`). `npm test` : 137 verts, 6 ignorés (la parité, sans base). `npm run typecheck` : code 0. Puis `db reset` et `supabase stop`.
- Ordre de test : je n'ai pas relancé de phase rouge pour ces trois tests. Sur l'ancienne migration, ils échouent par construction : appel de 128 Kio accepté, collation ICU qui place « a » avant « Z », `22P02`.

### Hors périmètre
- BE-5 (`.select('id')` sur les autres mutations admin), BE-3, BE-4 : lot 2.
- Vérification en staging qu'un PDF retiré renvoie 404 sur l'URL publique : à faire après `db push` par l'orchestrateur.

### Retouches de clôture (décisions PM)
- **Déconnexion** : la copie locale `xxb.progress.v1.<user_id>` est effacée après le dernier enregistrement si rien n'est en attente ni en cours (`canClearLocal`). Sinon elle est gardée et sera refusionnée à la prochaine connexion. Fonctions `canClearLocal` et `clearLocalProgress` dans `progressSync.ts`, testées.
- **Refus définitif de `save_progress`** (`22023` validation, `23514` contrainte de taille au-delà de 256 Kio) : `saveErrorKind` renvoie `rejected`. Il n'y a pas de nouvel essai automatique, donc plus de boucle toutes les 10 s. Le bandeau dit « Votre progression n'a pas pu être enregistrée en ligne. Elle reste gardée sur cet appareil. » et garde RÉESSAYER. Les autres erreurs (réseau, expiration) gardent les nouveaux essais. `Revision.saveErr` passe de `boolean` à `'retry' | 'rejected' | null` ; seul `RevisionArea.tsx` le lisait.
- **Admin, retrait d'un document** : `runThenReload` (`src/lib/adminFlow.ts`, testé) recharge le catalogue même si `deleteDocument` lève une erreur après la suppression de la ligne. Le document disparaît de la liste et l'erreur s'affiche au-dessus de la liste (`role="alert"`), puisque la ligne du document n'existe plus. Le bouton de confirmation est désactivé pendant le retrait. `adminApi.ts` n'a pas été touché.
- Vérifications : `npm run typecheck` OK ; `npm test` 17 fichiers, 131 tests verts ; couverture en lignes : `adminFlow` 100 %, `progressSync` 100 %, `progressMerge` 100 % ; build avec `https://ci.invalid` / `ci-anon-key` vert (`dist/` contient donc ce build factice).
- Microcopie du bandeau `rejected` à valider par le Design.
- **Correctif après QA (L1-9, L1-11)** : le job `db` installe Node (`.node-version`) et lance `npm ci`, puis `npx vitest run src/lib/progressParity.test.ts` avec `XXB_PARITY_DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres`, qui pointe sur la base locale jetable, port `[db]` de config.toml. Le `psql` utilisé est celui du runner. Nouvelle section 06-ops.md §H « Mise en production du lot 1 » : étapes H0 à H11, avec pour chacune la conduite à tenir en cas d'échec.

### Corrections après la validation QA (07-qa.md)
- **L1-1** : à jour égal, `progressMerge.ts` départage les séances sur `n` puis `ok` (en nombres), puis `k` puis `l` (comparaison simple `<`, sans `localeCompare`). Cet ordre sert au tri comme à la coupure aux 200 dernières. Le JSON à clés triées ne sert plus qu'à départager des séances identiques sur ces 5 champs mais qui ont un champ en plus ; le SQL devra en faire autant ou s'en passer. Les deux `it.fails` de `progressParity.test.ts` sont devenus des `it` : non exécutés ici (pas de `XXB_PARITY_DB_URL`), à rejouer par le QA une fois la migration du back alignée.
- **L1-3** : `22P02` est classé en refus définitif, comme `22023` et `23514`.
- **L1-4** : `writeLocalProgress` lit la copie existante, la fusionne avec `mergeProgress`, puis écrit. `progressLocalTabs.test.ts` est passé de `it.fails` à `it` et il est vert.
- **L1-5** : `isAccountSwitch(owner, userId)` est testée. Sur `SIGNED_IN` d'un autre compte, le propriétaire courant est vidé et l'enregistrement en attente abandonné (`dropPendingSave`, déjà utilisé par `resetUser`) avant `loadFor`. Les notes de l'ancien compte restent dans sa copie locale.
- Vérifications : typecheck OK ; `npm test` : 18 fichiers verts, 1 ignoré (parité SQL) ; 137 tests verts, 6 ignorés ; `progressMerge` et `progressSync` à 100 % en lignes et en branches ; build avec les valeurs factices vert.
- Reporté au lot 2 (accepté par le PM) : tests du hook avec happy-dom, E2E.

## Lot 2 > SRE

Livré : `.github/workflows/ci.yml`, `.github/workflows/sonde.yml`, `scripts/deploy-pages.sh` (nouveau), `package.json` (scripts), `README.md`, `docs/squad/06-ops.md`. Supprimés : `netlify.toml`, `.netlify/state.json`, `wrangler.jsonc`.

- **Actions** (versions lues le 2026-10-13 par `gh api repos/<owner>/<repo>/releases/latest`, `runs.using` lu dans `action.yml` au tag) :
  | Action | Avant | Après | Release | Runtime |
  |---|---|---|---|---|
  | actions/checkout | v4 | v7 | v7.0.1 | node24 |
  | actions/setup-node | v4 | v7 | v7.1.0 | node24 |
  | actions/setup-python | v5 | v7 | v7.0.0 | node24 |
  | supabase/setup-cli | v1 | v3 | v3.0.1 | composite (Node du job, sinon setup-node 24 interne) |
  Notes des majeures relues : rien d'utilisé par nos workflows n'est retiré (`node-version-file`, `cache: npm`, `python-version`, `version`).
- **setup-cli v3** installe la CLI depuis npm avec le Node déjà présent : dans le job `db`, `setup-node` passe donc avant `setup-cli`. CLI gardée en **2.109.1** (version des postes ; `npm view supabase@2.109.1` la trouve). La 2.120.0 existe : à monter en même temps que les postes, hors lot.
- **Runners** : `runs-on: ubuntu-24.04` sur les 3 jobs (`app`, `db`, `sonde`), plus de bascule silencieuse vers Ubuntu 26 le 2026-10-19.
- **Cible unique** : `wrangler.jsonc` **supprimé** plutôt que converti. Le projet Pages est en envoi direct, statique, sans Functions ni bindings : `pages deploy dist --project-name` porte déjà tout, et `compatibility_date` ne sert qu'aux Functions. Un fichier Pages deviendrait aussi la source de vérité des réglages du projet, ce qui fait une chose de plus à maintenir. Script `deploy:cloudflare` (Workers) retiré.
- **Garde-fou** : `deploy:pages` = `sh scripts/deploy-pages.sh`. Il refuse de partir hors de `main`, avec des modifications non commitées (fichiers suivis ou non ignorés), si `main` diffère de `origin/main` ou si `.env.local` est absent. Ensuite il lance `npm run check` puis `wrangler@4 pages deploy`. Le dépôt propre fait disparaître l'avertissement « uncommitted changes ».
- **06-ops** : H1 mise à jour (cible choisie) ; §B réécrite (envoi direct, pourquoi on ne relie pas Git, comment migrer) ; C1 retour arrière Pages seul ; A4 à 20/h ; A5 redirections optionnelles (localhost, aperçus) ; A7 modèle d'e-mail `{{ .Token }}` (Magic Link **et** Confirm signup), avec un emplacement pour le texte de Front A ; §I mise en production du lot 2 (I0 à I9). 194 lignes.
- **Vérifications faites** :
  - YAML des 2 workflows parsé (Ruby Psych) : jobs, `runs-on` et `uses` relus. actionlint est absent.
  - `package.json` reste du JSON valide. `sh -n` passe sur le script.
  - Garde-fou testé dans un dépôt jetable (remote nu local, `npm` et `npx` remplacés par des leurres) : refus avec code 1 pour autre branche, fichier non suivi, fichier modifié, commit non poussé et `.env.local` absent ; le cas nominal appelle `npm run check` puis `npx wrangler@4 pages deploy dist --project-name xam-xam-bey --branch main`.
- **Non exécutés** : les workflows sur GitHub (preuve attendue = CI verte de la PR, sans avertissement Node 20) ; aucun déploiement ; aucun réglage Supabase (A4, A7 et I sont des actions utilisateur).
- **Tour 2 (après QA)** : E2E Playwright ajouté au job `db` (nommé « db + e2e », 20 min) plutôt qu'à un job à part : une seule `supabase start` et un seul `npm ci` par exécution (dépôt privé, minutes gratuites facturées par job). `inbucket` (Mailpit) n'est plus exclu ; `npx playwright install --with-deps chromium` ; `npm run e2e -- --reporter=list,html` ; en échec, `actions/upload-artifact@v7` (v7.0.2, node24) envoie `playwright-report/` et `test-results/`, 7 jours. Vérifié : YAML parsé (Ruby Psych), `--reporter=list,html` accepté (`--list`, 8 tests), modèles locaux identiques au texte ci-dessous (`diff`), pile locale en marche chargée avec ces modèles (sujets et `OTP_LENGTH=6` lus dans le conteneur auth). `supabase/config.toml` et `supabase/templates/*.html` doivent être commités ensemble. 06-ops A7 : faisable avant le lot 2, I0 n'en dépend plus.

## Lot 2 > Front B

Hypothèse : D2 vaut aussi pour « Hésitant » (hors calendrier, niveau et échéance ne bougent pas). D2 ne parle que de « Su », mais sans cette règle un « Hésitant » hors échéance repousserait l'échéance (jusqu'à +60 j).

Fichiers : `src/lib/{srs,practice,progressMerge,adminApi,adminFlow}.ts`, nouveaux `src/lib/cardEditor.ts` et `src/lib/draftGuard.ts`, `src/components/admin/CardsAdmin.tsx`, `src/components/revision/Session.tsx`, tests associés, `src/lib/progressParity.test.ts`.

Méthode : tests écrits d'abord, puis lancés sur l'ancien code : **19 échecs** (QA-3, QA-4, QA-9, L1-13, BE-5, FE-4). Ils passent tous après correction.

| Point | Correction | Preuve |
|---|---|---|
| 17 / D2 | `applyGrade` : carte nouvelle ou due (`échéance ≤ aujourd'hui`) : règle habituelle. Sinon : vues, réussites et XP comptent, niveau et échéance ne bougent pas. « Raté » remet toujours au niveau 0, J+1. Signature inchangée, donc `AppContext` et `useRevision` restent tels quels. | `srs.test.ts` : « 5 Su le même jour ne donnent qu'un seul niveau » (`[1, T+1, 5, 5, T]`, 50 XP) ; hors calendrier ; Raté hors calendrier ; carte due ; enchaînement à chaque échéance J+1, 3, 7, 21, 60. |
| D3 | `isGap = vues > réussites && niveau ≤ GAP_MAX_LEVEL`. `GAP_RATE` est retiré (il ne sert plus). Le taux sert seulement au tri. | `practice.test.ts` : « une carte réussie du premier coup n'est pas une lacune » (`[1,_,1,1,_]`) ; niveau 3 à 40 % : pas une lacune. |
| QA-9 | `readProgress` délègue à `parseStoredProgress` (progressMerge), sans dupliquer la validation. | `srs.test.ts` : « entrée corrompue ignorée » (`[3,T,null,null,T]` disparaît, la note suivante repart de `[1,T+1,1,1,T]`) ; séances invalides filtrées ; `null` donne une progression vide. |
| L1-13 | `compareUtf8` (points de code, identique à l'ordre des octets UTF-8, donc à `collate "C"`) remplace `cmpText` pour `k`, `l` et la clé JSON de départage. | `progressMerge.test.ts` : emoji U+1F600 > U+FF01, et ordre des séances fusionnées. |
| Parité | Le test compare désormais **l'ordre complet** des séances sur **tous** les cas (avant : 2 cas fixes). Nouveau cas fixe emoji/U+FF01 ; les libellés aléatoires incluent ces 2 caractères. Le commentaire `.fails` (anciennes lignes 108 à 110) est remplacé. | Base locale avec les migrations jusqu'à `20261014090000_lot2` : **5/5 verts, 307 cas**. Mutant (retour à `<` UTF-16) : le test « ordre complet » échoue sur le cas emoji. |
| 11 / FE-4 | `createRequestCounter` + `runLatest` (`adminFlow.ts`) : une réponse, ou une erreur, de zone dépassée est ignorée. Au démontage, `invalidate()`. La liste est vidée au changement de zone. | `adminFlow.test.ts` : « une réponse de zone dépassée est ignorée » (zone 2 répond avant zone 1, seule zone 2 s'affiche) ; erreur dépassée ignorée ; démontage. |
| 11 / FE-4 | `EditorState.zone` vient de `r.zone` (`editorFromRow`), et `saveCard` envoie `st.zone`. Le titre et la liste des documents de l'éditeur suivent aussi la zone de la ligne. | `cardEditor.test.ts` : « la zone vient de la ligne éditée ». |
| 11 / UX-5 | Changement de zone ou « Annuler » avec une saisie modifiée : encart `role="alertdialog"` « Abandonner cette question ? Les modifications seront perdues. », boutons [Continuer l'écriture] (focus) et [Abandonner]. Sans modification, on part sans question. Fermeture de l'onglet du navigateur : `beforeunload`. Changement d'onglet Admin : garde `draftGuard.confirmLeaveDraft()`, à brancher par Front A (voir ci-dessous). | `cardEditor.test.ts` (`isEditorDirty`), `draftGuard.test.ts`. Rendu non testé : pas de tests de composants (QA, L1-8). |
| 11 / BE-5, QA-5 | `.select('id')` sur `updateDocument`, `deleteDocument`, `setCardStatus` et `deleteCard`. `saveCard` en mise à jour : `.select(colonnes)` sans `.single()`. Si 0 ligne est touchée, erreur « Action refusée ou élément introuvable : rien n'a été modifié… », affichée par les `role="alert"` existants. `PGRST116` reçoit le même message. `deleteDocument` ne touche plus au fichier si la ligne n'a pas été retirée. | `adminApi.test.ts` : 4 tests « 0 ligne touchée lève une erreur », un par fonction. |
| FE-12 | `Session.tsx` : `useRef` et `useEffect` sont appelés avant `if (!s) return null`. Leurs dépendances sont dérivées de `s?.i` et de `s.rev && mode !== 'ask'`. | `typecheck` ; lecture. |

Vérifications (2026-10-13, dépôt partagé en cours de modification) :
- `npx vitest run` : **24 fichiers verts, 1 ignoré ; 193 tests verts**. Couverture : `progressMerge`, `adminFlow`, `cardEditor`, `session` à 100 % ; `srs` et `practice` à 100 % des lignes ; `adminApi` à 80,6 %.
- `npm run typecheck` et `npm run build` : 1 erreur restante, dans `src/lib/fetchTimeout.test.ts:25` (Front A, en cours). Aucune erreur dans les fichiers Front B. Sans `tsc`, `vite build` (variables factices, sortie hors dépôt) est vert.

Hors périmètre : la confirmation au changement d'onglet Admin et dans la barre du bas demande un appel dans `Admin.tsx` et `App.tsx` (Front A) ; les puces de zone ne sont pas désactivées pendant l'édition (la confirmation suffit).

## Lot 2 > Front A

Hypothèses : le projet Supabase envoie un code à 6 chiffres (`otp_length = 6`, réglage Back du point 19) ; aucun essai sur un vrai Android ni en navigateur dans cet environnement (preuves par tests unitaires, typecheck et build).

| Point | Fait | Preuve |
|---|---|---|
| 6 / D4 | Écran « Lien envoyé » : champ « Code à 6 chiffres » (`inputmode=numeric`, `autocomplete=one-time-code`) qui appelle `verifyOtp({ email, token, type: 'email' })` ; « Renvoyer dans N s » puis « Renvoyer le lien » ; « Modifier l'adresse » (adresse gardée, focus dessus) ; erreurs traduites (`role=alert`), renvoi annoncé (`role=status`). | `src/lib/signin.test.ts` (8 tests : minuteur 60 s, code, messages 429/réseau/code expiré) |
| 7 | `go()` pousse `#écran` (`#apercu/12`) ; `popstate` ramène l'écran ; RETOUR vers l'écran précédent = `history.back()` (pile propre) ; sortie de séance = entrée remplacée ; retour en pleine séance = fin de séance comme QUITTER (bilan en mode « faire réciter »), jamais hors du site ; jetons du lien magique jamais effacés par le site. Admin : retour refusé si brouillon non confirmé (`confirmLeaveDraft`), entrée remise. | `src/lib/navHistory.test.ts` (13 tests) ; `src/hooks/useNavHistory.ts` |
| 12 | Clés `xxb.catalog.v1`, `xxb.seen.v1`, `xxb.theme.v1` validées (liste entière refusée si une ligne est invalide, réponse réseau comprise) ; anciennes clés relues une fois puis effacées ; repli sur le catalogue intégré. `ErrorBoundary` racine : « Cette page n'a pas pu s'afficher » + « Recharger » qui purge les caches `xxb.*` sauf `xxb.progress.*`. | `src/lib/cache.test.ts` (8 tests, dont le catalogue intégré valide) |
| 13 | `withTimeout` (15 s, repli sans `AbortSignal.timeout`, signal de l'appelant conservé, stockage exclu pour les envois de 50 Mo) dans le `fetch` du client. `rev.retry()` marche aussi pendant le chargement (jeton de chargement abandonné). `LoadingGate` : « Réessayer » après 6 s. | `src/lib/fetchTimeout.test.ts` (5 tests) |
| 14 / D5 | Bandeau : « Le réseau est coupé. Les documents s'ouvriront dès son retour. Téléchargez à l'avance ceux dont vous aurez besoin. » Plus de pièces grisées selon « consultée » (FE-6). Écran indisponible : « La liste de la bibliothèque reste consultable. » | relecture `Library.tsx`, `DocCard.tsx`, `Gate.tsx` |
| 15 | Sous 760 px, connecté : bouton « Mon compte » (44 px, `aria-expanded`) à la place du compteur ; panneau avec l'adresse en clair, le compteur, « Espace admin » (admins) et « Se déconnecter ». | `Shell.tsx` ; largeur de l'en-tête à 360 px : 36 + 125 + 44 + 44 + 3 × 8 ≈ 273 px sur 328 |
| 16 | `--focus` : encre dans `.sheet`, `.qcard`, `.gate-card`, `.month.cur` ; papier sur `.panel-h`. Liens des fiches en `--green` soulignés ; aperçu en échec : bouton-lien « Ouvrir le PDF ». | Ratios WCAG calculés ci-dessous |
| UX-9 | Admin : « Vérification de vos droits… » tant que la session ou `is_admin` sont inconnus ; refus avec « Retour à la bibliothèque » ; Réseau absent : écran indisponible. Onglets Documents/Questions protégés par `confirmLeaveDraft`. | `useAdminCheck` dans `AppContext.tsx` |

Ratios (formule WCAG 2.x) : anneau ambre sur crème sombre 1,70:1 (avant) ; encre sur crème sombre **16,19:1**, sur crème clair **17,21:1** ; papier sur encre **17,21:1**. Lien acide sur crème 1,15:1 (avant) ; vert sur crème sombre **7,20:1**, sur crème clair **7,65:1** ; ambre clair sur crème clair 6,12:1 (déjà conforme).

Commandes (2026-10-13) : `npm run typecheck` code 0 ; `npx vitest run` 24 fichiers verts, 1 ignoré, 194 tests verts (34 nouveaux) ; `VITE_SUPABASE_URL=https://ci.invalid VITE_SUPABASE_ANON_KEY=ci-anon-key npm run build` vert, `index` 103,6 Ko gzip (+0,4 Ko).

**Tour 2 (QA L2-1, L2-2)** : écran « Lien envoyé » sans la promesse sur l'autre navigateur (« saisissez ici le code, ou touchez le lien ; si le lien a été touché, il a utilisé le code : demandez-en un nouveau avec Renvoyer »), échec du code + « Ce code a peut-être déjà servi par le lien : demandez-en un nouveau. » ; `onPopState` efface les jetons (`access_token`, `refresh_token`, `error_description`) par `replaceState` puis `history.back()` saute l'entrée morte (`hasAuthFragment`) ; `test.fail` retiré de `e2e/magic-link.spec.ts` ; `src/hooks` dans `coverage.include` et `src/hooks/useNavHistory.test.ts` (8 tests, happy-dom, useNavHistory 100 % des lignes). Preuves : typecheck 0 ; vitest 227 verts, 5 ignorés ; build factice vert, `index` 103,7 Ko gzip ; E2E local 8/8 (un échec isolé de `signin-code` « adresse neuve » à la première passe, juste après `supabase start`, vert 3 fois seul puis 8/8 en suite complète).

### Action utilisateur : modèles d'e-mail Supabase (Authentication > Email Templates)

Une adresse nouvelle reçoit « Confirm signup », une adresse connue « Magic Link ». Les deux portent un code accepté par `verifyOtp` de type `email` (GoTrue vérifie le jeton de confirmation comme celui du lien). Coller les deux modèles.

**Magic Link.** Sujet : `Votre connexion à Xam Xam Bëy : code {{ .Token }}`. Corps :
```html
<h2>Connexion à Xam Xam Bëy</h2>
<p>Votre code de connexion : <strong style="font-size:24px;letter-spacing:4px">{{ .Token }}</strong></p>
<p>Saisissez ce code dans l'application, <strong>ou</strong> touchez le lien ci-dessous. Pas les deux : le lien utilise le code.</p>
<p><a href="{{ .ConfirmationURL }}">Me connecter à la révision</a></p>
<p>Le code et le lien expirent dans une heure. Si vous n'avez rien demandé, ignorez cet e-mail.</p>
```
**Confirm signup.** Sujet : `Bienvenue sur Xam Xam Bëy : code {{ .Token }}`. Corps : identique, avec le titre `<h2>Bienvenue sur Xam Xam Bëy</h2>` et le lien `<a href="{{ .ConfirmationURL }}">Confirmer mon adresse et me connecter</a>`.

### Hors périmètre et écarts
- `RevisionArea.tsx` (Front B) affiche encore son propre `<p>` de chargement : remplacer ce `<p>` par `<LoadingGate />` (export de `Gate.tsx`) pour que « Réessayer » apparaisse pendant le chargement. Sans ce branchement, l'expiration à 15 s mène quand même à l'écran indisponible et à son bouton.
- ADMIN quitte l'en-tête mobile pour le panneau compte (place à 360 px).
- Non faits : titre de page et focus du `h1` à chaque écran (UX-13), confirmation en ligne avant de quitter une séance (UX-14, `Session.tsx`), test du hook d'historique avec happy-dom (QA, L1-8).
- `public/_headers` : commentaire Netlify retiré (demande de l'orchestrateur).

## Lot 2 > Back

Livré : `supabase/migrations/20261014090000_lot2.sql` (97 lignes), `supabase/tests/04_lot2_test.sql` (26 tests), `supabase/tests/01_rls_test.sql` (1 ligne devenue test, plan 29 → 30), `supabase/config.toml`, `scripts/content_sql.py`, `scripts/library_sql.py` (docstring), `docs/squad/decisions.md` (ADR-1).

- **D6** : `save_progress` en `security definer`, `search_path = ''`, ligne ciblée par `auth.uid()` seul, `42501` si nul. `insert`, `update`, `delete` retirés à `authenticated` sur `progress` et politiques d'écriture supprimées (double verrou) ; `select` et sa politique gardés. Le front du lot 1 en ligne n'écrit que par la RPC : compatible.
- **Durcissement constaté en local** : `truncate` (ignore la RLS), `references`, `trigger` étaient accordés à `anon` et `authenticated` sur toutes les tables de `public`. Retirés. PostgREST ne les expose pas : risque faible, à vérifier en production.
- **L2-3 (tour 2)** : `maintain` (Postgres 17 : VACUUM, ANALYZE, LOCK TABLE) retiré aussi, dans un bloc `do` qui teste `server_version_num >= 170000` (sans erreur avant 17). Tables futures : `alter default privileges for role postgres in schema public revoke truncate, references, trigger` (et `maintain` si 17) `on tables from anon, authenticated`. `postgres` est le bon rôle : il possède les 5 tables de `public` (lu dans `pg_class`) et c'est lui qui exécute `db reset` et `db push`. Bloc rejoué deux fois de suite : aucune erreur, mêmes ACL (idempotent). Hors périmètre : les privilèges par défaut de `supabase_admin` (tables créées par la plateforme, pas par nos migrations) et ceux de `service_role` sont inchangés. Production : le CLI a mis en cache `17.11.0.003` (`supabase/.temp/postgres-version`), à confirmer par `select version()` (06-ops, I4b).
- **L1-12** : après la règle des 200 dernières, la RPC retire les plus anciennes tant que `pg_column_size(sessions) > 65536`. Plus de `23514`. Preuve du rouge : la même migration sans la boucle lève `23514 progress_sessions_size` sur le scénario du test.
- **D1** : cartes en `on conflict (id) do nothing` ; en plus, une carte dont l'id figure déjà dans une migration est ignorée (sinon une carte supprimée par l'admin reviendrait publiée). Vérifié : les 665 cartes de `data/seed/` sont déjà publiées, 0 regénérée ; une carte ajoutée `t1-999` sort seule, position 61 ; dans une transaction annulée, `t1-01` corrigée par l'admin reste corrigée et `t1-999` est insérée. `library_sql.py` était déjà en `do nothing` (documents, transfert des cartes).
- **Point 19** : `site_url`, redirections sans joker de domaine, confirmation active, OTP 6. Lu dans le conteneur : `GOTRUE_SITE_URL=https://xam-xam-bey.pages.dev`, `GOTRUE_URI_ALLOW_LIST=https://xam-xam-bey.pages.dev/**,http://localhost:5173/**`, `GOTRUE_MAILER_AUTOCONFIRM=false`, `GOTRUE_MAILER_OTP_LENGTH=6`. **Mot de passe non désactivable** : la CLI 2.109.1 refuse la clé (`'auth.email' has invalid keys: enable_password`). Preuve que la confirmation suffit pour BE-7 : `signup` par mot de passe en local → 200, `email_confirmed_at` nul, connexion → `email_not_confirmed`.

### Commandes et résultats (2026-10-13, pile locale 553xx)
```
supabase db reset --local      -> Applying migration 20261014090000_lot2.sql... Finished
supabase test db               -> 01 ok ; 02 ok ; 03 ok ; 04 ok ; Files=4, Tests=89, Result: PASS (66 + 1 + 22)
tour 2 (L2-3), même pile      -> 04 avant correctif : 3/26 en échec (tables existantes : m ; défauts et table sonde : D x t m)
                                 après db reset --local : Files=4, Tests=93, Result: PASS (4 de plus dans 04) ; parité 5 passed (5)
parité (XXB_PARITY_DB_URL=...55322) -> progressParity 5 passed (5)   (fichier modifié par Front B pendant le lot)
retour arrière (transaction annulée) -> rpc 5 ; update direct 7 ; prosecdef f ; après rollback : prosecdef t, 1 politique
```
Note poste : `supabase start` restait bloqué sur `security find-generic-password` (trousseau macOS, projet lié). Contourné en écartant `supabase/.temp/project-ref` le temps de la commande, puis restauré.

### Parité SQL / TS (pour Front B, `progressMerge.ts` inchangé)
La RPC peut renvoyer **moins** de séances que `mergeProgress` : seulement si l'union des 200 dernières dépasse 64 Kio (taille binaire `jsonb`, non calculable exactement en TS). Avec les libellés de l'application (200 séances ≈ 18 Ko), jamais atteint ; le test de parité n'y entre pas. Effet résiduel : une copie locale gonflée (compte qui forge ses appels) renvoie plus de 64 Kio et reçoit `22023`, refus définitif déjà traité. Aucune action requise ; pour fermer ce cas, `saveArgs` coupe aussi par taille.

### Retour arrière (SQL, en nouvelle migration, jamais dans l'éditeur)
```sql
alter function public.save_progress(jsonb, jsonb, integer) security invoker;
grant insert, update on public.progress to authenticated;
create policy "Création de sa progression" on public.progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Mise à jour de sa progression" on public.progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```
La coupe L1-12 et le retrait de `truncate`, `references`, `trigger`, `maintain` (tables existantes et privilèges par défaut) restent : ils ne font que réparer. S'il fallait quand même rendre ces droits (à éviter), en nouvelle migration :
```sql
grant truncate, references, trigger on all tables in schema public to anon, authenticated;
alter default privileges for role postgres in schema public grant truncate, references, trigger on tables to anon, authenticated;
-- Postgres 17 seulement :
grant maintain on all tables in schema public to anon, authenticated;
alter default privileges for role postgres in schema public grant maintain on tables to anon, authenticated;
```

### Réglages du tableau de bord à reporter (config.toml ne s'applique pas à la production)
Authentication, libellés à confirmer dans l'interface :
1. URL Configuration : Site URL `https://xam-xam-bey.pages.dev` ; Redirect URLs `https://xam-xam-bey.pages.dev/**` (et `http://localhost:5173/**` seulement pour tester en local contre la prod). Aucun joker de domaine.
2. Sign In / Providers > Email : Confirm email **activé** ; Secure email change **activé** ; Email OTP length **6** ; OTP expiry 3600 s.
3. Pas de réglage « mot de passe seul » : laisser Confirm email activé, c'est lui qui protège `is_admin()`.

## Import Excel des questions (admin)

**Hypothèses.** H1 (validée PM) : une ligne sans aucune colonne QCM est valide (`qcm = null`) ; l'application tire alors les propositions des autres cartes de la zone (comportement existant). H2 : une ligne en erreur liste toutes ses raisons, séparées par une espace. H3 : la clé de doublon ignore aussi la différence entre apostrophes `’` et `'` ; les accents comptent. H4 : la première ligne non vide de la feuille porte les en-têtes ; les colonnes inconnues sont ignorées.

**Parcours.** Questions > « Importer un fichier Excel » (ou « Télécharger le modèle »). Choix du .xlsx > aperçu (rien n'est écrit) : lignes valides et en erreur par zone, chaque ligne en erreur avec son numéro Excel et sa raison > « Importer N questions » ou « Annuler ». Succès : « N questions importées en brouillon dans les zones … » (`role="status"`) et rechargement de la liste. Échec : `role="alert"` + « Aucune question n'a été importée », l'aperçu reste et l'on peut réessayer.

**Choix.**
- Bibliothèque : `read-excel-file` 9.3.12 (épinglée), entrée `universal` (fflate + saxen, sans DOM) : même code en navigateur et sous Vitest. Maintenue (publication du 7 oct. 2026), `npm audit --omit=dev` : 0 vulnérabilité. Le paquet `xlsx` 0.18 est écarté (vulnérable, plus publié sur npm).
- Chargement à la demande sur deux niveaux : `CardsImport` en `React.lazy` (échec réseau : message dans le panneau, pas l'ErrorBoundary racine), puis `import('read-excel-file/universal')` au choix du premier fichier (`xlsxRead.ts`).
- Identifiants : générés côté client par `newCardId(zone)`, comme l'éditeur (la table n'a pas de défaut sur `id`) ; unicité vérifiée contre le lot et les cartes lues.
- Écriture : un seul `insert(...).select('id')` (tout ou rien en base), succès seulement si la base confirme exactement N lignes (`touchedRows` + contrôle du compte).
- Juste avant d'écrire, la base est relue : doublons et fin de zone à jour. Si les lignes retenues ont changé (autre admin), rien n'est inséré et l'aperçu est remplacé avec un avertissement.
- Lecture des questions existantes paginée par 1 000 (`max_rows` de `config.toml`), seulement pour les zones citées par le fichier.
- QCM (décision PM) : une seule règle, `readQcm` dans `cardRules.ts`, partagée par `checkCard` (éditeur) et l'import, et appuyée sur `validQcm` de `srs.ts` (exporté). Accepté : aucun QCM, ou une bonne proposition et 1 à 3 mauvaises. Refusé, avec un message précis : bonne sans mauvaise, mauvaises sans bonne, mauvaises toutes égales à la bonne, plus de 3 mauvaises. L'éditeur affiche « QCM facultatif » ; `saveCard` enregistre `qcm = null` sans QCM et retire les mauvaises vides.
- Modèle : fichier statique `public/modele-questions.xlsx`, produit par `scripts/make_import_xlsx.py` (zipfile + XML, sans dépendance, sortie déterministe). Plus simple que d'ajouter une bibliothèque d'écriture au navigateur pour un fichier qui ne change pas. Le même script produit les fixtures Vitest et E2E.

**Fichiers.** `src/lib/cardImport.ts` (logique pure), `src/lib/cardImportFlow.ts` (aperçu, validation finale, dépendances injectées), `src/lib/xlsxRead.ts` (import dynamique), `src/lib/adminApi.ts` (`listCardsForImport`, `insertImportedCards`), `src/lib/srs.ts` (export de `validQcm`), `src/components/admin/CardsImport.tsx`, `TemplateLink.tsx`, `CardsAdmin.tsx` (boutons, lazy, message de fin), `scripts/make_import_xlsx.py`, `public/modele-questions.xlsx`, fixtures `src/lib/__fixtures__/import-sample.xlsx` et `e2e/fixtures/import-e2e.xlsx`.

**Preuves.**
| Vérification | Résultat |
|---|---|
| `npm run typecheck` | OK |
| `npx vitest run` | 30 fichiers, 291 tests verts (5 ignorés, préexistants) ; import : `cardImport` 39, `cardImportFlow` 7, `adminImport` 8, `xlsxRead` 4 (vrai .xlsx, fichier texte, zip abîmé) ; règle QCM : `cardRules` (`readQcm` et `checkCard` assoupli) |
| Couverture | `cardImport.ts` 100 % lignes ; `xlsxRead.ts` 87,5 % (seul l'échec de chargement du chunk n'est pas couvert) |
| Build (variables factices) | OK ; `index.html` ne précharge que `index` et `client` |
| `npm audit --omit=dev` | 0 vulnérabilité |
| E2E Playwright, pile locale 553xx, viewport 360 px | `e2e/import-excel.spec.ts` 3/3 ; suite complète 11/11 |

Bundle (build de production, kB, brut / gzip) :
| Chunk | Avant | Après |
|---|---|---|
| `index` (initial) | 367,21 / 103,74 | 370,44 / 104,88 (+1,1 gzip : boutons, lien, accès base, règle QCM partagée) |
| `client` (initial) | 142,38 / 45,69 | inchangé |
| `CardsImport` (à l'ouverture de l'import) | n/a | 10,26 / 4,35 |
| `read-excel-file` (au choix d'un fichier) | n/a | 61,39 / 17,72 |

L'E2E vérifie : aucune requête `read-excel-file` avant le choix d'un fichier ; aperçu (3 valides, 2 en erreur : doublon ligne 4, zone « 0 » ligne 5) et focus sur son titre ; rien en base avant confirmation ; insertion en `draft` à `max + 1`, `max + 2` par zone, QCM présent seulement sur la ligne qui en a un ; liste rechargée ; l'éditeur réenregistre une question importée sans QCM (`qcm` reste `null`) ; second import du même fichier : « Aucune question à importer », doublons avec la base signalés ; `.csv`, `.xls` et zip abîmé : message clair ; POST refusé (403 RLS simulé) : alerte, aucun succès affiché, 0 ligne en base ; pas de débordement horizontal à 360 px. Données de test marquées `[E2E import]`, supprimées avant chaque test et à la fin. Droits admin posés par `docker exec supabase_db_xam-xam-bey psql` (pile du projet seulement, aucune clé).
Note poste : `supabase start` bloqué sur le trousseau ; `supabase/.temp/project-ref` écarté le temps du démarrage puis restauré (contenu identique vérifié par `cmp`) ; `supabase stop` en fin de session.

**Hors périmètre / limites.** Lot 3 (décision PM) : pas de lien automatique vers un document source à l'import ; `document_id` reste `null` et la colonne Source reste du texte libre. Le lien se fait à la main dans l'éditeur. Pas de contrôle de longueur des propositions à l'import (les avertissements de qualité restent dans l'éditeur). Pas de vérification axe automatisée (non installée) ; rôles, labels, focus et alertes vérifiés par l'E2E.

### Correctifs après la recette QA (docs/squad/10-qa-import.md)

| ID | Correctif | Preuve |
|---|---|---|
| IM-5 | CSP **inchangée**. `xlsxRead.ts` décompresse en synchrone (`unzipSync` de fflate, aucun Worker), puis repasse à read-excel-file une archive « stockée » (niveau 0), que fflate lit toujours sans Worker. Délai global de 30 s (`withTimeout`), avec un message clair. fflate 0.8.3 est déclaré en dépendance directe (la même version que celle de read-excel-file, dédupliquée). | `qa-import-csp` vert sans `test.fail()` ; Vitest : gros classeur de 900 lignes lu, délai |
| IM-1 | Le contrôle des doublons `norm` est dans `readQcm`, qui reste la règle unique de l'éditeur, de l'import et de la publication. « Publier » dans la liste appelle `publishError`, qui refuse un QCM stocké non conforme et affiche la raison. | 3 `test.fails` IM-1 passés en `test` ; E2E « Publier » refusé, la carte reste en brouillon |
| IM-6 | `buildChoices` : le QCM rédigé est gardé s'il lui reste au moins un leurre distinct. Sinon les leurres viennent de la zone, puis des autres zones s'il en manque. S'il n'y a aucun leurre, `SELF_CHECK` : la Session affiche « Voir la réponse », puis « Je savais » ou « Je ne savais pas ». Jamais de QCM à une seule proposition. | `qcm.test.ts` (+5 tests) ; E2E scout : 4 propositions en zone 12 |
| IM-3 | Une ligne vide dans les colonnes reconnues est ignorée : elle ne compte ni en erreur ni dans la limite. | `test.fails` IM-3 passé en `test` ; test des 1 000 lignes avec 5 lignes « inconnues » |
| IM-4 | `insertImportedCards` lève `UncertainWriteError` sur une réponse perdue, une erreur sans code, ou un nombre de lignes confirmé incohérent. Message affiché : « Résultat incertain : rechargez la liste pour vérifier avant de réimporter. » « Aucune question n'a été importée » ne s'affiche que sur un refus codé de la base. Fermer le panneau recharge la liste. | Vitest (2 tests) ; E2E POST interrompu |
| IM-7 | Modèle à deux feuilles : « Questions » ne contient que les en-têtes et c'est la seule lue ; « Exemple » n'est jamais importée. | Vitest : première feuille sans ligne, exemple valide |
| IM-8 | Avant toute décompression, les tailles du répertoire central sont additionnées (parties XML, 20 Mo au plus). Au-delà : message clair. | Vitest `declaredXmlSize`, refus `tooBig` |
| IM-9 | `<cellStyles>` (Normal) ajouté par le générateur ; le message des colonnes manquantes cite la première feuille. | Modèle régénéré, sortie déterministe |
| IM-2 | **Accepté (PM)** : moins de 5 admins, risque faible. Deux imports simultanés du même fichier peuvent créer un doublon et une position ex aequo. Le `test.fails` QA reste en place. | n/a |

Vérifications : `npm run typecheck` OK ; `npx vitest run` 31 fichiers, 325 tests verts (5 ignorés, déjà présents avant) ; build avec variables factices OK, `index.html` ne précharge que `index` et `client` ; `npm audit --omit=dev` 0 vulnérabilité ; `npm run e2e` 19/19 (specs QA comprises), 0 ligne de test restante en base.
Bundle (gzip) : `index` initial 105,43 kB (contre 104,88 : bloc d'auto-évaluation, garde de publication) ; chargés à la demande : `CardsImport` 4,95, read-excel-file 14,15, fflate 12,33.
QA (constats remplacés) : dans `qaImport.test.ts`, le constat « Paris / paris » et le repli d'une carte seule décrivent maintenant le comportement corrigé. Dans `qa-import-scout.spec.ts`, le constat IM-6 (1 proposition) devient « 4 propositions ».

## Lot 3 > SRE

Livré : `scripts/upload_documents.mjs`, `scripts/deploy-pages.sh`, `.github/workflows/sonde.yml`, `.github/workflows/ci.yml` (commentaire seul), `README.md`, `docs/squad/06-ops.md` (H5, E1 étape 3, sections J, K, L, M). `package.json` inchangé.

- **Audit 21** : le script lit `SUPABASE_SECRET_KEY` (préparée par `read -rs`), refuse de démarrer si elle manque (message avec la commande à taper), refuse une clé `sb_publishable_…` ou de format inconnu, refuse l'ancienne variable `SUPABASE_SERVICE_ROLE_KEY` seule, accepte une clé JWT historique avec un avertissement. La clé n'est jamais affichée. Une exception réseau par fichier ne coupe plus tout l'envoi. 06-ops J : clé `sb_secret_…` créée pour un envoi puis supprimée, rotation en urgence, contrôle de l'historique du shell.
- **Audit 20** : la sonde fait un `HEAD` quotidien sur un PDF (200 exigé, avertissement sans `max-age`). La consommation n'est pas lisible avec la clé anon ; la Management API demande un jeton `sbp_…` qui ouvre tout le compte, donc refusé. Relevé manuel chaque lundi pendant 8 semaines (06-ops K1, seuils 3,5 et 4,5 Go en projection). Repli K3 retenu : PDF dans le build Pages (~1 jour) ; R2 écarté (pas de domaine, `r2.dev` déconseillé en production, Worker d'envoi à écrire).
- **OPS-17** : `WRANGLER_VERSION="4.150.0"` dans `deploy-pages.sh` (dist-tag `latest` sur npm le 2026-10-13, publiée le jour même), appel `npx --yes "wrangler@$WRANGLER_VERSION"`. Pas en devDependency : seul ce script s'en sert, et `npm ci` en CI téléchargerait wrangler et workerd à chaque exécution ; le lockfile, partagé avec les fronts en parallèle, reste intact.
- **CLI Supabase en CI** : gardée en **2.109.1**. Notes 2.110 à 2.120 relues : `start`, `db test` et `db reset` passent sur le moteur TypeScript, défaut `auto_expose_new_tables` changé (2.116) alors que `04_lot2_test.sql` vérifie les privilèges par défaut, Mailpit isolé par pile (2.119) alors que l'E2E lit Mailpit. Montée à faire dans une PR dédiée, postes compris, après `supabase test db` et `npm run e2e` verts en local (interdit dans ce lot : pas de `supabase start`).
- **Vérifications faites** :
  - `upload_documents.mjs` : `node --check` passe. 4 refus testés (variable absente, ancienne variable, clé publishable, format inconnu), tous en code 1. Cas nominal lancé contre `https://ci.invalid` : 170 échecs « fetch failed », code 1, clé absente de la sortie. Aucun appel à Supabase.
  - `deploy-pages.sh` : `sh -n` passe. Dépôt jetable avec `npm` et `npx` remplacés par des leurres : appelle `npx --yes wrangler@4.150.0 pages deploy dist --project-name xam-xam-bey --branch main`. `npx --yes wrangler@4.150.0 --version` répond 4.150.0.
  - Sonde : YAML parsé (Ruby Psych), `bash -n` passe sur la nouvelle étape, encodage `@uri` vérifié.
  - Requêtes de 06-ops L : exécutées sur un Postgres 16 jetable, sans erreur, et les lignes attendues sortent.
- **Non exécutés** : la sonde sur GitHub (preuve = `Run workflow` vert après fusion) ; la requête L en production (action utilisateur) ; aucun déploiement.
- **Dépend de Front B** : 06-ops M cite sa procédure de désinscription du service worker (« Lot 3 > Front B ») ; `sw.js` doit être servi en `no-cache` (`public/_headers`).

## Lot 3 > Front admin

Hypothèses : H1, la colonne Source désigne **un** document (titre ou nom de fichier exact après normalisation) ; « Bases du scoutisme, p. 12 » ou deux documents cités ne relient rien. H2, l'extension retirée est `.pdf`, et aussi `.docx`/`.doc` (le document 4 de la base porte un nom en `.docx`). H3, aucune migration.

Livré : `src/lib/cardImportDocs.ts` (nouveau), `src/lib/xlsxUnzip.ts` (nouveau), `src/components/admin/ImportDocLinks.tsx` (nouveau), `cardImport.ts`, `cardImportFlow.ts`, `xlsxRead.ts`, `adminApi.ts`, `CardsImport.tsx`. Tests : `cardImportDocs.test.ts` (18), `xlsxUnzip.test.ts` (7), `adminImport.test.ts` (+2), `cardImport.test.ts` (attendu mis à jour : champ `doc`), E2E `e2e/import-docs.spec.ts` et `e2e/import-im10.spec.ts`.

| Point | Comportement | Preuve |
|---|---|---|
| E4 | Clé de correspondance : sans accents, minuscules, extension retirée, `_`, `-` et apostrophes valent une espace, espaces réduits. Comparée au titre **et** au nom de fichier des documents **de la zone de la ligne** (`listDocumentsForImport`, lu en parallèle des questions existantes). Un seul document : `document_id` rempli. Aucun : null, sans erreur. Plusieurs : null, et l'aperçu le dit (note + détail par ligne). La colonne Source affichée n'est pas modifiée. Les documents sont relus juste avant l'écriture : un lien qui change (document supprimé, renommé) renvoie un nouvel aperçu, rien n'est inséré. | Vitest 18 tests ; E2E : titre en casse et `.PDF`, nom `.docx` avec `'` au lieu de `_`, 2 homonymes, autre zone, sans source ; `document_id` vérifié en base (1, 4, null ×3) ; la liste admin affiche le document relié |
| Aperçu | Bloc « DOCUMENTS RELIÉS · n SUR m » : résumé (reliées, sans correspondance, ambiguës, sans source), puis « Détail par ligne » : « Ligne 4 · zone 01 : reliée à « … » » ou la raison du non-lien. Ouvert jusqu'à 50 lignes, replié au-delà (`<details>`, cible de 44 px). Placé sous le bouton « Importer » pour qu'il reste à portée. | E2E à 360 px, pas de débordement |
| IM-10 | Décompression **par flux** (`Unzip` + `UnzipInflate` de fflate, synchrones, aucun Worker, CSP inchangée). L'archive est poussée par morceaux de 8 Kio ; chaque octet produit est compté et la lecture s'arrête dès que la borne est dépassée (au plus ~8 Mo produits en plus). Toutes les 50 ms de travail, la main est rendue au navigateur. Message : « Classeur trop volumineux une fois décompressé (plus de 8 Mo)… ». Le contrôle IM-8 (taille annoncée) reste en première barrière. | Vitest : zip menteur (répertoire central et en-tête local à 2 000 octets, feuille de 64 Mo) refusé `tooBig` en moins d'1 s ; octets produits bornés ; pause appelée ; archives tronquée et corrompue `invalid`. E2E sous CPU ralenti 4× : refus affiché, **tâche la plus longue 128 ms**, 0 Worker, champ réactivé. Avant correctif (même menteur, code de `main`) : « Fichier illisible », lecture complète |
| Borne | `MAX_UNZIPPED_BYTES` passe de 20 à **8 Mo**. Raison : l'analyse XML de read-excel-file reste synchrone ; une feuille **honnête** de 18 Mo prenait 1,2 s sur un poste de bureau. 900 questions réalistes (réponses de 60 mots, QCM) font 1 Mo : la marge reste de 8×. | Mesure Node (script jetable, non versionné) |

Vérifications (2026-10-13) : `npm run typecheck` OK ; `npx vitest run` 39 fichiers, 429 verts (5 ignorés, déjà présents avant) ; build avec variables factices OK (`CardsImport` 16,01 / 6,50 kB gzip, chargé à la demande ; `index` 108,77 kB gzip, travail des autres rôles compris) ; `npm audit --omit=dev` 0 vulnérabilité ; E2E d'import sur la pile locale 553xx : 14/14 (`import-docs`, `import-im10`, `import-excel`, `qa-import`, `qa-import-csp`, `qa-import-scout`). Couverture : cardImportDocs 100 %, xlsxUnzip 100 % lignes, cardImport 100 %, cardImportFlow 100 %.

Hors périmètre : côté scouts, la carte n'affiche que le texte « SOURCE · … » ; aucun lien vers le PDF n'existe aujourd'hui (le type `Card` ne porte pas `document_id`). Besoin transmis à Front A (`useRevision.ts`, `revision/**`).

## Lot 3 > Front A

Hypothèses : la confirmation UX-14 vaut aussi pour « TERMINER » en interrogation (texte adapté) ; Fiches n'affiche aucune carte, donc le lien vers le document (E4) est posé dans la séance et dans le bilan (« À retravailler »), pas dans Fiches (question ouverte à l'orchestrateur).

### Fichiers
- `src/lib/session.ts` : `scoreCurrent` (note à la correction), `advance` (« Suivant » ne note rien), `isScored` (invariant : `hist.length === i + 1` si la carte affichée est notée) ; `answerCard` les compose.
- `src/lib/sessionStore.ts` (nouveau) : séance en `sessionStorage`, clé `xxb.session.v1.<user_id>`, validée à la lecture (compte, jour, cartes encore publiées, position, notes, propositions), effacée si invalide ou terminée.
- `src/lib/screenTitle.ts`, `src/hooks/useScreenA11y.ts` (nouveaux) : titre du document et focus sur le `h1` de l'écran à chaque changement (pas au premier affichage, jamais pendant une saisie).
- `src/AppContext.tsx` : `validate` note tout de suite (E1) ; séance gardée dans le même geste que la note ; reprise au chargement si l'adresse est `#session` (E2) ; `quitSession` / `cancelQuit` / `confirmQuit` (UX-14) ; `openCardDoc` et RETOUR du document vers la séance ou le bilan.
- `src/components/revision/Session.tsx` : confirmation en ligne « Quitter ? Vos réponses déjà données sont gardées. [CONTINUER] [QUITTER] » (aria-live, focus sur CONTINUER, retour du focus sur QUITTER) ; aide clavier réduite à « ÉCHAP : QUITTER » en auto-évaluation (IM-11).
- `src/components/revision/CardDocLink.tsx` (nouveau), `Fin.tsx` : lien « Ouvrir le document » ; la reprise des cartes à retravailler passe par `startSession` (propositions attribuées : avant, une reprise en « Je réponds » n'affichait aucune proposition).
- `src/lib/srs.ts`, `src/lib/types.ts` (accord de l'orchestrateur) : `Card.doc` lu depuis `document_id`, valeur nulle ou invalide ignorée.
- `src/hooks/useRevision.ts` : `userId` exposé (propriétaire des écritures).
- `src/styles/app.css` : jeton `--field-bd` (sombre `#5E7A6D` : 3,95:1 sur le fond, 4,08:1 sur le champ ; clair `#7A7262` : 3,90:1 et 4,49:1), appliqué au champ de recherche (audit 24, UX-8).
- E2E : `e2e/session-resume.spec.ts` (nouveau) ; `e2e/midnight-back.spec.ts` : un clic de confirmation ajouté après QUITTER.

### Règles tenues
- Une position de la file = une note, posée à la correction (QCM validé) ou à l'auto-notation (« Je savais » / « Je ne savais pas ») ; ni retour, ni rechargement, ni « Suivant » ne la rejouent. D2 et D3 inchangées (`applyGrade` intact).
- Retour Android en séance : inchangé (fin de séance comme QUITTER, sans confirmation). Une seule confirmation, jamais deux.
- Séance d'un compte jamais relue ni écrite pour un autre ; planches et démo : rien n'est gardé.

### Commandes et résultats (2026-10-13, pile locale 553xx)
- `npm run typecheck` : 0 erreur.
- `npx vitest run` : 438 réussis, 1 échec hors Front A (`xlsxUnzip.test.ts`, IM-10, travail en cours du Front admin).
- Build (variables factices) : OK, bundle initial 109,31 Ko gzip (tous rôles confondus, plafond 110).
- `npx playwright test e2e/session-resume.spec.ts e2e/midnight-back.spec.ts --repeat-each=2` : 11 réussis sur 12 ; l'échec isolé est « Le réseau ne répond pas » à l'envoi du lien (pile locale), vert au passage suivant (3 sur 3).

### Hors périmètre
- Planches : la démo « phase réponse » (`demo.ts`) garde l'ancienne forme (carte corrigée non notée) ; sans effet, rien n'y est enregistré.
- Le lien vers le document n'apparaît que si le document est dans le catalogue chargé.

## Lot 3 > Front B

Hypothèses : H1, le bucket public de production répond avec `Access-Control-Allow-Origin: *` comme la pile locale (vérifié en local seulement ; aucun appel distant permis). H2 (tranchée par le PM le 2026-10-13) : l'ouverture sur téléphone reste celle choisie par l'utilisateur (lecteur du téléphone, commit 40da947). En ligne : lecteur du téléphone. Hors ligne (navigateur hors ligne, ou base injoignable constatée) et PDF gardé : aperçu du site (pdf.js) lu depuis le cache. Hors ligne et PDF absent : message, aucun lien. Règle pure dans `src/lib/openMode.ts`. H3, aucune migration.

### Fichiers
- `src/sw/rules.ts` (logique pure : aiguillage, éviction, manifeste, version), `src/sw/sw.ts` (worker écrit à la main, ~170 lignes), `src/sw/buildSw.ts` (plugin Vite : manifeste et `dist/sw.js` compilé par esbuild, déjà livré avec Vite, aucune dépendance ajoutée), `src/sw/register.ts`, `src/hooks/useOfflineDocs.ts` ; tests `src/sw/rules.test.ts`, `src/sw/buildSw.test.ts`.
- `vite.config.ts` : plugin ajouté ; `siteDocs` écrit dans le dossier de sortie effectif (`--outDir`), plus jamais dans `dist/` d'office.
- `src/components/library/` : `Library.tsx`, `DocCard.tsx` (mémoïsée, sans contexte), `PdfViewer.tsx`, `LazyPdfViewer.tsx` (nouveau), `Apercu.tsx` et `PreviewPanel.tsx` (liens Télécharger et Plein écran masqués hors réseau), `library.css` (nouveau, hors `app.css`) ; `src/lib/openMode.ts` et son test (nouveaux).
- `src/lib/pdf.ts` (`loadPdf` annulable tout de suite ; `openPdf` garde sa forme pour l'admin), `src/lib/catalog.ts` (`filterDocs`), `src/main.tsx`, `index.html`, `planches.html`, `src/styles/fonts.css`, `src/assets/fonts/*.woff2`, `public/fonts/OFL-*.txt`, `public/_headers`.
- E2E : `e2e/offline.spec.ts` (5 tests, build de production servi par `vite preview` dans `node_modules/.cache/`, jamais `dist/`).

### Points livrés
| Point | Comportement | Preuve |
|---|---|---|
| E3 coquille | Préchargée à l'installation : `index.html`, script principal, styles, polices (7 fichiers, manifeste lu dans le `index.html` construit). Pages : réseau d'abord, `index.html` gardé si coupé ou plus lent que 3,5 s. Inscription après `load`, en production seulement (jamais en dev, donc jamais dans les autres E2E), jamais dans les cadres des planches. | E2E : rechargement hors réseau servi par le worker (`fromServiceWorker`) |
| E3 PDF | Bucket `documents` uniquement, requête `cors` (réponse lisible, taille connue ; une réponse opaque n'est jamais gardée). Cache d'abord. Plafond 150 Mo, plus anciens évincés, fichier plus gros que le plafond jamais gardé. Requêtes partielles, `?download=`, REST, Auth, Realtime, fonctions : jamais interceptés. Service worker actif : pdf.js télécharge le fichier en une requête (`disableRange`) pour qu'il puisse être gardé. Repère « HORS LIGNE » sur les fiches gardées. Le premier PDF gardé fait aussi garder le lecteur (pdf.js), que la page n'a jamais chargé si tout a été ouvert dans le lecteur du téléphone. | Vitest (aiguillage, éviction) ; E2E ordinateur : PDF ouvert, réseau coupé, rechargé, PDF relu depuis le worker |
| E3 téléphone | En ligne, « Ouvrir ↗ » ouvre le lecteur du téléphone comme avant et, en parallèle, la page demande au worker de garder le PDF (message `xxb-keep-pdf`, accepté pour le seul bucket public, dans le plafond de 150 Mo). **Choix du double téléchargement** : le lecteur du téléphone télécharge hors du site, le worker ne peut pas réutiliser ce fichier ; garder le PDF demande donc un second téléchargement. Il est évité si le PDF est déjà gardé, si l'économie de données est active (`saveData`) ou en 2G (`effectiveType`) ; en 3G et au-delà, il est accepté, seul moyen de tenir E3 sans changer le lecteur choisi. Sur les navigateurs sans ces indications (hors Chrome), il a toujours lieu. | Vitest (`openMode`, `shouldKeepOnOpen`, `keepRequestUrl`) ; E2E téléphone : ouvert en ligne dans le lecteur du téléphone (aucun aperçu intégré), réseau coupé, rechargé, rouvert : aperçu du site servi par le worker ; pièce jamais ouverte : message, aucun lien |
| E3 lien magique | Toute page dont l'adresse porte un paramètre hors de ceux de l'application (`code`, `token_hash`, `error`…) passe au réseau sans être touchée. | Vitest ; E2E : `/?screen=revision&code=…` hors réseau échoue (non servi par le worker) |
| E3 mise à jour | Nouvelle version active dès l'installation (`skipWaiting`, `clients.claim`), coquilles précédentes purgées ; fichiers hachés inchangés repris sans téléchargement ; fichiers disparus du build purgés ; si l'appareil garde des PDF, le lecteur (pdf.js) est préchargé à chaque version. `sw.js` en `no-cache` et `updateViaCache: 'none'`. | E2E : nouveau build servi à chaud, une seule coquille, PDF toujours lisible hors réseau |
| E3 bandeau | Worker actif : « Le réseau est coupé. Les documents déjà ouverts sur cet appareil restent lisibles : ils portent la mention HORS LIGNE. » Sans worker : ancien texte honnête. Pièce jamais ouverte, hors réseau : « Hors réseau : pas encore ouvert sur cet appareil » à la place du bouton. | E2E |
| E5 | Chakra Petch (600, 700) et JetBrains Mono (variable 400 à 800), woff2 latin, `font-display: swap`, police des titres préchargée. Bricolage Grotesque et Instrument Sans retombent sur `system-ui` (piles de `app.css` inchangées). Source : npm `@fontsource/chakra-petch` et `@fontsource-variable/jetbrains-mono` 5.3.0, licence OFL 1.1. **Poids total : 60,3 Ko** (9,9 + 10,0 + 40,4). CSP : Google Fonts retiré de `style-src`, `font-src 'self' data:`. | E2E sous la CSP de production : 0 violation, 0 requête Google Fonts, `document.fonts.check` vrai pour les 2 familles |
| Audit 22 | Tâche pdf.js annulable dès l'appel (`destroy()` au démontage et au changement de document, même pendant le chargement de pdf.js). Page hors de la marge de 800 px : rendu annulé, canvas à 0 × 0 et retiré, `page.cleanup()`. Plafond d'échelle 1,5 si `navigator.deviceMemory <= 2`. Vignette sans worker : `disableAutoFetch` et `disableStream` (FE-7). | Mesure, PDF de 60 pages, 390 px, DPR 2, défilement complet : **avant 60 canvas, 146,1 Mo ; après 6 au plus, 14,6 Mo** (4 et 9,7 Mo à l'arrêt) |
| Audit 23 | `useDeferredValue` sur la recherche (la frappe s'affiche tout de suite, résultats estompés pendant le recalcul) ; filtres, comptes et statistiques mémoïsés ; requête normalisée une fois et non 170 (`filterDocs`) ; `DocCard` mémoïsée avec des fonctions stables. | Vitest (`filterDocs` = `matchDoc`) |

### Bundle initial (gzip, build avec variables factices)
- `main` seul (65ed46e) : `index` 105,44 Ko. Front B seul, appliqué à `main` (avant la décision sur le téléphone) : 106,03 Ko (+0,59), lecteur PDF sorti du bundle initial (`PdfViewer` 1,54 Ko, à la demande). **Chiffre final, arbre complet du lot (tous rôles) : 108,90 Ko** (plafond 110). CSS `index` 6,32 Ko. `sw.js` 2,4 Ko, chargé après `load`.

### Procédure de secours : désinscrire le service worker
1. Construire et déployer un worker de secours : `VITE_SW=off npm run build`, puis le déploiement habituel (06-ops). Le `sw.js` produit purge les caches `xxb-*`, se désinscrit et recharge les onglets ouverts ; la page, de son côté, désinscrit tout worker et purge les mêmes caches. Vérifié en E2E.
2. Laisser ce build en ligne au moins 7 jours (le temps que les téléphones repassent sur le site), puis redéployer normalement pour réactiver le hors ligne.
3. Sur un appareil précis, sans attendre : Chrome Android, menu ⋮ > Paramètres > Paramètres des sites > Tous les sites > le site > Effacer et réinitialiser. Ordinateur : DevTools > Application > Service workers > Unregister, puis Storage > Clear site data.
4. Retour arrière du code : revenir au commit précédent ne suffit pas (un worker installé reste actif) ; toujours passer par l'étape 1.

### Commandes et résultats (2026-10-13, pile locale 553xx)
- `npm run typecheck` : 0 erreur. `npx vitest run` : 40 fichiers, 450 réussis (5 ignorés, déjà présents avant).
- Build avec `VITE_SUPABASE_URL=https://ci.invalid VITE_SUPABASE_ANON_KEY=ci-anon-key` : OK, `sw.js` généré (coquille de 7 fichiers).
- `npx playwright test e2e/offline.spec.ts` : 5/5. `npx playwright test` complet (port 5173 vérifié libre) : 29/30, l'échec (`import-excel.spec.ts`, connexion : « Aujourd'hui » en plus de 5 s, serveur de dev sans worker) est vert au passage suivant (`import-excel` et `qa-import` : 9/9). Même attente déjà vue sur `qa-import` au premier passage.

### Hors périmètre et risques
- Données de révision, connexion et admin : en ligne seulement (décision E3). Le catalogue hors ligne reste la copie `localStorage` du lot 1.
- Un onglet resté ouvert sur l'ancienne version qui charge un écran à la demande après un déploiement peut échouer (fichier supprimé par Cloudflare) : risque antérieur au worker ; le lecteur PDF affiche alors un repli au lieu de la page d'erreur.
- Une fois, à la mesure de l'audit 22, un aperçu est resté sur « Chargement » au tout premier lancement d'un serveur `vite preview` ; non reproduit en 11 essais. À surveiller en recette.
- Navigateurs sans service worker (très anciens) : site inchangé, ancien bandeau.

### Corrections après QA lot 3 (12-qa-lot3.md, décisions PM du 2026-10-13)

Hypothèses : H1, la production n'expose pas l'ETag aux requêtes `cors` (la pile locale ne le fait pas : pas d'`Access-Control-Expose-Headers`) ; `Last-Modified` et `Content-Length` restent lisibles (en-têtes autorisés par défaut). H2, le CDN de Supabase peut servir l'ancien PDF quelque temps après un remplacement au même chemin : la revalidation ne voit alors le changement qu'à l'expiration du CDN. L3-2 accepté par le PM, non traité.

| ID | Correctif | Preuve |
|---|---|---|
| L3-1 | `xlsxUnzip.test.ts` : plus aucune mesure à l'horloge murale. Zip menteur ramené à `2 × MAX_UNZIPPED_BYTES` (16 Mo). L'arrêt dès la borne reste prouvé par le test « octets produits » (compte des octets décompressés, borne + au plus une tranche) ; la non-congélation, par l'E2E IM-10 sous CPU / 4 | 4 passages isolés pendant 2 suites complètes lancées en parallèle : 4 sur 4 verts |
| L3-5 | `App.tsx`, `useKeyboard` : confirmation « Quitter ? » ouverte, seul Échap agit (il la referme) ; Tab et les boutons gardent leur effet natif ; touches 1 à 4, Entrée et Espace ignorées | `qa-lot3-session.spec.ts` : `test.fail` retiré, test vert, complété (Échap referme, puis la touche 1 choisit bien une proposition) |
| L3-3 | `rules.ts`, `isKeepableFile` : un fichier du site n'est gardé que si la réponse est ok, de même origine (`basic`) et de type cohérent avec l'extension (js et mjs : javascript, css, woff2, html). Une réponse `text/html` n'est jamais gardée sous un autre nom. Appliqué à `asset()` (réponse servie, pas gardée) et à `keep()` (installation refusée : l'ancienne version reste) | Vitest (5 tests) ; E2E `offline.spec.ts` : vite preview répond comme Pages (index.html en 200 pour `assets/disparu-….js`), rien gardé, le lecteur PDF l'est |
| L3-4 | `rules.ts` : `utm_*`, `fbclid`, `gclid` admis avec les paramètres de l'application pour servir une page hors ligne. Une seule autre clé (`code`, `token_hash`, `error`, `access_token`, `type`…) envoie toujours au réseau, même mêlée à des paramètres de suivi | Vitest (3 tests) ; E2E : hors réseau, `/?utm_source=…&fbclid=…` servi par le worker, `/?utm_source=…&code=…` part au réseau |
| L3-6 | PDF déjà gardé, ouvert en ligne (aperçu via pdf.js, ou « Ouvrir ↗ » sur téléphone qui envoie `xxb-keep-pdf` même si le PDF est gardé) : copie gardée servie tout de suite, puis requête **HEAD** en arrière-plan ; s'il a changé (ETag si lisible des deux côtés, sinon Last-Modified, sinon taille), nouveau téléchargement qui remplace l'entrée. Une revalidation à la fois par fichier. Jamais hors ligne, en 2G ni avec `saveData` (`isCostlyNetwork`, même règle côté page et worker). Plafond tenu : l'entrée remplacée n'est pas comptée deux fois (`evictionsFor`) ; un nouveau fichier plus gros que le plafond laisse l'ancien en place | Vitest (`pdfValidators`, `pdfChanged`, `evictionsFor`, `isCostlyNetwork`, `shouldKeepOnOpen`) ; E2E : PDF remplacé au même chemin, rafraîchi par l'aperçu puis par le message du téléphone, une seule entrée |

Choix de la HEAD plutôt qu'une requête GET conditionnelle (`If-None-Match`) : cet en-tête n'est pas autorisé par défaut en CORS et déclenche une pré-vérification (OPTIONS) que la production n'a pas été vérifiée à accepter ; la HEAD n'en déclenche pas, coûte quelques centaines d'octets, et le GET complet n'a lieu que si le fichier a changé.

**Consigne d'exploitation (à reporter dans 06-ops par l'orchestrateur) : un PDF corrigé devrait porter un nouveau nom de fichier.** La revalidation rattrape un remplacement au même chemin, mais seulement à la prochaine ouverture en ligne hors 2G et après expiration du cache du CDN (H2) ; un nouveau nom est pris tout de suite par tous les appareils.

Fichiers : `src/App.tsx`, `src/sw/rules.ts`, `src/sw/sw.ts`, `src/lib/openMode.ts` (`isCostlyNetwork`, `shouldKeepOnOpen` sans le paramètre `kept`), `src/components/library/Library.tsx` ; tests `src/lib/xlsxUnzip.test.ts`, `src/sw/rules.test.ts`, `src/lib/openMode.test.ts`, `e2e/offline.spec.ts` (2 tests), `e2e/qa-lot3-session.spec.ts`.

Commandes et résultats (2026-10-13, pile locale 553xx, machine chargée : load average de 50 à 59 pendant les E2E) :
- `npm run typecheck` : code 0. `npx vitest run`, 3 passages : 40 fichiers, 464 réussis (5 ignorés, déjà présents avant).
- Build avec `VITE_SUPABASE_URL=https://ci.invalid VITE_SUPABASE_ANON_KEY=ci-anon-key` : OK, **`index` 108,89 Ko gzip** (plafond 110), `sw.js` 3,0 Ko gzip (2,4 avant).
- `npx playwright test e2e/offline.spec.ts --repeat-each=3` : 21/21, deux fois (la seconde avec une trace de débogage sur le test « secours », retirée depuis).
- `npm run e2e` complet, 3 passages : 41/42, 40/42, 41/42. Échecs tous différents, tous vus sous charge : connexion (« Aujourd'hui » en plus de 5 s, déjà noté au lot 3 Front B) sur `qa-import` et `qa-lot3-session`, verts au passage suivant (12/12) ; et une fois `offline.spec.ts` « secours » (voir risque ci-dessous). `qa-lot3-*`, `session-resume`, `import-*` et les nouveaux tests L3-3, L3-4, L3-6 : verts aux 3 passages. IM-10 : tâche la plus longue 101 à 153 ms (CPU / 4).

Risque nouveau (non corrigé, hors des 5 constats) : le test « secours : un build VITE_SW=off… » a échoué 2 fois sur 9 exécutions, toujours dans une suite complète sous forte charge : 0 worker mais 1 cache `xxb-*` restant. Lecture : l'ancien worker peut finir d'écrire un fichier dans `xxb-rt-v1` après les deux purges (page et worker de secours), et `client.navigate()` du worker de secours échoue sur un onglet qu'il ne contrôle pas, donc la purge du rechargement n'a pas lieu. Sans effet pour l'utilisateur (plus aucun worker pour servir ce cache), mais le test peut rougir en CI. Correctif proposé : dans `register.ts` (`unregisterAll`), refaire la purge quelques secondes après la désinscription.

Suite (décision de l'orchestrateur : revalidation par HEAD validée ; purge différée demandée) : `register.ts`, `unregisterAll` purge les caches `xxb-*` tout de suite, puis de nouveau à 3 s et 10 s (`LATE_PURGE_DELAYS_MS`). Idempotent ; seuls les caches au préfixe `xxb-` sont visés, le localStorage (`xxb.progress.*`) n'est jamais touché. Code absent du build normal (branche `VITE_SW=off` seulement) : `index` toujours 108,89 Ko gzip. Test `src/sw/register.test.ts` (3 tests : cache recréé entre deux purges, double appel sans erreur, localStorage intact). Vérifié : test « secours » `--repeat-each=5` 5/5, `offline.spec.ts` 7/7, typecheck code 0, vitest 41 fichiers, 467 réussis (5 ignorés), build avec variables factices OK.

## Lot 4 > Front

Hypothèses : H1, la copie des cartes n'est utile qu'au dernier compte chargé sur l'appareil (une seule copie gardée). H2, les cartes publiées ne sont pas secrètes entre comptes ; la copie est quand même effacée à la déconnexion. H3, `save_progress` fusionne côté serveur (max par carte, séances dédoublonnées) : envoyer l'état local sans avoir relu le serveur est sans risque, d'où l'écriture permise en révision hors ligne (la règle du lot 1 « lecture en échec, aucune écriture » ne vaut plus que sans copie de l'appareil). Aucune migration.

### Fichiers
- `src/lib/cardsCache.ts` (nouveau) : clé `xxb.cards.v1.<user_id>`, forme `{ v: 1, user, at, plan, fiches, cards }`. Lecture validée : version, compte (le champ `user` doit égaler l'identifiant demandé), zones 1 à 12, cartes revalidées par `validCards`, fiches dont les listes sont des listes ; sinon la copie est ignorée. Écrite après chaque chargement en ligne réussi ; les copies des autres comptes sont retirées ; stockage plein : `false`, l'ancienne copie du compte reste.
- `src/lib/knownUser.ts` (nouveau) : `xxb.user.v1 = { id, email }`, dernier compte chargé en ligne, écrit avec la copie, oublié à la déconnexion et à `SIGNED_OUT`. Ne donne aucun droit (voir ci-dessous).
- `src/hooks/useRevision.ts` : `localOnly`, révision depuis l'appareil, garde « session valide » avant `save_progress`, `resync` (événement `online` et `TOKEN_REFRESHED`), rechargement discret.
- `src/components/revision/OfflineNotice.tsx` (nouveau) : « Hors réseau : vos réponses seront envoyées au retour du réseau. » dans `RevisionArea` et en séance. Hors réseau, le bandeau d'erreur d'enregistrement est masqué (sauf refus définitif `rejected`, qui ne vient pas du réseau).
- `src/components/revision/Gate.tsx` : hors réseau, jamais connecté : « Connectez-vous une première fois avec du réseau » (aucun formulaire) ; compte connu sans copie : « Révision pas encore gardée sur cet appareil ». Formulaires de connexion déplacés dans `SignInForms.tsx`, chargé à la demande (budget du bundle, voir plus bas).
- F2 : `src/lib/citedDocs.ts` (nouveau), `src/components/revision/CitedDocs.tsx` (nouveau, réutilise `DocCard` et la règle `openMode`), `Fiches.tsx` ; `AppContext.tsx` : `openCardDoc` accepte l'écran Fiches, RETOUR (et Échap) y ramène.
- `src/sw/sw.ts` : `caches.match(req, { ignoreVary: true })` pour les fichiers hachés (voir « Constat outillage »).
- Tests : `cardsCache.test.ts`, `knownUser.test.ts`, `citedDocs.test.ts`, `useRevision.test.ts` (+13 tests hors ligne) ; E2E `e2e/offline-revision.spec.ts` (build de production, port 4182) et `e2e/fiches-docs.spec.ts`.

### Taille de la copie
Contenu réel du dépôt (`supabase/content`, 665 cartes, 11 fiches, plan, chaque carte reliée à un document) : **453 737 caractères** (465 Ko en UTF-8), soit environ 9 % du quota de localStorage (5 Mi caractères dans Chrome et Firefox). Le reste du site y met environ 60 Ko (catalogue, progression). Vérifié par `cardsCache.test.ts` (écriture dans un stockage simulé de 5 Mi caractères).

### Session Supabase hors ligne (point délicat)
Comportement de supabase-js 2.117.3 (`@supabase/auth-js`, lu dans `GoTrueClient.js`) :
1. **Jeton expiré, sans réseau.** `getSession()` voit le jeton expiré (marge de 90 s) et tente le rafraîchissement : `_refreshAccessToken` réessaie en recul exponentiel (0,2 ; 0,4 ; 0,8… s) tant que l'essai suivant tient dans 30 s, soit **environ 25 s** avant d'échouer en `AuthRetryableFetchError`. L'échec réseau **ne supprime pas la session** (seul un refus du serveur, 4xx non réseau, la supprime et émet `SIGNED_OUT`) : la personne n'est donc pas déconnectée. Mais `getSession()` renvoie `session: null` avec l'erreur, et l'initialisation du client fait le même essai au chargement.
2. **Délai de grâce.** Après un échec, le client met le résultat en cache 60 s pour ce jeton (`REFRESH_FAILURE_COOLDOWN_MS`) : tout `getSession()` dans cette fenêtre échoue tout de suite, même si le réseau est revenu. Le minuteur interne (toutes les 30 s, onglet visible) relance un vrai essai à la fin de la fenêtre. Requêtes REST pendant ce temps : envoyées avec la clé anon (`fetchWithAuth` retombe sur la clé) ; `save_progress` répondrait 42501.
3. **Ce que fait la page.**
   - Hors réseau (`navigator.onLine === false`) : `init` n'appelle pas `getSession` (25 s d'attente) ; elle reprend le compte retenu (`xxb.user.v1`) et sa copie, `localOnly` vrai, statut `ready`. La reprise de séance (E2) fonctionne : `userId` et le contenu sont là.
   - `getSession` en erreur alors que le réseau est annoncé (réseau instable) : même repli, sinon « indisponible » comme avant. Lecture de la base en échec au chargement : repli sur la copie de ce compte.
   - Notes : `applyGrade` une fois par note (E1 inchangé), copie locale du lot 1 aussitôt ; `flush` ne tente rien hors réseau (ni appel, ni erreur).
   - **Avant tout envoi**, `flush` vérifie que le client a une session **valide pour ce compte** (`hasLiveSession` : même `user.id`, `expires_at` dans le futur). Sinon : aucun appel (jamais avec la clé anon, jamais avec la session d'un autre compte), nouvel essai dans 10 s.
   - **Retour du réseau** : événement `online` et `TOKEN_REFRESHED` appellent `resync`. Révision depuis l'appareil : si la session est valide, rechargement discret (progression serveur, contenu, copie rafraîchie, `localOnly` faux, jamais l'écran de chargement) ; `install` fusionne serveur, copie locale et mémoire, puis programme **un** envoi si le local apporte du nouveau. Sinon (jeton pas encore rafraîchi) : nouvel essai toutes les 10 s, et dès `TOKEN_REFRESHED`.
   - **Sans doublon** : l'envoi transmet un état fusionné, pas des différences ; `flush` n'a qu'un envoi en vol (`saving` / `again`), un second déclencheur sans nouvelle note ne renvoie rien (`dirty` faux), et `save_progress` fusionne (idempotent). Une note n'est jamais rejouée : les vues comptent 1 en base (E2E).
4. **Délai observé au retour.** Si le réseau revient pendant la boucle d'essais (moins de 25 s après le dernier essai), le jeton est rafraîchi au prochain essai (au plus 12,8 s) ; sinon, au plus 60 s de délai de grâce, plus 10 s de notre nouvel essai. Les notes restent sur l'appareil pendant ce temps, sans bandeau d'erreur tant que le navigateur est hors ligne. Couvert : Vitest (jeton expiré : aucun envoi, puis envoi après `TOKEN_REFRESHED` ; essais toutes les 10 s) ; E2E (jeton marqué expiré, rechargé hors réseau, 2 notes, retour : jeton rafraîchi, 2 notes en base une fois). Non couvert en E2E : la fenêtre de 60 s (absence de plus de 25 s), jugée trop lente pour la suite.
5. **Limite connue (antérieure au lot)** : déconnexion hors réseau avec un jeton expiré : `signOut` lit d'abord la session, échoue, et la laisse en stockage. La page oublie le compte et sa copie, mais la session Supabase revient au prochain chargement en ligne.

### F2
Liste « Documents cités par les questions de la zone » sous la fiche : cartes publiées de la zone ayant un `document_id` présent dans le catalogue, sans doublon, triées par titre affiché (`localeCompare` français, casse et accents ignorés). Présentation `DocCard` de la bibliothèque, règle `openMode` : téléphone en ligne, lecteur du téléphone (et garde par le worker comme en bibliothèque) ; ordinateur en ligne ou hors ligne avec PDF gardé, aperçu du site, RETOUR ramène à Fiches ; hors ligne sans PDF gardé : « Hors réseau : pas encore ouvert sur cet appareil ». Zone sans document cité : section absente.

### Constat outillage (montée SRE, vite 6)
`vite preview` 6 répond `Vary: Origin` sur les fichiers ; la copie préchargée par le worker (requête sans Origin) ne correspondait plus à la requête de la page (script module `crossorigin`, avec Origin) : page blanche hors réseau, **4 tests de `offline.spec.ts` rouges sur l'arbre de `main` avec les nouvelles dépendances** (vérifié sur une copie de `516988f`). Corrigé dans `sw.ts` (`ignoreVary` pour les fichiers hachés, immuables, de même origine). La production n'envoie probablement pas ce `Vary`, mais le correctif la protège aussi.

### Bundle initial (gzip, variables factices)
- `516988f` avec les dépendances du SRE (vite 6) : **109,18 Ko** (108,89 avec vite 5).
- Lot 4 Front : **109,93 Ko** (plafond 110). F1 et F2 seuls coûtaient 111,22 ; récupéré en chargeant à la demande les formulaires de connexion (`SignInForms`, 1,74 Ko gzip, inutiles hors réseau et une fois connecté ; repli si le fichier ne se charge pas : écran hors réseau, jamais la page d'erreur) et en réutilisant `DocCard`. Marge restante : 0,07 Ko. `sw.js` 3,0 Ko gzip.

### Commandes et résultats (2026-10-13, pile locale 553xx, dépendances du SRE en cours)
- `npx tsc --noEmit` : 0 erreur. `npx vitest run` (vitest 4.1.11) : 43 fichiers, 494 réussis, 1 échec attendu et 5 ignorés (déjà présents).
- Build `VITE_SUPABASE_URL=https://ci.invalid VITE_SUPABASE_ANON_KEY=ci-anon-key` : OK, `index` 109,93 Ko gzip.
- `npx playwright test e2e/offline-revision.spec.ts e2e/fiches-docs.spec.ts e2e/session-resume.spec.ts --repeat-each=3` : 21/21. `offline.spec.ts` : 7/7 (après le correctif `ignoreVary`).
- `npx playwright test` complet : 44/46 ; les 2 échecs (`qa-lot3-session` connexion en plus de 5 s, flake déjà noté ; `qa-lot3-sw` « xxb-keep-pdf ») sont verts au passage isolé suivant (10/10).

- **L4-1 (QA, corrigé)** : session réellement absente en ligne (`getSession` sans erreur ni session) ou `SIGNED_OUT` avant tout chargement : `forgetDevice` lit `xxb.user.v1` et efface ce compte et sa copie des cartes. Jamais hors réseau (getSession sauté) ni sur une erreur de rafraîchissement (repli sur l'appareil). Vitest : test QA L4-1 passé en `test`, plus 2 tests (SIGNED_OUT précoce ; hors réseau puis erreur de rafraîchissement : rien d'oublié). `npm run check` vert (500 réussis), `index` 109,70 Ko gzip, `offline-revision.spec.ts` 4/4 (CLI 2.120.0).

### Hors périmètre
- Connexion hors réseau : impossible (décision F1).
- Contenu de révision rafraîchi au retour du réseau, mais une séance en cours garde ses cartes ; le compte admin n'est pas revérifié avant le prochain chargement.
- Planches : aucun cadre hors ligne ajouté pour la révision.

### Correctif déconnexion mobile (enquête, 2026-10-13) : aucune cause dans le code client, aucun code modifié
Symptôme (production, lot 3) : sur mobile, connecté, onglet quitté une dizaine de minutes, déconnecté au retour.
- **Seule voie vers « déconnecté »** dans la page : `SIGNED_OUT` (→ `resetUser`) ou `getSession` sans session ni erreur (→ L4-1). Dans auth-js 2.117.3, `_removeSession` n'est appelé que sur : session illisible en stockage, `signOut`, ou **refus non réseau** du rafraîchissement **avec un jeton d'accès déjà expiré** (`_callRefreshToken` ; jeton encore valide : session gardée). Les échecs réseau (`AuthRetryableFetchError`, 5xx, 52x) ne suppriment rien.
- **Piste 1 écartée (délai de 15 s sur `/auth/v1/token`)** : GoTrue v2.197 (pile locale) accepte à tout moment le **parent du jeton actif** et rend le jeton actif sans nouvelle rotation. Relevé : rt1 → rt2 ; rt1 30 s après → 200 (rt2) ; rt2 → rt3 ; rt1 ensuite → 400 `refresh_token_already_used` ; rt3 toujours valide. Une réponse coupée puis redemandée ne déconnecte donc pas. E2E `e2e/slow-token-refresh.spec.ts` : réponse retardée de 17 s, coupée à 15 s, redemandée après la fenêtre de 10 s, personne toujours connectée (vert sur le code actuel).
- **Piste 2 écartée** : `TimeoutError`/`AbortError` du fetch fourni (y compris pendant la lecture du corps) devient `AuthRetryableFetchError` (`_handleRequest`), donc réessayable, session gardée.
- **Piste 3 écartée** : erreur de rafraîchissement → `getSession` rend une erreur → appareil ou « indisponible », jamais `signedout` (tests L4-1 existants). Le worker ne touche pas `/auth/` (POST et autre origine : `network`, pas de `respondWith`). Clé publishable : rafraîchissement vérifié sur la pile locale.
- **Causes restantes, hors code client** : session invalidée côté serveur (`session_not_found` après « SE DÉCONNECTER » sur un autre appareil, `signOut` étant global par défaut ; `session_expired` si minuteur d'inactivité ou durée maximale réglés), limite de débit des rafraîchissements (429 non réessayable), jeton déjà tourné ailleurs (deux contextes avec la même session), ou stockage différent (navigateur intégré d'une application, application iOS ajoutée à l'écran d'accueil). À trancher avec les journaux Auth de production.
- Tests : `src/lib/authRefresh.test.ts` (vrai client supabase-js et notre fetch face à un GoTrue simulé fidèle : réponse lente sans déconnexion ; refus non réseau avec jeton expiré → `SIGNED_OUT`).

## Lot 4 > SRE

Livré : `package.json`, `package-lock.json`, `vite.config.ts` (référence de types et option `json`), `.github/workflows/ci.yml` (version de la CLI), `README.md` (versions), `docs/squad/06-ops.md` (version de la CLI en C). Aucun code applicatif ni test métier touché.

- **Audit avant** (`npm audit`, dev compris) : 6 vulnérabilités (2 modérées, 1 haute, 3 critiques). `tinypool` ≤ 2.1.1 (critique, pollution de prototype menant à l'exécution de code, GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr) et `@vitest/mocker` 2.1.0 à 4.1.10 (lecture de fichier arbitraire, GHSA-82fw-gwwq-j7x9) tirés par `vitest` ≤ 4.1.10 et `@vitest/coverage-v8` ; `esbuild` ≤ 0.24.2 (le serveur de dev répond à n'importe quel site, GHSA-67mh-4wv8-2f99) tiré par `vite` ≤ 6.4.2. `npm audit --omit=dev` était déjà à 0.
- **Versions minimales retenues** : vitest 2.1.9 ne suffit pas (le mocker reste vulnérable jusqu'en 4.1.10). `vitest` et `@vitest/coverage-v8` 2.1.8 → **4.1.11** (n'utilise plus tinypool) ; `vite` 5.4.11 → **6.4.4** (esbuild 0.25.12). `@vitejs/plugin-react` 4.3.4 est conservé (pair `vite ^6`). Node 22 couvert (`engines` : vitest `^22`, vite `>=22`). **Audit après : 0 vulnérabilité.**
- **Configuration adaptée** :
  - `/// <reference types="vitest/config" />` remplace `vitest` (forme dépréciée depuis vitest 3) ;
  - `json: { stringify: false }` : Vite 6 passe `json.stringify` à `'auto'`, ce qui sérialise le catalogue des documents en `JSON.parse` avec clés entre guillemets, soit +0,3 Ko gzip sur `index`. On garde la sortie de Vite 5. À HEAD, `index` passe de 108,89 Ko (Vite 5) à 108,94 Ko (Vite 6 corrigé), contre 109,18 sans la correction.
  - Rien d'autre : `test` et `coverage.include` sont inchangés. `coverage.all` n'était pas utilisé. Le plugin `sw` utilise `esbuild.build`, compatible en 0.25.
- **Build** : même arborescence de `dist/` (empreinte des noms sans hachage identique entre Vite 5 et 6), coquille du service worker de 7 fichiers, liste des assets identique, chunks paresseux `CardsImport`, `PdfViewer`, `pdf.min`, `browser` inchangés. Avec le travail Front du lot 4 en cours : `index` à **109,67 Ko gzip** (≤ 110, marge de 0,33 Ko).
- **Vérifications (2026-10-13)** : `npm run check` vert (typecheck 0, vitest 4.1.11 : 43 fichiers, 494 verts, 1 `test.fails` attendu, 5 ignorés, build). Vitest 4 compte à part, en « expected fail », le `test.fails` IM-2 que vitest 2 comptait comme réussi. Pas de nouvel échec.
- **CLI Supabase 2.120.0** : installée à part (`npm install supabase@2.120.0` dans un dossier temporaire), sans toucher à la 2.109.1 de brew. Tests sur la pile du projet :
  - `start -x …` (comme la CI) et `db reset` (7 migrations) ;
  - `test db` : 4 fichiers, 93 tests, PASS, `04_lot2_test.sql` compris ;
  - parité `progressParity` : 5/5 ;
  - `npm run e2e` complet : **46/46**, Mailpit v1.31.3 toujours sur 55324.

  Une seconde passe a donné 45/46. L'échec venait d'un `/otp` en 504 après 10 s (`request_timeout` de GoTrue) sous une charge machine de 30 à 50. `midnight-back` est ensuite passé vert 3 fois de suite. C'est le même aléa de connexion sous charge que celui noté au lot 3. `config.toml` est inchangé : `auto_expose_new_tables` reste non défini, et ce champ disparaît le 2026-10-30. La CI passe en 2.120.0.
- **Incidents pendant l'essai** : une passe E2E a été cassée par un arrêt et un redémarrage de la pile par un autre rôle (avec la CLI 2.109.1), en pleine suite. Un `start` a aussi échoué après une mise en veille de la machine. Le `start` suivant est passé en 1 min. Rien n'est imputable à la 2.120.0.
- **Couverture (`test:coverage`)** : sous charge, le test `xlsxUnzip` « la fabrique produit bien un menteur » peut dépasser les 5 s par défaut. Il prenait déjà 4,3 s avec vitest 2, et a échoué 2 fois sur 4 avec vitest 4. Le correctif (un délai propre à ce test) relève du propriétaire du test. `npm test` et la CI ne sont pas concernés.

## Lot 5 > Back

Livré : `supabase/migrations/20261014120000_lot5_league.sql` (tables, ingestion des notes, clôture, `save_progress` à 4 paramètres), `20261014120100_lot5_pseudo.sql` (pseudo, `get_league_state`, signalement, admin, mots refusés amorcés), `20261014120200_lot5_cron.sql` (`pg_cron`, séparé) ; `supabase/tests/05_lot5_league_test.sql` (55), `06_lot5_social_test.sql` (68) ; `02` et `04` : signature de `save_progress` mise à jour (2 lignes). Contrat : `03-api-contract.md` L5 ; écarts à l'archi : `17-archi-lot5.md`, « État P5 » ; ADR-2 à 4.

- **Anti-triche (A6, A11)** : XP de ligue = somme de `grade_events.xp`, calculée par le serveur (QCM : texte choisi comparé à `qcm.ok`, 10 ou 0 ; sans QCM : 5). `p_xp` n'est lu par aucune fonction de ligue. Une note par carte et par jour, 30 par jour, bornes de jour, semaine close refusée.
- **Droits** : 8 tables en RLS sans politique, `revoke all` pour `public`, `anon`, `authenticated`. 20 fonctions internes révoquées explicitement (le `pg_default_acl` local donne `EXECUTE` à `anon` et `authenticated`) ; 10 RPC accordés à `authenticated` seulement. Testé.
- **Compatibilité** : l'ancienne `save_progress(jsonb, jsonb, integer)` est supprimée (deux surcharges rendraient l'appel à 3 clés ambigu pour PostgREST). Appel REST à 3 clés vérifié en local : même fusion, colonnes en plus ignorables.
- **Mots refusés** : 71 mots amorcés. La partie wolof (9 entrées) est à relire par un locuteur (A12) ; l'admin complète par `admin_set_blocked_word`.

### Commandes et résultats (2026-10-14, pile locale 553xx, CLI 2.120.0)
```
supabase db reset --local      -> 3 migrations lot 5 appliquées, cron.job : xxb-close-weeks '5 * * * *'
supabase test db               -> Files=6, Tests=216, Result: PASS (93 anciens + 55 + 68)
REST save_progress 3 clés      -> 200, xp 15, week_xp 0 ; 4 clés (QCM juste + QCM faux) -> week_xp 10, grades_counted 2
REST get_league_state anon     -> 42501 ; select direct grade_events (authenticated) -> 42501
parité (XXB_PARITY_DB_URL=...55322) -> progressParity 5 passed (5)
```

### Déploiement (base avant front)
1. `db push` des 3 migrations. Le front du lot 4 continue de marcher (appel à 3 clés) ; ses scouts ne marquent pas de points de ligue tant que leur PWA n'est pas à jour.
2. Si `pg_cron` est refusé en production : sauter `20261014120200_lot5_cron.sql` (marquer appliquée) ; la clôture paresseuse suffit.
3. Entre le `drop` et le rechargement du cache PostgREST, un appel peut échouer : le front le classe en `retry`.

### Retour arrière (nouvelle migration, jamais dans l'éditeur)
```sql
select cron.unschedule('xxb-close-weeks');
drop function public.save_progress(jsonb, jsonb, integer, jsonb);
-- puis recréer save_progress(jsonb, jsonb, integer) à l'identique de 20261014090000_lot2.sql, avec ses revoke/grant.
```
Les tables et RPC du lot 5 peuvent rester (inertes, fermées aux clients).

### Hors périmètre (signalé)
- Pas de limite « trop d'essais » sur `set_pseudo` : une erreur annule la transaction, un compteur en base serait perdu. Le front espace les envois.
- Quitter puis revenir permet de changer de pseudo sans attendre 24 h (accepté, rare).
- Ajouter un mot refusé ne retire pas les pseudos existants qui le contiennent.

## Lot 5 > Front

Hypothèses : H1, plancher de grade (A1) retenu par appareil à la première lecture ; l'ancien barème ne s'applique qu'aux comptes ayant une séance avant le 30/11/2026 (`LEGACY_GRADE_UNTIL_DAY`, date volontairement tardive : au pire, un grade privé un peu trop haut). H2, « Non merci » = `set_league_opt_in(false)` (L5-2), donc définitif sur tous les appareils. H3, pas de compteur de classement pendant la séance (P-B) : « +10 XP » du QCM réussi reste juste (perso et ligue) ; l'auto-évaluation affiche toujours l'XP perso (+5/+10), la ligue lui donne 5 (règles dans « Comment ça marche ? »).

### Fichiers
- Règles pures (testées) : `src/lib/grades.ts` (C2, A1, barre de l'en-tête dans le niveau en cours), `gradeQueue.ts` (`xxb.grades.v1.<uid>`, une entrée par carte et par jour `{c,d,g,t,a?}`, `a` = texte de la proposition choisie pour un QCM, 500 par envoi, purge à 8 jours, cartes du jour pour le plafond), `league.ts` (lecture validée de `get_league_state`, copie `xxb.league.v1.<uid>` revalidée à la lecture, libellés, A7, A8), `badges.ts` (10 locaux + 4 serveur, dates de premier constat), `pseudo.ts` (C5, `details`/`hint` du serveur, 5 essais par minute côté appareil), `leagueApi.ts`, `gameKeys.ts` (toutes les clés du lot effacées à la déconnexion, L4-1 compris).
- `useRevision.ts` : `grade(id, g, day, choice?)` remplit la file ; `flush` envoie `p_grades` (sans note : 3 clés, comme le lot 4), retire les notes envoyées après succès, garde les autres ; `GRADES_INVALID` : file abandonnée et progression renvoyée ; `PGRST202` (base sans la migration) : renvoi à 3 clés, file gardée ; `weekSync`, `isSyncPending`.
- Écrans (morceau `Gamification`, à la demande) : `src/components/league/` (Ligue, Badges, formulaire de pseudo, blocs du bilan, bloc « Cette semaine »), `lazy.tsx` (chargeur, repli « Cet écran n'est pas encore sur votre téléphone », focus du titre à l'arrivée). Puces `ProgressChips` (index). Admin : onglet PSEUDOS + mots refusés (`PseudosAdmin`, `BlockedWords`, à la demande).
- Navigation : écrans `ligue`, `badges` (titres, historique Android par `go`), PROGRÈS et PROGRESSION actifs sur les 3 écrans.

### Hors ligne des écrans Ligue et Badges
Le worker **précharge à son installation** le morceau `Gamification` et ses imports (`offlineScreenAssets`, calculé au build depuis le graphe Rollup, `__XXB_SW_PRECACHE__`), dans le cache d'exécution. Coût : environ 12,5 Ko gzip une fois par version, même pour qui n'ouvre jamais la ligue. Un échec n'empêche pas l'installation. Données : dernière réponse de `get_league_state` gardée par compte et revalidée ; badges locaux toujours calculés sur l'appareil.

### Bundle (gzip, variables factices)
`index` 112,42 Ko (plafond 115 ; 109,70 avant). `Gamification` 9,73, `leagueApi` (partagé) 2,82, `PseudosAdmin` 2,32.

### Commandes et résultats (2026-10-14, pile locale 553xx, CLI 2.120.0, migrations du Back appliquées)
- `npm run check` (variables factices) : vert, 549 réussis, 1 échec attendu, 5 ignorés.
- `npx playwright test e2e/league.spec.ts` : 2/2 (badge, pseudo, ligue, retour arrière, Ligue et Badges hors ligne, préchargement).
- `npx playwright test` complet : 45/50 ; `offline-revision` A puis B corrigé ensuite (clés du lot 5 effacées) : 4/4 ; `qa-lot3-session` (3) et `import-excel` (1) verts au passage isolé (lenteur de connexion connue).

### Hors périmètre (signalé)
- Carte avec `qcm` en base affichée en auto-évaluation (QCM rejeté par `validQcm` côté front) : sans `a`, 0 XP de ligue (règle du Back).
- Estimation hors ligne du défi (L5-6) : on affiche la dernière valeur reçue « (sur cet appareil) », sans ajouter la file locale.
- Planches de démonstration (annexe A6) et événements analytiques (A7) : non faits.
- E2E admin PSEUDOS et mots refusés : non écrits (Vitest sur les règles seulement).

### Correctifs QA (18-qa-lot5.md, 2026-10-14), dans les migrations non déployées
- **L5-1** : `d > aujourd'hui` (UTC) refusé ; une note sans `t` est datée du début du jour `d`. Les jours passés de la semaine ouverte restent acceptés (risque accepté par le PM : 30 cartes x jours de la semaine).
- **L5-2** : `league_refresh` ne change `last_gain_at` que si l'XP change ; à l'entrée en groupe, `last_gain_at` = dernière note à XP > 0.
- **L5-3** : `nazi` et `salaud` en mot exact ; retirés de la liste amorcée : 3 mots wolof signalés par la QA et la variante d'orthographe de l'un d'eux. Tests de non-régression (Nazir, Nazira, Naziha, Nazim, Salahoudine) dans 06.
- `supabase test db` : Files=7, Tests=232, PASS, aucun TODO (07 : les 3 TODO devenus tests, attendu du test 1 passé de 150 à 90) ; parité 5/5.

### Corrections après QA lot 5 (18-qa-lot5.md)
- **L5-1 (côté front)** : jour des notes de la file pris en UTC (`utcDay`) sur la même horloge que `t` (toujours envoyé) ; jamais « demain » pour le serveur, même à l'est de Dakar après minuit. Test Vitest.
- **L5-5** : bloc « Cette semaine » hors réseau : « (dernière connexion) » au lieu de « (sur cet appareil) ».
- **L5-6** : `e2e/cards.ts` (type de carte détecté, auto-évaluation « Voir la réponse » puis « Je savais », `startDailyOnQcm` renvoie la position du premier QCM) ; `qa-lot3-session`, `session-resume`, `midnight-back`, `offline-revision`, `league` ne supposent plus que la première carte est un QCM.
- **L5-7** : bannière `frozen` et `resultsPending` supprimées (inatteignables : le serveur renvoie `pending` entre dimanche 20:00 et lundi 06:00).

## Responsivité (19-qa-responsive.md, 2026-10-14)

Hypothèses : aucune pile Supabase (Docker figé) ; vérification par l'outillage d'audit de la QA (Supabase simulé par `page.route`, Vite dev), mêmes 27 écrans et mêmes 9 tailles, thème sombre (défaut) puis clair. Libellés courts de la barre du bas choisis par le Front (arbitrage PM : « sous 360 px »), à valider par le Design.

### Ce qui change
- **`#app` ne coupe plus rien** (`overflow-x:clip` retiré) : un débordement réel se voit et se mesure. Le fond topographique est coupé par son propre cadre (`#topo-clip`, `Topo.tsx`), il n'allonge plus la page (R-4).
- **Barre du bas** (R-1, R-7) : colonnes `minmax(min-content,1fr)`, cases d'au moins 44 px ; de 360 à 399 px, espacement de lettres à 0 pour garder un blanc entre BIBLIOTHÈQUE et AUJOURD'HUI. Sous 360 px, libellés courts **BIBLIO, JOUR, PLAN, FICHES, PROGRÈS** ; le nom accessible reste le libellé complet (`aria-label`), le libellé court est contenu dans le long (WCAG 2.5.3). Sous 300 px (zoom 200 %), la barre passe sur deux lignes (3 + 2), `padding-bottom` de page ajusté.
- **Zoom 200 %** (R-2, WCAG 1.4.10) : grilles en `minmax(min(Npx,100%),1fr)` (`.duo`, `.months`, `.cadence`, `.grid-docs`) ; `@container (max-width:260px)` : `.two`, `.kpis`, badges, notes J'interroge et `.seg3` sur une colonne, chiffres de la bibliothèque sur deux, lignes de zone et de lacunes empilées, marges réduites, `.who` sous la marque, barre de progression de séance sous QUITTER ; bandeaux, en-têtes de groupe et barre de l'aperçu passent à la ligne ; carte de connexion en `minmax(0,1fr)`.
- **R-3** : lacunes par zone sur deux lignes sous 420 px (zone et taux, puis vues et bouton). **R-5** : sous 480 px de haut en paysage, QCM sur deux colonnes et Valider collé en bas (`position:sticky`, `.qcard` en `overflow:clip`, repli `hidden`). **R-6** : `main>.banner{margin-bottom:14px}`. **R-7** : fermeture de l'aperçu latéral 44×44, cases « Essentiel du mois » à 44 px de haut, MASQUER à 44 px. **R-9** : la marque passe à la ligne au lieu d'être tronquée. **R-10** : `.d-meta` passe à la ligne au lieu de l'ellipse.
- **R-8, polices** : plus aucun texte sous 11 px (CSS et styles en ligne) ; **toutes les tailles de police en `rem`** (CSS et styles en ligne des composants, hors `src/planches`), donc la taille de police choisie dans le navigateur s'applique. Les dimensions (grilles, hauteurs) restent en `px`.
- **Admin > Questions** : 50 questions puis « Afficher 50 de plus (N restantes) » (`src/lib/listPage.ts`, testé), compteur « 50 SUR 665 QUESTIONS AFFICHÉES », focus sur la première question ajoutée ; retour à la première page au changement de zone ou de filtre. E2E `import-excel` et `import-docs` : filtre BROUILLONS avant de chercher les questions importées (placées en fin de zone, au-delà de 50).

### Contrôle automatique
`e2e/responsive.spec.ts` (22 tests, sans base) : bibliothèque, connexion, séance, correction, J'interroge et bilan de démonstration à 320, 180 (zoom 200 %) et 740×360 : `scrollWidth` ≤ largeur et aucun élément hors fenêtre (hors zones qui défilent) ; barre du bas : 5 cases ≥ 44 px dans la fenêtre ; Valider visible sans défiler en paysage.
- Seuils en `em` (media) et en `em` de conteneur (`@container`), largeurs minimales de grille en `rem` : avec une police de navigateur à 20 px, la barre du bas passe aux libellés courts sous 449 px, et l'audit à 320 et 360 px reste propre (police réglée par CDP `Page.setFontSizes`, comme le réglage de Chrome).

### Bundle (gzip, variables factices)
`index` 112,81 Ko (plafond 115 ; 112,42 au lot 5). +0,4 Ko : tailles en `rem` et pagination admin.

### Commandes et résultats (2026-10-14, sans pile Supabase)
- `VITE_SUPABASE_URL=https://ci.invalid VITE_SUPABASE_ANON_KEY=ci-anon-key npm run check` : vert, 553 réussis, 1 échec attendu, 5 ignorés.
- `e2e/responsive.spec.ts` : 22/22, lancé contre un Vite local avec une configuration Playwright hors dépôt (sans `globalSetup`, qui exige la pile). Les autres E2E demandent Supabase (Docker figé sur le poste) : non lancés, la CI de la PR fait le passage complet, dont `import-excel` et `import-docs` modifiés.
- Audit QA rejoué (scripts hors dépôt, ciblant la largeur visée) : 243 captures en sombre, 135 en clair, 54 avec une police de 20 px : 0 débordement, 0 texte coupé, 0 cible < 44 px, 0 texte < 11 px, 0 erreur JavaScript. Seuls restent des chevauchements de textes en ligne (faux positifs connus) et Valider collé au-dessus de la proposition D en paysage (voulu).

### Hors périmètre (signalé)
- Le mock de l'audit renvoie les 665 questions sans filtre de zone ; en base, une zone compte environ 60 questions : la liste s'arrête à 50 et le bouton propose « Afficher les 10 dernières ».
- Vrais appareils, Safari iOS et WebKit, clavier virtuel réel : non couverts (comme l'audit QA).

## Enquête : questions du jour revues le même jour (2026-10-16)

Symptôme (production `93bfa14`, Chrome Android) : des questions répondues plus tôt dans la journée reviennent dans la quête du jour le même jour. Par conception, toute carte notée en « Je réponds » a une échéance au moins à demain (`applyGrade`) : si elle revient, la note n'a pas été gardée.

### Cause (prouvée par test)
L'écran de séance (`App.tsx`, `case 'session'`) n'est pas soumis à l'état de connexion, contrairement aux écrans passés par `RevisionArea`. Quand Supabase émet `SIGNED_OUT` pendant une séance (jeton refusé au retour, la « déconnexion après ~10 min » déjà signalée), `resetUser` remet `ownerRef` à null et la progression en mémoire à vide, mais la séance reste affichée et le scout continue de répondre. Chaque `grade` puis `logSession` passait alors par `commit` → `adopt` : sans propriétaire, **rien n'était écrit dans la copie locale et rien n'était envoyé**. À la reconnexion, `install` fusionne serveur + copie locale (+ mémoire seulement si le propriétaire n'a pas changé) : les notes prises après le `SIGNED_OUT` n'existent nulle part, les cartes sont de nouveau à échéance aujourd'hui.

### Preuve
`useRevision.test.ts` > « quête du jour : notes prises après un SIGNED_OUT imposé (séance en cours) gardées et renvoyées à la reconnexion » : c1 à revoir aujourd'hui, `SIGNED_OUT`, note Su et séance enregistrées, reconnexion du même compte avec la ligne serveur d'origine. Avant correctif : `dailyCards(...).due` contient encore c1 (rouge). Après : c1 à échéance > aujourd'hui, `save_progress` reçoit c1 avec 4 vues, la séance est dans l'historique (vert).

### Correctif (`src/hooks/useRevision.ts`)
- `lastOwnerRef` : dernier compte dont la progression a été chargée (`install`, `fromDevice`), gardé après un `SIGNED_OUT` imposé, remis à null par « Se déconnecter » (choix explicite, téléphone partagé).
- `record(update)` remplace `commit` dans `grade` et `logSession` : avec un propriétaire, comportement inchangé ; sans propriétaire mais avec un dernier compte, la note (ou la séance) est appliquée à **sa copie locale** (`readLocalProgress` puis `writeLocalProgress`, qui fusionne). La mémoire de la page déconnectée n'est pas touchée.
- À la reconnexion de ce compte, `install` lit la copie locale, la fusionne et programme l'envoi (chemin du lot 4 inchangé).
- Garde : test « déconnexion choisie : une note arrivée ensuite ne recrée pas la copie locale effacée ».
- Non changé : hors ligne du lot 4 (mêmes chemins `install`/`fromDevice`/`flush`), changement de compte L1-5 (les notes d'une séance de A ouverte au moment du passage à B vont dans la copie de A tant que B n'est pas chargé).

### Ce que le correctif ne couvre pas
- **XP de ligue** de ces notes : `forgetDevice` efface la file `xxb.grades.v1` au `SIGNED_OUT` (L4-1, lot 5), et `grade` n'ajoute rien à la file sans propriétaire. Les notes non envoyées avant le `SIGNED_OUT` et celles prises après ne comptent pas pour la ligue (inchangé, décision PM à prendre).
- **Deux contextes ouverts** (onglet ancien + onglet ouvert par le lien magique, ou application installée + onglet) : la mémoire d'un onglet n'est jamais rafraîchie depuis la copie locale (aucun écouteur `storage`, rien au retour au premier plan). Un onglet resté en arrière-plan affiche une quête du jour périmée. Aucune perte (fusions en union partout), mais même symptôme visible. Non corrigé : hypothèse non confirmée chez l'utilisateur.
- Séance après `SIGNED_OUT` sans aucun bandeau : le scout ne sait pas qu'il est déconnecté avant la fin. Signalé au Design.

### Pistes écartées (lecture du code)
- `applyGrade`, `dailyCards`, `today` (`dayNum` local, `useNow`) : une carte notée en séance a une échéance ≥ demain ; `sessionDay` et la reprise de séance (E2) ne rejouent ni ne perdent de note (`grade` avant `keepSession`).
- `mergeProgress` et `save_progress` (lot 5) : même règle (plus de vues, puis échéance la plus lointaine) ; une entrée notée a toujours une vue de plus que sa base, elle ne perd pas.
- `keepalive`, debounce : une note est dans la copie locale dès `adopt`, avant tout envoi ; un envoi perdu est rattrapé au chargement suivant.
- Reprise de séance, « Quitter ? », QCM E1, auto-évaluation : `graded` n'est null que pour une deuxième chance, une reprise (REDO) ou « J'interroge », comme prévu.

### Commandes et résultats (2026-10-16, sans pile Supabase)
- Test ajouté rouge avant correctif, vert après. `npm run check` (variables factices) : vert, 555 réussis, 1 échec attendu, 5 ignorés. `index` 112,85 Ko gzip (plafond 115).
- E2E non écrit : la déconnexion imposée demande un client Supabase et un refus de jeton (pile figée) ; le modèle sans base (`responsive.spec.ts`) ne simule pas l'authentification.

## Irritants (2026-10-17)

Choix de l'utilisateur : options recommandées pour les quatre points.

- **Raté** : la carte perd `MISS_DROP` = 2 niveaux (plancher 0) au lieu de repartir à zéro, et revient toujours le lendemain (`srs.ts`, `nextSchedule`). Effet de bord accepté : une carte haute ratée une fois (niveau ≥ 3 après la baisse) n'entre plus dans « MES LACUNES » (`isGap` : niveau ≤ 1, D3) ; elle revient le lendemain dans la quête du jour.
- **Reprise** (« Refaire ces cartes ») : +`XP_REDO` = 2 XP perso par carte sue, sans niveau, sans note de ligue, sans séance journalisée (`session.ts` : `bonus`, `positionXp` ; `useRevision.addXp`). Le verdict du QCM affiche l'XP réellement gagnée (rien en deuxième chance).
- **Nouvelles questions** : session du jour finie, l'écran Aujourd'hui propose `EXTRA_NEW` = 10 questions jamais vues (session `extra`, comptée comme une séance « Je réponds » ; plafond de ligue inchangé, 30 cartes par jour).
- **Thème** : le bouton soleil/lune existe déjà dans l'en-tête (`Shell.tsx`), choix gardé ; aucun changement.
- **Déconnexion imposée** (enquête en lecture seule) : « Se déconnecter » passe en `signOut({ scope: 'local' })` (avant : `global` par défaut, qui révoquait aussi la session des autres appareils du compte, cause possible des déconnexions au rafraîchissement suivant). `rev.forcedOut` : vrai après un `SIGNED_OUT` non choisi d'un compte chargé ; bandeau « DÉCONNECTÉ » en séance « Je réponds ». Restent à vérifier dans le tableau de bord Supabase : Authentication > Sessions (minuteur d'inactivité, durée maximale, session unique), JWT expiry ; Logs > Auth, `/token` en 4xx (`session_expired`, `session_not_found`, `refresh_token_already_used`, `over_request_rate_limit`).
- Commandes : tests ajoutés rouges puis verts ; `npm run check` (variables factices) vert, 561 réussis, 1 échec attendu, 5 ignorés ; `index` 113,23 Ko gzip (plafond 115) ; `npm run e2e` : 72 réussis, `magic-link.spec.ts` instable (rouge une fois, vert en relance seul).

## Déconnexions : journal de l'appareil et onglets multiples (2026-10-17)

Tableau de bord Supabase relevé par l'utilisateur : sessions sans limite (plan gratuit, 0), JWT 3600 s, détection de réutilisation active, intervalle 10 s ; **aucune erreur `/token`** dans Logs > Auth (rétention d'environ un jour). Aucun refus serveur observé : la cause reste inconnue.

- **Journal de l'appareil** (`src/lib/authLog.ts`, clé `xxb.authlog.v1`, 20 entrées) : `forced` (SIGNED_OUT non choisi), `chosen`, `absent` (aucune session à l'ouverture alors qu'un compte ou un jeton était connu ici), `signed_in`, `refreshed`, avec onglet visible ou caché, réseau, mode d'ouverture (`appli` installée, `navigateur`, `webview` = navigateur intégré d'une autre appli, au stockage séparé de Chrome) et présence du jeton `sb-*-auth-token`. Sans e-mail ni identifiant. Lu sur l'écran de connexion (« JOURNAL DE CONNEXION », bouton « Copier le journal »). Mise en forme dans `authLogFormat.ts`, chargée avec cet écran.
  - Lecture : `absent` + `sans jeton` + `webview` ou autre mode que d'habitude → session ouverte dans un autre contexte (lien de l'e-mail ouvert dans Gmail) ; `forced` sans erreur serveur → refus côté client (auth-js) ; `absent` + `jeton présent` → jeton perdu au rafraîchissement.
- **Deux onglets** (ou onglet + appli installée) du même compte : au retour au premier plan et à l'événement `storage` de sa copie locale, l'onglet relit la copie locale et la fusionne en mémoire (`refreshFromDevice`). Corrige la quête du jour périmée d'un onglet resté en arrière-plan. Les notes d'un autre appareil (serveur) ne sont pas relues à ce moment-là : elles arrivent au chargement suivant.
- Commandes : tests ajoutés rouges puis verts ; `npm run check` (variables factices) vert, 575 réussis, 1 échec attendu, 5 ignorés ; `index` 113,78 Ko gzip (plafond 115) ; `npm run e2e` : 73 réussis.

## Partage du score (2026-10-17)

Écran de fin d'une séance « Je réponds » (hors reprise, au moins une réponse) : bouton « PARTAGER MON SCORE ». Menu de partage du téléphone (WhatsApp…) via `navigator.share`, sinon copie dans le presse-papiers (`lib/share.ts`). Texte (`lib/finShare.ts`) : justes sur total, série si plus d'un jour, adresse du site ; ni e-mail, ni pseudo, ni lien profond. `npm run check` vert (564 réussis, 1 échec attendu, 5 ignorés ; index 113,42 Ko gzip) ; `npm run e2e` : 73 réussis.

## Gel de série (2026-10-17)

Calcul sur l'appareil, à partir des jours de séance de la progression (`srs.ts`, `streakState`) ; sans migration. Règle par défaut proposée à l'utilisateur, modifiable : +1 gel tous les `FREEZE_EVERY` = 7 jours révisés de suite, `FREEZE_MAX` = 2 en réserve ; chaque jour manqué consomme un gel (le jour gelé ne compte pas dans la série), sinon la série repart à zéro ; aujourd'hui n'est jamais manqué. `streak` et `bestStreak` (série actuelle, meilleure série, badges de série) suivent la même règle : un scout ne peut que gagner au déploiement. Aujourd'hui : « JOURS DE SUITE · ❄ n GEL(S) », bandeau « GEL UTILISÉ » si hier a été couvert, étape 04 de « La méthode ». `npm run check` vert (585 réussis, 1 échec attendu, 5 ignorés) ; `index` 114,24 Ko gzip (plafond 115 : marge 0,76 Ko) ; `npm run e2e` : 73 réussis.

## Paliers de difficulté (2026-10-17)

Choix de l'utilisateur : paliers de difficulté, zone 1 d'abord, environ 40 nouvelles questions.

- **Base** : migration `20261017120000_card_tier.sql`, colonne `cards.tier` (1 à 3, défaut 1 : toutes les questions existantes restent au palier 1) ; test pgTAP `08_card_tier_test.sql`. **À appliquer avant le front**, qui lit la colonne `tier`.
- **Règle** (`srs.ts`, `openTiers`, `newCards`) : dans une zone, les nouvelles cartes du palier t+1 n'entrent dans la quête du jour qu'une fois `TIER_UNLOCK_RATIO` = 70 % des cartes du palier t de la zone au niveau `TIER_UNLOCK_LV` = 2 ou plus. Un palier vide ne bloque pas. Entraînement, examen et « J'interroge » ne sont pas filtrés (révision libre).
- **Admin** : champ « Palier de difficulté » dans l'éditeur ; colonne facultative « Palier » à l'import Excel (vide = 1 ; autre que 1, 2, 3 : ligne écartée) ; modèle `public/modele-questions.xlsx` régénéré.
- **Séance** : tampon « APPROFONDI » (palier 2) ou « EXPERT » (palier 3) sur la carte.
- **Contenu** : `data/import/zone1-paliers.json` et `.xlsx`, 20 questions de palier 2 et 20 de palier 3 rédigées à partir des 11 documents de la zone 1 (sources et pages citées). Écartées faute de certitude : nombre de Boers à Mafeking (9 000 ou 10 000 selon les pages), ajout des articles 9 et 10. À vérifier : la question du district (« 2 à 6 », le mot « groupes » est déduit, signalé en note). Classeur relu par l'import de l'appli : 40 lignes valides. Import en brouillon par un admin, relecture, puis publication.
- **Bundle** : l'espace Admin passe en chargement à la demande (`App.tsx`) ; `index` 108,56 Ko gzip (avant : 114,62).
- Commandes : tests ajoutés rouges puis verts ; `npm run check` (variables factices) vert, 595 réussis, 1 échec attendu, 5 ignorés ; `npm run e2e` : 73 réussis ; `supabase test db` en local : `08_card_tier_test.sql` vert, `06_lot5_social_test.sql` 2 échecs dus aux données laissées par d'anciens E2E dans la base locale (10 pseudos au lieu de 4), à confirmer par la CI sur base neuve.

## Import : source avec pages ou plusieurs documents (2026-10-17)

À l'import de `zone1-paliers.xlsx`, les 40 lignes ressortaient « non reliées » : la colonne Source cite les pages (« Bases du scoutisme.pdf, p. 16-17 et 26 ») ou plusieurs documents séparés par « ; », alors que la liaison (E4) exigeait le titre ou le nom de fichier exact. Choix de l'utilisateur : corriger l'import avant d'importer.

- `linkDocument` (`cardImportDocs.ts`) essaie la source entière, puis le nom de fichier en tête de chaque morceau séparé par « ; » (extension .pdf, .doc ou .docx comprise, suivie de la fin, d'une espace, d'une virgule ou d'une parenthèse). Première clé reliée retenue, sinon première ambiguë, sinon inconnue. Sans extension, aucune découpe : un titre peut contenir une virgule (« la devise, l'esprit… ») ; « Bases du scoutisme, p. 12 » reste non relié.
- Simulation sur les noms du catalogue de la zone 1 : 40 lignes sur 40 reliées. La source affichée reste inchangée.
- Commandes : test ajouté rouge puis vert ; `npm run check` vert, 596 réussis, 1 échec attendu, 5 ignorés ; `e2e/import-docs.spec.ts` vert.

## Paliers 2 et 3 des zones 2 à 11 (2026-10-17)

Demande de l'utilisateur : « Fais les paliers pour les autres zones ». Même format que la zone 1 (20 questions de palier 2, 20 de palier 3 par zone), rédigées par un agent par zone à partir des documents de la zone (`pdftotext`, `textutil`, texte des .pptx lu dans le XML), sans réseau ni écriture hors du fichier de sortie, consignes communes (faits vérifiés dans le texte, page citée, doute = question écartée ou nuance en note, pas de reprise du palier 1).

- **Contenu** : `data/import/zone<N>-paliers.json` (N = 2 à 11) et un classeur unique `data/import/zones2-11-paliers.xlsx` (395 lignes, colonne Zone). Relu par le code de l'import (`readFirstSheet`, `readSheetRows`, `analyzeImport`) avec les questions de base des seeds : 395 valides, 0 erreur ; 387 reliées sur les noms du catalogue, 8 ambiguës (deux documents de même nom une fois accents, casse et soulignés retirés : « Système de fonctionnement » en zone 3, dossier ASJ en zone 5, « Présentation DEVOIR ENVERS AUTRUI » en zone 9) à relier dans l'éditeur.
- **Retirées après relecture** (5) : en zone 5, la RCP à 15 compressions pour 2 insufflations et le contrôle tous les 5 cycles (Formation aux Premiers Secours.pdf, 2001 : rythme abandonné en 2005), les 5 insufflations après échec, le point de compression à l'aine sur fracture ouverte, et l'empoisonnement « puni de mort » (peine abolie au Sénégal en 2004) ; en zone 11, le point de compression sur fracture ouverte. Corrigée : la question 30/2 de la DRPC Kayes (contrôle toutes les 2 minutes retiré, note sur les recommandations actuelles). Zone 5 : 36 questions, zone 11 : 39.
- **Notes** : affichées à l'éclaireur (« Vigilance ») ; plusieurs signalent une contradiction entre documents, une déduction ou un nom à confirmer pour l'année en cours. À relire avant publication.
- **Import** : `FILE_HEAD` (`cardImportDocs.ts`) reconnaît aussi .ppt, .pptx, .xls et .xlsx en tête de source (zone 7 : « leadership SDS.pptx, diapo 7 »), test ajouté rouge puis vert.
- Commandes : `npm run check` vert, 596 réussis, 1 échec attendu, 5 ignorés ; index 108,61 Ko gzip.
