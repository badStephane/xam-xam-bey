# Revue QA : Xam Xam Bëy (ouverture aux responsables scouts)

Date : 2026-10-12. Commit : `68908c7` (main). Revue en lecture seule, sans appel réseau à Supabase.

**Hypothèses**
- H1. Le public cible garde l'onglet ouvert plusieurs jours sur Android (comportement courant de Chrome mobile) et alterne parfois téléphone et ordinateur.
- H2. Fuseau de référence Africa/Dakar (UTC+0, pas d'heure d'été). Les calculs de jour ont aussi été vérifiés sous Europe/Paris.
- H3. Les politiques RLS sont jugées sur le SQL versionné ; l'état réel de la base de prod n'a pas été inspecté.
- H4. Les tests jetables qui servent de preuve sont dans le scratchpad de session (`qa.test.ts`), pas dans `src/`.

## 1. Chiffres réels

`npm test` : 10 fichiers, **72 tests, 72 verts**, 3,2 s.
`npm run test:coverage` (v8, périmètre limité par `vite.config.ts` à `src/lib/**`) :

| Fichier | Stmts | Branches | Fonctions | Lignes non couvertes |
|---|---|---|---|---|
| **Total mesuré** | **77,14 %** | 94,37 % | 84,88 % | |
| adminApi.ts | 0 % | 0 % | 0 % | 1-118 (tout) |
| cardRules.ts | 100 % | 88,46 % | 100 % | br. 24, 31-33 |
| catalog.ts | 100 % | 91,66 % | 100 % | br. 10, 20, 59 |
| constants.ts | 100 % | 100 % | 100 % | |
| demo.ts | 100 % | 98 % | 100 % | br. 44 |
| format.ts | 92,68 % | 93,33 % | 56,25 % | 21-23 (`shortDate`) |
| pdf.ts | 20 % | 100 % | 33,33 % | 19-50 (chargement pdf.js, `openPdf`) |
| practice.ts | 100 % | 93,1 % | 100 % | br. 15, 29 |
| qcm.ts | 100 % | 100 % | 100 % | |
| session.ts | 100 % | 100 % | 100 % | |
| srs.ts | 100 % | 94,62 % | 100 % | br. 23, 31, 41, 49, 72 |
| supabase.ts | 80 % | 50 % | 40 % | 8-10, 27 |

**Lecture honnête du 77 %.** Le périmètre exclut `storage.ts`, `share.ts`, `params.ts`, et surtout tout ce qui n'est pas dans `src/lib` : `AppContext.tsx`, `src/hooks/*` (dont `useRevision.ts`, qui porte la persistance), `src/components/**` (~2 000 lignes). Rapporté aux ~3 260 lignes non-test de `src/`, la couverture réelle est **inférieure à 25 %**. Aucun test de composant, aucun E2E, aucun test RLS, pas de CI : les 72 tests ne tournent que si quelqu'un pense à les lancer.

Ce qui est bien testé : la logique pure (SRS, sessions, QCM, catalogue, règles de saisie admin). `scripts/check_content.py` passe sur les zones 1 à 11 (0 erreur, 0 avertissement) ; il n'existe pas de `cards-12.json` (zone 12 sans questions : à confirmer comme voulu).

## 2. Constats

Sévérités : Bloquant / Majeur / Mineur / Cosmétique. « Reproduit » = sortie du test jetable citée ; « Plausible » = déduit du code, non exécuté.

