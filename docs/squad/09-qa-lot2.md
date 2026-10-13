# 09 : Validation indépendante du lot 2 (QA)

Date : 2026-10-13. Base : branche `fix/lot2` (`83c0878`) plus les changements non commités du lot 2. Méthode de `07-qa.md` : les journaux de `05-build.md` sont des affirmations, seules les sorties ci-dessous valent preuve.

**Hypothèses**
- H1. La pile locale (CLI 2.109.1, Postgres 17, ports 553xx) représente la production pour le SQL et l'authentification. La production n'a pas été touchée (ni `link`, ni `db push`, ni appel distant).
- H2. Les modèles d'e-mail locaux n'avaient pas `{{ .Token }}`. Pour l'E2E, ils ont été configurés **dans `config.toml`** avec le texte exact prescrit pour la production (`05-build.md`, Lot 2 > Front A) : `supabase/templates/magic_link.html` et `confirmation.html`. Ces deux fichiers doivent être commités avec `config.toml`, sinon `supabase start` échoue dans le job `db` de la CI.
- H3. Aucun Android réel : les parcours Android sont listés au §5 pour l'utilisateur.

**Ajouts du QA** (aucun code applicatif modifié) : `src/hooks/useRevision.test.ts` (23 tests, happy-dom), `playwright.config.ts`, `e2e/` (3 fichiers de tests et 2 aides, 8 tests), script `npm run e2e`, section E2E du `README.md`, `test-results/` et `playwright-report/` dans `.gitignore`, modèles locaux (H2).
Dépendances de dev (versions exactes) : `happy-dom@21.0.1` (DOM pour rendre le hook sous Vitest, plus léger que jsdom ; activé fichier par fichier par `// @vitest-environment happy-dom`, l'environnement par défaut reste `node`), `@playwright/test@1.64.0`. Pas de `@testing-library/react` : `react-dom/client` et `act` suffisent pour un hook.

## 1. Preuves exécutées

```
npm run typecheck                         -> code 0
npx vitest run                            -> Test Files 25 passed | 1 skipped (26) ; Tests 217 passed | 5 skipped (222)
                                             (avant ajout QA : 24 fichiers, 194 tests, conforme à 05-build)
couverture src/lib (périmètre de la config) -> 93,79 % lignes | 94,7 % branches
couverture src/lib + src/hooks            -> 86,91 % lignes ; useRevision.ts 91,9 % lignes, 75,6 % branches
                                             useNavHistory, useNow, useCatalog : 0 % en unitaire (couverts par l'E2E seulement)
VITE_SUPABASE_URL=https://ci.invalid VITE_SUPABASE_ANON_KEY=ci-anon-key npm run check -> exit 0, index 103,64 Ko gzip
supabase db reset --local                 -> ... Applying migration 20261014090000_lot2.sql ... Finished
supabase test db                          -> 01 ok ; 02 ok ; 03 ok ; 04 ok ; Files=4, Tests=89, Result: PASS (2 fois : avant et après l'E2E)
parité (XXB_PARITY_DB_URL=...55322)       -> progressParity 5 passed ; progressLocalTabs 1 passed
npm run e2e (2 exécutions complètes)     -> 8 passed, dont 1 échec attendu `test.fail` (L2-1). Premier lancement de la
                                             version à 6 tests : 1 rouge (attente d'envoi de 5 s trop courte, portée à 20 s)
```

**Mutants** (fichier modifié, test lancé, fichier restauré, `cmp` vérifié) :
```
useRevision : garde « owner » de flush retirée   -> 2 tests rouges     | lecture dépassée installée -> 1 rouge
              refus 22023 relancé en boucle      -> 1 rouge            | copie locale effacée sans contrôle -> 2 rouges
              garde loadingFor retirée (QA-12)   -> 1 rouge            | dropPendingSave retiré au changement de compte -> 0 rouge (mutant équivalent : ownerRef = null bloque déjà l'envoi)
useNow : visibilitychange, focus, pageshow ignorés -> E2E « onglet en veille » rouge (attendu MARDI 13, reçu « LUNDI 12 OCTOBRE »)
```

**Migration lot 2, par HTTP** (PostgREST local, jeton réel d'un compte) :
```
rpc/save_progress               -> HTTP 200, ligne fusionnée
PATCH / POST / DELETE progress  -> HTTP 403 42501 « permission denied for table progress » (D6 tenu, double verrou)
GET progress (sa ligne)         -> HTTP 200   (le front du lot 1 lit en direct : compatible)
anon rpc/save_progress          -> HTTP 401 42501
pg_proc save_progress           -> prosecdef t, search_path="", propriétaire postgres, EXECUTE : authenticated seul
retour arrière 05-build (begin ... rollback) -> RPC en invoker fonctionne (xp 20) ; après rollback prosecdef t
L1-12 : 2 appels de 100 séances de 300 car. -> 101 séances (38 Ko), puis 171 séances (65 372 o < 65 536), plus de 23514
admin non admin : PATCH / DELETE cards?select=id -> HTTP 200 [] (cas « 0 ligne » que touchedRows transforme en erreur)
```

## 2. L1-8 fermé

`src/hooks/useRevision.test.ts`, client Supabase simulé (`vi.mock('../lib/supabase')`, réponses différées pilotées par le test, minuteurs simulés) :

| Exigence | Tests |
|---|---|
| Chargement | sans session ; fusion serveur + copie locale puis renvoi de ce qui manque ; copie identique : aucun envoi ; lecture en échec : indisponible et aucune écriture ; QA-12 (SIGNED_IN du même compte pendant le chargement : 1 lecture) |
| Note puis enregistrement | note visible et copiée en local tout de suite, envoi à 1 200 ms ; notes rapprochées : 1 envoi ; note prise pendant l'envoi : second envoi, pas écrasée par la réponse |
| Refus définitif | 22023 : `rejected`, aucune relance en 60 s, copie locale gardée, RÉESSAYER relance |
| Nouvel essai | erreur réseau : `retry`, relance à 10 s exactement, retour au vert |
| Changement de compte | L1-5 : envoi de A abandonné, notes de A absentes chez B et dans la copie de B ; réponse en vol de A ignorée |
| Déconnexion avec envoi en attente | envoi d'abord, copie effacée après succès ; hors réseau : copie gardée, plus aucun envoi ; envoi en vol : copie gardée, réponse ignorée ; SIGNED_OUT d'un autre onglet |
| Retry pendant le chargement | la lecture dépassée n'installe rien ; après « indisponible », la révision se charge |
| Connexion (D4) | adresse nettoyée et `shouldCreateUser` ; adresse invalide ; code de 5 chiffres ; code expiré ; code accepté ; renvoi |

E2E (`e2e/`, Chromium, `vite` sur `localhost:5173`, pile locale ; toute requête vers `*.supabase.co` fait échouer le test) :
- **(a) Connexion par code** : adresse neuve, sujet `Bienvenue sur Xam Xam Bëy : code NNNNNN` (Confirm signup), code saisi, connecté ; déconnexion ; même adresse, sujet `Votre connexion à Xam Xam Bëy : code NNNNNN` (Magic Link), connecté. Plus : code faux puis bon code ; « Renvoyer dans N s » désactivé ; code collé avec espace normalisé.
- **(b) Minuit** (`page.clock`, veille 23 h 58, Africa/Dakar) : une carte vue avant minuit ; minuteurs actifs : à 00 h 01 la date de l'en-tête change et « CARTES À REVOIR » passe de 0 à 1 ; minuteurs gelés (`setSystemTime`) puis `visibilitychange` : même résultat. **C1 de 07-qa levée.**
- **(c) Retour** : retour en pleine séance, on reste sur le site, écran du jour ; Plan puis retour : écran du jour.
- Lien magique ouvert dans un nouvel onglet : connecté, adresse sans jeton.

## 3. Constats

| ID | Sév. | Fichier:ligne | Constat | Reproduction | Correctif proposé (rôle) |
|---|---|---|---|---|---|
| L2-1 | Mineur | `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:3334`, `src/hooks/useNavHistory.ts:47-52` | Au retour du lien magique, supabase-js efface les jetons par `location.hash = ''`, ce qui **ajoute** une entrée d'historique. Premier appui sur Retour : même écran, et l'adresse réaffiche `#access_token=…&refresh_token=…`. Second appui : sortie du site. | Reproduit (`e2e/magic-link.spec.ts`, `test.fail`) : `history.length` 3, puis URL avec jetons, puis `about:blank` | Dans `onPopState`, si le hash contient `access_token` ou `error_description` : `replaceState` sans hash puis `history.back()` pour sauter l'entrée morte ; retirer `test.fail` ensuite (Front A) |
| L2-2 | Majeur | `src/components/revision/Gate.tsx:57`, `src/lib/signin.ts:42`, modèle `05-build.md:186` | Le lien et le code partagent le même jeton à usage unique. Cas visé par D4 : le lien s'ouvre dans un autre navigateur (Gmail, Samsung Internet), la personne y est connectée, revient dans Chrome et saisit le code : **« Code incorrect ou expiré »**. L'écran promet pourtant « le code marche même si le lien s'ouvre dans un autre navigateur ». Contournement : « Renvoyer » (60 s), puis saisir le nouveau code **sans toucher le lien**. | Reproduit en E2E exploratoire, adresse neuve et adresse connue (2 contextes de navigateur ; fichier d'exploration retiré) | Texte de l'écran et de l'e-mail : « Saisissez le code ici ; si vous avez déjà touché le lien, il a servi : demandez un nouveau code ». Message d'échec : ajouter « ce code a peut-être déjà servi par le lien ». Option PM : e-mail avec code seul (Front A, SRE pour A7, décision PM) |
| L2-3 | Mineur | `supabase/migrations/20261014090000_lot2.sql:10` | Durcissement partiel : `MAINTAIN` (Postgres 17 : VACUUM, ANALYZE, LOCK TABLE) reste accordé à `anon` et `authenticated` (`anon=m` sur `documents`, `authenticated=rm` ailleurs). Et la révocation ne vaut que pour les tables existantes : les privilèges par défaut regonfleront une table future. Non exposé par PostgREST, comme `truncate`. | Reproduit (`relacl` lu en local) | Nouvelle migration : `revoke maintain` (si la production est en PG 17, vérifier par `select version()`) et `alter default privileges ... revoke truncate, references, trigger` ; test pgTAP (Back) |

Annexe, une ligne par point :
- `useNavHistory`, `useNow` et `useCatalog` n'ont aucun test unitaire ; ils sont couverts par les E2E (retour, minuit). `coverage.include` de `vite.config.ts` ne mesure toujours que `src/lib` (Front, à élargir à `src/hooks`).
- `dropPendingSave()` au changement de compte est redondant avec `ownerRef = null` (mutant équivalent) : sans danger.
- Délai de 15 s appliqué à `signInWithOtp` : si le SMTP Gmail répond lentement, l'écran annonce « réseau » alors que l'e-mail part ; un nouvel essai tombe sur la limite d'un envoi par minute. Local : 0,24 à 0,49 s. Plausible, à surveiller dans I8.
- `config.toml` local : `site_url` = production. Un poste qui sert Vite sur `127.0.0.1:5173` (et non `localhost`) reçoit un lien local qui redirige vers la production. Sans effet sur la production.
- Retour dans la séance en mode « faire réciter » : l'entrée « séance » reste en avant dans l'historique ; Avancer ramène l'écran du jour (pas de séance fantôme). Sans effet.
- `parseRows` rejette un catalogue vide et retombe sur le catalogue intégré : comportement inchangé depuis le lot 1.
- ErrorBoundary : `purgeableKeys` garde `xxb.progress.*` et la session `sb-*-auth-token` (test unitaire relu) ; la copie locale est écrite à chaque note, avant tout plantage. Pas d'essai de plantage en navigateur.
- 05-build vérifié sur ses chiffres : 194 tests, pgTAP 89, parité 5/5, retour arrière : conformes.

## 4. Verdict

```
Lot 2 : GO AVEC RISQUES (base puis front, 06-ops.md §I), sous réserve de la CI verte sur la PR
Couverture : D1 à D6 et points 6, 7, 10 à 17, 19 vérifiés (exécution ou lecture) ; L1-8 fermé (23 tests hook, 8 E2E) ;
             C1 de 07-qa levée (E2E minuit) ; pgTAP 89/89 ; parité 5/5 ; 217 tests unitaires
Bugs ouverts : bloquants 0 ; majeurs 1 (L2-2, connexion Android avec contournement) ; mineurs 2 (L2-1, L2-3)
Risques résiduels : | Risque | Impact | Mitigation | Accepté par (PM) |
  | L2-2 code refusé après le lien | connexion ratée au premier essai sur Android | Renvoyer puis code seul ; correction de texte (30 min) | à signer |
  | L2-1 retour mort, jetons dans l'adresse | 1 appui inutile, jetons visibles sur l'appareil | correctif Front A | à signer |
  | L2-3 MAINTAIN | aucun vecteur via l'API | migration suivante | à signer |
Recommandation : corriger le texte de L2-2 (écran, message, modèle A7) avant I7 ; L2-1 et L2-3 peuvent suivre au lot 3.
```

**Pourquoi pas NO-GO** : aucune perte de progression ni faille d'accès reproduite ; D6 tenu par HTTP ; la migration reste compatible avec le front du lot 1 ; tous les chemins du hook sont testés et les tests mordent sur 5 mutants sur 6.
**Pourquoi pas GO sec** : L2-2 touche exactement le parcours que D4 voulait réparer ; aucun essai sur Android réel.

## 5. À tester sur Android par l'utilisateur (après I7, Chrome Android en 3G ou « Slow 3G »)

1. Adresse neuve : l'e-mail montre le code dans le sujet et le corps ; saisir le code **sans toucher le lien** : connecté.
2. Toucher le lien de l'e-mail : noter dans quel navigateur il s'ouvre, et si l'on y est connecté. Revenir dans Chrome, saisir le code (attendu aujourd'hui : refus, L2-2), puis « Renvoyer » après 60 s et saisir le nouveau code.
3. Après connexion par le lien dans Chrome : appuyer sur Retour une fois (L2-1 : même écran, jetons dans l'adresse ?), puis une seconde fois.
4. En pleine séance, geste ou bouton Retour Android : la séance se termine, on reste sur le site ; Plan, Fiches, Retour : écran précédent.
5. Ouvrir la révision le soir, verrouiller le téléphone, rouvrir après minuit : la date de l'écran du jour a changé, les cartes vues la veille sont à revoir.
6. Noter une carte, passer en mode avion, noter encore, fermer l'onglet, réactiver le réseau, rouvrir : les deux notes sont là.
7. Sous 360 px : bouton « Mon compte », adresse visible, « Se déconnecter » fonctionne ; pour un admin, « Espace admin » dans ce panneau.
8. Réseau coupé : bandeau « Le réseau est coupé… » ; révision : « Réessayer » apparaît après 6 s de chargement.
9. Admin : modifier une question, changer de zone sans enregistrer : la confirmation apparaît ; Retour Android avec un brouillon : confirmation.

## 6. Après tour 2 (orchestrateur, 2026-10-13)

- L2-1 corrigé : `useNavHistory` saute l'entrée à jetons ; E2E `magic-link` passe sans `test.fail` ; 2 tests unitaires échouent si le correctif est neutralisé (Front A).
- L2-2 traité par décision PM : lien **et** code gardés ; e-mail « Pas les deux : le lien utilise le code », écran et message d'échec alignés (Front A, modèles `supabase/templates/`).
- L2-3 corrigé : `maintain` (PG ≥ 17) et privilèges par défaut retirés ; pgTAP 93/93 (Back).
- E2E en CI (job « db + e2e », SRE). Vérifié par l'orchestrateur : typecheck OK, Vitest 227 verts, build OK. pgTAP et E2E : preuve attendue de la CI de la PR.
- À surveiller : `signin-code` « adresse neuve » a échoué 1 fois sur 5 en local (pile partagée entre agents).
- Verdict : **GO sous condition de CI verte sur la PR**, puis §I de `06-ops.md`.
