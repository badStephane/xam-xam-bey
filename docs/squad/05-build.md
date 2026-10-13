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