| ID | Sév. | Fichier:ligne | Constat | Preuve | Test proposé |
|---|---|---|---|---|---|
| QA-1 | Majeur | `src/AppContext.tsx:81-82` | Le jour courant est figé au montage (`useMemo(() => new Date(), [])`). Onglet laissé ouvert après minuit : session du jour calculée sur la veille, séance enregistrée à la mauvaise date, série cassée, nouvelles cartes bloquées. | Reproduit (conséquence) : `QA-3 série mercredi = 0 (attendu 2...)` ; `QA-3b nouvelles le lendemain avec jour figé = 0 ; avec vrai jour = 10` | Unitaire sur un `useToday()` (horloge injectable) + E2E Playwright avec `page.clock` passant minuit |
| QA-2 | Majeur | `src/hooks/useRevision.ts:91-93` | Progression enregistrée par `upsert` de la ligne entière (dernier qui écrit gagne). Deux appareils, ou deux onglets, s'écrasent mutuellement : cartes et XP perdus sans message. | Reproduit (modèle pur) : `QA-5 cartes serveur = [ 'a', 'd' ] xp = 10 (perdu : b, c, xp ordinateur 30)` | Unitaire d'une fonction `mergeProgress(server, local)` (max par carte sur vues, union des séances) ; intégration avec client Supabase simulé |
| QA-3 | Majeur | `src/lib/srs.ts:46-50` + `src/AppContext.tsx:174` | Les entraînements (`theme`, `gaps`, `exam`) notent aussi la répétition espacée, sans limite d'une note par jour. 5 « Su » le même jour : niveau 5, échéance à +60 j. La carte « bachotée » disparaît deux mois. | Reproduit : `QA-2 après 5 Su le même jour [5,20798,5,5,20738] échéance dans 60 jours` | Unitaire : `applyGrade` deux fois le même jour ne monte que d'un niveau (règle à trancher par le PM) |
| QA-4 | Majeur | `src/lib/practice.ts:13,19` | Une carte nouvelle réussie du premier coup (Su) passe au niveau 1, donc est classée « lacune » (`GAP_MAX_LEVEL = 1`). « MES LACUNES » et le compteur de lacunes par zone sont gonflés par des cartes sues. | Reproduit : `QA-1 progress [1,20739,1,1,20738] isGap = true` | Unitaire : carte vue 1 fois, réussie 1 fois, n'est pas une lacune |
| QA-5 | Majeur | `src/lib/adminApi.ts:66-78,110-117` | `update`/`delete` filtrés par RLS ne renvoient pas d'erreur quand 0 ligne est touchée (admin retiré, ligne déjà supprimée par un autre admin) : l'interface affiche un succès. Même chose pour `deleteDocument` puis échec silencieux du retrait du fichier. | Plausible (comportement documenté de PostgREST, non exécuté) | Intégration : `.select()` après update/delete et erreur si tableau vide ; test RLS (voir §4) |
| QA-6 | Majeur | `supabase/migrations/20261012191639_library.sql:76-104` | Aucune politique RLS ni la fonction `is_admin()` n'est testée. Le SQL lu est correct (lecture publique des documents, écriture via `is_admin()` lié à `auth.uid()` et e-mail confirmé, cartes brouillon invisibles aux non-admins, progression limitée à soi). Mais rien n'empêche une régression à la prochaine migration. | Non applicable (absence de test) | Script pgTAP ou SQL `set local role authenticated; set local request.jwt.claims ...` : 12 assertions (§4) |
| QA-7 | Mineur | `src/hooks/useRevision.ts:92` | Seules les 60 dernières séances sont gardées. Avec 2 séances par jour, la meilleure série baisse après rechargement. | Reproduit : `QA-4 meilleure série avant = 40 après rechargement = 30` | Unitaire : stocker les jours actifs (set) séparément des séances |
| QA-8 | Mineur | `src/lib/qcm.ts:21-30` | Carte sans QCM rédigé et zone avec moins de 4 cartes : moins de 4 propositions, jusqu'à une seule (réponse évidente). Un QCM rédigé dont une mauvaise réponse ne diffère que par les accents tombe à 3 propositions. | Reproduit : `QA-6 options = {"options":["Réponse x"],"correct":0}` ; `QA-6b options = 3` | Unitaire : `buildChoices` complète avec d'autres zones ou passe en auto-évaluation sous 4 propositions |
| QA-9 | Mineur | `src/lib/srs.ts:39-42` | `readProgress` ne valide pas `cards` : une entrée corrompue donne des `null` à la note suivante (vues et réussites perdues). | Reproduit : `QA-8 entrée corrompue après note = [3,20745,null,null,20738]` | Unitaire : entrées non conformes ignorées ou réparées |
| QA-10 | Mineur | `src/lib/catalog.ts:14-17` | La cote `Zn·NNN` dépend du rang : retirer un document renumérote les autres. Une cote notée sur papier ou dans un message ne retrouve plus la pièce. | Reproduit : `QA-7 cote pièce 3 avant = Z1·003 après retrait de la pièce 1 = Z1·002` | Unitaire : cote stable (colonne en base) |
| QA-11 | Mineur | `src/hooks/useRevision.ts:178-179` | Enregistrement au `pagehide` par `fetch` asynchrone sans `keepalive` : sur Android, la dernière seconde de notes peut être perdue si l'onglet est tué. `visibilitychange` limite le risque. | Plausible | E2E : noter puis fermer l'onglet, rouvrir, vérifier la progression |
| QA-12 | Mineur | `src/hooks/useRevision.ts:153-171` | Au retour du lien magique, `init()` et `SIGNED_IN` peuvent lancer deux `loadFor` en parallèle ; le second écrase `progRef` par l'état serveur si une note a eu lieu entre les deux. Fenêtre courte. | Plausible | Unitaire du hook avec client simulé (ordre de résolution contrôlé) |
| QA-13 | Mineur | `src/lib/cardRules.ts:29` vs `scripts/check_content.py:18-19` | La normalisation diffère (Python retire tout non-ASCII et `strip`, TS garde `’`, `œ`). Une paire « l’état » / « l'etat » passe dans l'admin et échoue au script, ou l'inverse. | Plausible | Jeu de cas partagé (JSON) lu par les deux implémentations |
| QA-14 | Mineur | `supabase/migrations/...library.sql:85` | La base n'impose que les types du QCM (pas 3 mauvaises réponses distinctes). La validation n'existe que dans l'interface admin. | Plausible (bypass via API par un admin seulement) | Contrainte `check` ou trigger + test SQL |
| QA-15 | Cosmétique | `src/components/library/Apercu.tsx:11` | « Partager » envoie l'adresse de téléchargement (`?download=`) au lieu de la fiche. | Lecture de code | E2E : le lien partagé ouvre l'aperçu |

