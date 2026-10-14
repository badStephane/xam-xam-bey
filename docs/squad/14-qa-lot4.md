# 14 : Validation indépendante du lot 4 (QA)

Date : 2026-10-13. Base : branche `feat/lot4` (depuis `516988f`), changements non commités du lot 4 (F1 révision hors ligne, F2 documents cités, F3 outillage). Méthode des lots 2 et 3 : les journaux de `05-build.md` sont des affirmations ; seules les sorties ci-dessous valent preuve.

**Hypothèses**
- H1. La pile locale (CLI **2.120.0** installée à part dans le scratchpad, ports 553xx, services de la CI) représente la production pour l'Auth, le REST et le stockage. Aucun appel distant, aucun `link` ni `db push`.
- H2. Le quota de localStorage est simulé (happy-dom) : aucun navigateur réel n'a été rempli à 5 Mi caractères.
- H3. Aucun Android réel : le lecteur du téléphone (F2, `openMode` mobile) n'est vérifié que par les règles pures et l'E2E desktop.

**Ajouts du QA** (aucun code applicatif modifié)
- `src/hooks/useRevision.test.ts` : 4 tests « QA L4 » (deux comptes sur l'appareil, session d'un autre compte au retour, stockage plein, `test.fails` pour L4-1).
- `e2e/offline-revision.spec.ts` : 1 test « QA L4 : A puis B sur le même appareil » (build de production, port 4182).
- `src/lib/xlsxUnzip.test.ts` : délai propre de 30 s au test « la fabrique produit bien un menteur » (`LIAR_BUILD_TIMEOUT_MS`), risque signalé par le SRE.

## 1. Preuves exécutées

```
npm audit                                  -> found 0 vulnerabilities (dev compris)
npm ls                                     -> vite 6.4.4 (esbuild 0.25.12), vitest 4.1.11, @vitest/coverage-v8 4.1.11
vite.config.ts                             -> /// <reference types="vitest/config" /> ; json: { stringify: false }
.github/workflows/ci.yml                   -> supabase/setup-cli version: 2.120.0
npm run check (arbre livré)                -> typecheck 0 ; 43 fichiers, 494 passed | 1 expected fail | 5 skipped ; build OK
npm run check (après ajouts QA)            -> 497 passed | 2 expected fail (IM-2, L4-1) | 5 skipped ; build OK
vite build, variables factices de la CI    -> index 109,67 Ko gzip (plafond 115) ; sw.js « coquille de 7 fichiers »
vitest run --coverage                      -> 497 passed ; lignes 88,75 % (src/lib + src/hooks) ; useRevision.ts 93,51 % lignes
vitest run --coverage xlsxUnzip.test.ts    -> 7 passed (délai propre en place)
supabase start -x … (CLI 2.120.0)          -> OK ; supabase test db : 4 fichiers, 93 tests, PASS
playwright offline-revision + fiches-docs  -> 5 passed (dont QA L4)
npm run e2e (suite complète)               -> 47 passed (2,8 min), aucun rejeu nécessaire
supabase stop                              -> pile 553xx arrêtée ; 543xx et le vite du port 5179 non touchés
```

**Attaques menées et résultat**

