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