Vérifié sans défaut : `dayNum` passe bien d'un jour à minuit local (Dakar et Paris : `20818` puis `20819` au 1er janvier) ; `currentZone` borne à 1 avant octobre 2026 et à 12 après septembre 2027 ; `answerCard` ne renote pas la deuxième chance ; `buildChoices` garde toujours la bonne réponse et écarte les doublons sans accents ; `storagePathFor` respecte la regex du bucket.

## 3. Matrice des risques

Probabilité et impact notés 1 (faible) à 3 (fort). Couverture actuelle et test le moins cher pour la porter.

| Risque | P | I | Score | Couverture | Test le moins cher |
|---|---|---|---|---|---|
| R1 Perte de progression (écrasement multi-appareils QA-2, jour figé QA-1, fermeture onglet QA-11) | 3 | 3 | **9** | Non couvert (`useRevision` hors périmètre) | Unitaire `mergeProgress` + horloge injectable ; puis 1 E2E « noter, recharger, retrouver » |
| R2 Fuite ou abus d'accès admin (RLS non testée) | 1 | 3 | **3** à 6 si régression | Non couvert (SQL relu correct) | Script SQL / pgTAP sur base locale `supabase start` : 12 assertions par rôle |
| R3 Répétition espacée erronée (dates, fuseau, changement de jour, bachotage) | 3 | 2 | **6** | Partiel : `srs.ts` 100 % lignes, mais QA-1, QA-3, QA-4 non vus | Unitaires ciblés (3 tests) + `page.clock` en E2E |
| R4 QCM avec mauvaise bonne réponse | 2 | 2 | **4** | Partiel : forme vérifiée (`check_content.py`, `checkCard`), justesse du fond non vérifiable par machine | Relecture humaine par un 2e responsable avant publication (statut brouillon) ; unitaire QA-8 |
| R5 PDF qui ne s'ouvre pas sur Android | 2 | 3 | **6** | Non couvert (`pdf.ts` 20 %, aucun test navigateur) ; repli « Ouvrir le document » présent | E2E Playwright projet `Pixel 5` + réseau `Slow 3G` sur 3 PDF (petit, 20 Mo, scanné) ; test manuel sur un vrai Android d'entrée de gamme |
| R6 Contenu admin invalide publié | 2 | 2 | **4** | Partiel : `checkCard` testé (8 tests), `adminApi` 0 %, succès silencieux QA-5 | Intégration `adminApi` avec client simulé + contrainte SQL QA-14 |
| R7 Lien magique qui échoue | 2 | 3 | **6** | Non couvert (seul `isValidEmail` testé) | Test manuel sur Gmail Android (navigateur intégré), lien ouvert sur un autre appareil, lien réutilisé, lien expiré ; vérifier la liste des URL de redirection Supabase pour chaque domaine (Workers, Pages, Netlify) |

## 4. Plan de test minimal priorisé

Ordre = score de risque, puis coût. Estimation en heures pour une personne.