| Zone | Attaque | Résultat |
|---|---|---|
| F1 copie | Copie d'un autre compte posée sous la clé de A, `xxb.user.v1` réécrit vers B, JSON faux, version autre, zone 13, fiche aux listes non listes | Ignorée ou nettoyée (tests livrés + relecture `parseCardsCache` : `raw.user === userId` exigé) |
| F1 deux comptes | A en ligne, puis `SIGNED_IN` de B sans déconnexion ; puis rechargement hors réseau | Copie de A retirée, `xxb.user.v1` = B, hors réseau seule la révision de B (QA Vitest) |
| F1 téléphone partagé | A se connecte, SE DÉCONNECTER, rechargement hors réseau, puis B se connecte, rechargement hors réseau | Après A : aucune clé `xxb.cards.*` ni `xxb.user.v1`, écran « Connectez-vous une première fois avec du réseau » ; après B : aucune clé contenant l'id de A, compte affiché B (QA E2E) |
| F1 envoi | Révision de A depuis l'appareil, note, session revenue au nom de B (jeton valide), `online` + `TOKEN_REFRESHED` | Aucun `save_progress`, aucune lecture ; la note reste dans la copie locale de A (QA Vitest). Garde `hasLiveSession` : même `user.id` et `expires_at` futur |
| F1 jeton expiré | Jeton marqué expiré, rechargé hors réseau, 2 notes, retour du réseau | Ni déconnexion ni perte ; 2 vues en base, 1 séance, une seule fois (E2E livré, rejoué dans la suite complète) |
| F1 doublon | Second `online`, `TOKEN_REFRESHED`, rechargement après envoi | 1 seul `save_progress` (Vitest) ; vues = 1 en base (E2E) |
| F1 quota | `setItem` refusé (QuotaExceededError) pour `xxb.cards.*` | Révision prête, pas de crash, compte non retenu (pas de révision vide hors ligne), progression locale du lot 1 écrite (QA Vitest). Taille réelle : 453 737 caractères pour 665 cartes, test livré |
| F1 bandeau | Texte exact | « Hors réseau : vos réponses seront envoyées au retour du réseau. » (`OFFLINE_NOTICE`), en révision et en séance, vérifié par E2E ; erreur d'enregistrement masquée hors réseau sauf `rejected` |
| F2 | Cartes publiées (`status = 'published'`), `document_id` hors catalogue, doublons, tri accents/casse, RETOUR et Échap | Conforme (relecture `loadContent`, `citedDocs`, `openCardDoc`/`DOC_RETURN_SCREENS` ; E2E livré). Hors ligne sans PDF gardé : mention « pas encore ouvert sur cet appareil » |
| sw.ts | `ignoreVary` peut-il servir REST, Auth ou un fichier non haché ? | Non pour REST/Auth : autre origine, route `network` avant tout cache (`routeRequest`). `asset()` ne reçoit que `assets/` et `pdfjs/` de même origine ; `pdfjs/` était déjà en cache d'abord au lot 3, `ignoreVary` ne change que la comparaison de `Vary`. PDF : `cache.match(req.url)`, inchangé |

## 2. Constats