**P0, avant ouverture (environ 1,5 jour)**
1. Corriger puis tester QA-1 (jour recalculé au retour au premier plan ou à chaque minute) : 1 unitaire + 1 E2E `page.clock`. Rôle : Front. 2 h.
2. Corriger puis tester QA-2 : fusion côté client avant écriture (relire, fusionner, écrire) ou RPC SQL de fusion ; unitaire `mergeProgress` (cas : deux appareils, carte notée des deux côtés, séances en double). Rôles : Back + Front. 4 h.
3. Test RLS en SQL sur base locale, à lancer à chaque migration (Back + QA), 3 h :
   - anon : lit `documents` ; ne lit pas `cards`, `progress`, `revision_content`, `admins` ; ne peut rien écrire ; `is_admin()` = false.
   - utilisateur A : lit sa `progress`, pas celle de B ; ne peut pas insérer une ligne `progress` au nom de B ; ne voit pas les cartes `draft` ; ne peut écrire ni `documents` ni `cards` ni `storage.objects`.
   - admin avec e-mail non confirmé : `is_admin()` = false.
   - admin confirmé : CRUD `cards` et `documents`, upload d'un nom hors regex refusé.
4. Smoke manuel sur un Android d'entrée de gamme en 3G : lien magique de bout en bout, session du jour, ouverture de 3 PDF (dont le plus lourd). 1 h. Rôle : QA.
5. CI minimale (GitHub Actions ou script `npm run check` = typecheck + test + `check_content.py`) : sinon les 72 tests ne protègent rien. Rôle : SRE. 1 h.

**P1, dans les deux semaines**
6. Trancher et tester QA-3 (une seule montée de niveau par carte et par jour, ou entraînement sans effet SRS) et QA-4 (critère de lacune). Unitaires. 1 h.
7. `adminApi` : tests d'intégration avec client simulé, détection des 0 lignes touchées (QA-5). 2 h.
8. E2E Playwright, 3 parcours seulement : bibliothèque (rechercher, ouvrir un PDF, émulation mobile), révision (session du jour avec auth injectée), admin (créer brouillon puis publier). Sélecteurs par rôle, axe-core sur les 3 pages. 1 jour.

**P2, annexe (une ligne par point)**
- QA-7 jours actifs séparés des séances ; QA-8 QCM de repli ; QA-9 validation `readProgress` ; QA-10 cote stable ; QA-11 `keepalive` ; QA-12 garde contre double chargement ; QA-13 jeu de cas partagé TS/Python ; QA-14 contrainte SQL ; QA-15 lien de partage.
- Étendre `coverage.include` à `src/hooks` et `src/AppContext.tsx` pour que le chiffre reflète la réalité.
- Session exploratoire de 60 min : « Explorer la révision sur Android avec mode avion, retour arrière et rotation, pour découvrir des pertes de progression ».

## 5. Critères de release (état)

- [ ] Zéro bloquant, zéro majeur sur un parcours critique : **non** (QA-1, QA-2 touchent la progression ; QA-3, QA-4 faussent la révision).
- [x] Logique pure testée et verte (72/72).
- [ ] Contrôles d'accès vérifiés par rôle : **non**, SQL relu mais non testé.
- [ ] Parcours critiques vérifiés sur appareil cible : **non** (aucun E2E, aucun test Android rapporté).
- [ ] Rollback prêt et testé : non évalué (rôle SRE).
- [ ] Risques résiduels acceptés par écrit par le PM : à faire.

## 6. Verdict

```
Ouverture aux responsables scouts : GO SOUS CONDITIONS
Couverture : logique pure bien testée (srs/session/qcm 100 % lignes) ; persistance, UI, RLS, PDF et auth à 0 % ; couverture réelle < 25 % de src/
Bugs ouverts : bloquants 0, majeurs 6 (QA-1 à QA-6), mineurs 8, cosmétique 1
Recommandation : ouvrir la bibliothèque tout de suite ; ouvrir la révision après les conditions C1 à C4.
```

**Pourquoi pas NO-GO** : aucune faille d'accès trouvée dans le SQL, aucun risque d'argent, données personnelles limitées à l'e-mail et à la progression ; la bibliothèque publique est en lecture seule avec un repli quand l'aperçu échoue.

**Pourquoi pas GO** : la promesse de la révision est la progression. QA-1 et QA-2 la perdent ou la faussent dans des usages normaux (onglet gardé ouvert, téléphone plus ordinateur), sans message à l'utilisateur, et rien ne garde les politiques RLS d'une régression.

**Conditions**
- C1. QA-1 corrigé et testé (unitaire + E2E horloge).
- C2. QA-2 corrigé (fusion) ou, à défaut, limite acceptée par écrit par le PM et message « utilisez un seul appareil » affiché.
- C3. Script de test RLS (§4, point 3) vert sur base locale.
- C4. Smoke manuel Android 3G passé : lien magique, session du jour, 3 PDF.
- QA-3 et QA-4 : décision produit attendue sous deux semaines ; acceptables en ouverture restreinte (quelques dizaines de responsables) s'ils sont listés comme connus.