| ID | Sévérité | Constat | Preuve | Statut |
|---|---|---|---|---|
| L4-1 | Mineur | Session absente au chargement **en ligne** (déconnecté ailleurs, jeton de rafraîchissement révoqué, stockage Auth vidé) : `init` passe en `signedout` sans oublier `xxb.user.v1` ni `xxb.cards.v1.<id>`. Même trou si `SIGNED_OUT` arrive avant que la progression soit chargée (`resetUser` n'efface que pour `ownerRef`). Hors réseau ensuite, l'appareil rouvre la révision et la progression locale de l'ancien compte, sans session. Aucune écriture possible (garde `hasLiveSession`), cartes non secrètes (H2 du Front) : seule la progression locale de l'ancien compte est visible | `useRevision.test.ts`, `test.fails('QA L4-1 …')` (échoue seul et dans la suite) ; `useRevision.ts` l. 359 `if (!user) { setStat('signedout'); return }` | Ouvert, Front. Correctif suggéré (quelques lignes) : sur session absente en ligne et sur `SIGNED_OUT` sans propriétaire, lire `xxb.user.v1` et appeler `forgetKnownUser` + `clearCardsCache` pour cet id. Passer le test en `test` ensuite |
| L4-2 | Mineur (antérieur, documenté) | Déconnexion hors réseau avec jeton **expiré** : `signOut` d'auth-js échoue sur la lecture de session et la laisse en stockage ; la page oublie la copie, mais le compte revient au prochain chargement en ligne. Avec un jeton valide, auth-js retire bien la session même en erreur réseau (relu dans `GoTrueClient._signOut`) | 05-build « Limite connue » ; relecture auth-js 2.117.3 | Accepté comme limite connue ; à arbitrer par le PM pour les téléphones partagés |
| L4-3 | Info | Révision depuis l'appareil sans session valide du même compte (L4-1, autre compte) : `resync` relance `getSession` toutes les 10 s sans fin. Lecture locale, aucun appel réseau, aucun envoi | Relecture `resync`/`resyncLater` ; test livré « nouvel essai toutes les 10 s » | Sans action |
| L4-4 | Mineur (test) | `xlsxUnzip` « la fabrique produit bien un menteur » dépassait 5 s sous couverture et charge | 05-build Lot 4 > SRE | **Corrigé par le QA** (test seulement) : délai de 30 s propre à ce test |
| L4-5 | Info (outil de test) | Avec happy-dom, `vi.spyOn(localStorage, 'setItem')` puis restauration rend localStorage inutilisable pour les tests suivants (sonde : `getItem` renvoie null après `setItem`) | Sonde QA, supprimée | Le test quota du QA remplace `window.localStorage` par un enveloppe le temps du test ; à savoir pour les prochains tests |

Aucun bloquant, aucun majeur.

## 3. Points vérifiés sans constat

- `xxb.user.v1` ne donne aucun droit : il ne sert qu'à choisir quelle copie relire hors réseau ; la copie doit porter le même `user` ; toute écriture repasse par une session Supabase valide du même compte ; en ligne, le compte vient toujours de `getSession`.
- Hors réseau, `flush` ne tente rien (pas d'erreur, pas d'appel), la note est dans la copie locale du lot 1 dès `adopt`. Envoi en vol unique (`saving`/`again`), état fusionné envoyé, `save_progress` idempotent.
- Écriture de la copie des cartes : les copies des autres comptes sont retirées avant l'écriture ; en cas de refus, la copie précédente du même compte reste et le compte n'est pas retenu.
- Bundle : 109,67 Ko gzip avec les variables de la CI (109,70 avec la configuration locale), plafond 115. `SignInForms` chargé à la demande, repli hors ligne si le fichier manque.
- F3 : audit à 0, versions conformes, CLI 2.120.0 : `start`, pgTAP (93), E2E complet verts.

## 4. Non couvert

- Fenêtre de grâce de 60 s d'auth-js (absence de plus de 25 s) : non rejouée en E2E (trop lente), raisonnement du Front relu et cohérent.
- Quota réel d'un navigateur rempli par d'autres données ; Android réel (lecteur du téléphone depuis Fiches) ; production Cloudflare (`Vary` réellement renvoyé).
- CI GitHub sur la PR : non observable d'ici ; reste une condition de la porte.

## 5. Verdict

```
Release lot 4 : GO avec risques
Couverture : F1, F2, F3 vérifiés ; parcours critiques verts (E2E 47/47, pgTAP 93, check vert)
Bugs ouverts : bloquants 0, majeurs 0, mineurs 2 (L4-1 ouvert, L4-2 antérieur)
Risques résiduels :
| Risque | Impact | Mitigation | Accepté par (PM) |
| L4-1 copie non oubliée si la session disparaît hors de la page | Progression locale d'un ancien compte visible hors réseau sur un appareil partagé ; aucune écriture | Correctif Front de quelques lignes, test QA prêt | à signer |
| L4-2 déconnexion hors réseau avec jeton expiré | Compte restauré au prochain chargement en ligne | Conseiller de se déconnecter avec du réseau | à signer |
Recommandation : fusionner une fois la CI verte sur la PR ; L4-1 peut suivre en correctif rapide ou être corrigé avant la fusion si le PM le veut.
```

## Addendum orchestrateur (2026-10-13)

- L4-1 corrigé par le Front avant la fusion (`forgetDevice` dans `useRevision.ts`, test QA passé de `test.fails` à `test`, 2 tests ajoutés) ; `npm run check` revérifié : 500 réussis, index 109,70 Ko gzip.
- L4-2 accepté par le PM (antérieur au lot) : sur un téléphone partagé, se déconnecter avec du réseau.
