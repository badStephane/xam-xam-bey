# 12 : Validation indépendante du lot 3 (QA)

Date : 2026-10-13. Base : branche `feat/lot3` (depuis `65ed46e`), changements non commités du lot 3. Méthode de `09-qa-lot2.md` : les journaux de `05-build.md` sont des affirmations ; seules les sorties ci-dessous valent preuve.

**Hypothèses**
- H1. La pile locale (CLI 2.109.1, ports 553xx) représente la production pour l'Auth, le REST et le stockage. Aucun appel distant ; la production n'a pas été touchée.
- H2. Le fait vérifié par l'orchestrateur (bucket de production : `access-control-allow-origin: *`, Content-Length, `max-age=604800`) vaut pour tous les PDF. Sans lui, aucun PDF ne serait gardé en production (réponse non `cors`).
- H3. Aucun Android réel ni Cloudflare réel : ce qui en dépend est au §4.

**Ajouts du QA** (aucun code applicatif modifié) : `e2e/qa-lot3-sw.spec.ts` (2 tests, build de production servi sur le port 4181, dossier `node_modules/.cache/xxb-e2e-qa-lot3`), `e2e/qa-lot3-session.spec.ts` (8 tests, dont 1 `test.fail` pour L3-5).

## 1. Preuves exécutées

```
npm run typecheck                          -> code 0
npx vitest run --coverage                  -> Test Files 39 passed | 1 skipped (40) ; Tests 450 passed | 5 skipped (455)
  couverture (src/lib + src/hooks)         -> 88,81 % lignes | 93,02 % branches ; session.ts 100 %, sessionStore.ts 97,5 %,
                                              openMode.ts 100 %, cardImportDocs.ts 100 %, xlsxUnzip.ts 100 % lignes
                                              hors périmètre de la config : src/sw/** (rules.test.ts couvre les règles pures),
                                              useOfflineDocs.ts 0 % et pdf.ts 33 % (couverts par l'E2E seulement)
VITE_SUPABASE_URL=https://ci.invalid VITE_SUPABASE_ANON_KEY=ci-anon-key vite build --outDir <scratch>
                                           -> OK ; index 108,90 Ko gzip (plafond 110) ; sw.js « coquille de 7 fichiers »
                                              index.html : préchargement de la police = même fichier haché que la CSS (pas de double
                                              téléchargement) ; 0 occurrence de googleapis dans index.html, planches.html, CSS
npm audit --omit=dev                       -> found 0 vulnerabilities
npm run e2e, passage 1 (suite livrée)      -> 30 passed (1,5 min) ; IM-10 : tâche la plus longue 99 ms (CPU / 4)
npm run e2e, passage 2 (+ qa-lot3-sw)      -> 32 passed (1,5 min) ; IM-10 : 119 ms
npm run e2e, passage 3 (+ qa-lot3-session) -> 40 passed (2,9 min), dont 1 échec attendu `test.fail` (L3-5) ; IM-10 : 128 ms
                                              (une 1re tentative a échoué en bloc : les conteneurs 553xx ont disparu en cours
                                              de route, arrêtés hors de cette session ; pile relancée, passage refait en entier)
qa-lot3-sw.spec.ts --repeat-each=3         -> 6 passed
base après E2E                             -> 0 document et 0 objet de stockage de test restants
```
Pile : `supabase start` bloqué sur le trousseau, `supabase/.temp/project-ref` écarté puis restauré (`cmp` identique), `supabase stop` en fin. Le vite du port 5179 (pid 56612) n'a pas été touché ; 5173 était libre.

**Attaques menées et résultat**

| Zone | Attaque | Résultat |
|---|---|---|
| E1 | Double clic sur Valider puis sur Suivant ; retour Android juste après la correction ; rechargement après la correction | 1 note, 1 carte passée, la séance ne revient pas (QA E2E) ; reprise sans renote (E2E livré). Garde `uiRef` synchrone : un second clic voit l'état déjà noté |
| E1 | Auto-évaluation, « Refaire ces cartes », 2e chance | Lecture : note posée à « Je savais / Je ne savais pas » ; reprise (`REDO`) jamais notée ; 2e passage jamais renoté (`first`) |
| E2 | Séance falsifiée : autre compte, position hors file, note invalide, JSON cassé | Ignorée, clé effacée, 0 erreur de page (QA E2E, 4 cas) |
| E2 | Jour changé, carte dépubliée | `day` figé au démarrage ; carte absente du contenu = séance entière rejetée (lecture + Vitest) |
| SW | Cache des retours d'Auth : `?code=`, `?token_hash=`, `#access_token=` ; REST lu sous contrôle du worker | Aucune entrée REST, Auth, `code=` ni jeton dans les caches `xxb-*` ; `?code=` jamais servi par le worker (QA E2E) |
| SW | `xxb-keep-pdf` avec REST, Auth, `?download=`, `../` et `%2e%2e`, autre bucket, `authenticated/`, autre origine, page du site, `javascript:`, url absente ou non texte | Rien gardé ; le témoin valide est gardé seul (QA E2E). Seules les pages du site (même origine) peuvent écrire au worker ; CSP `script-src 'self'` : pas de script tiers |
| SW | Réponse opaque | Impossible par construction : requête refaite en `mode: 'cors'`, gardée seulement si `type === 'cors'` (`sw.ts:139-140`) |
| SW | Mise à jour, secours `VITE_SW=off` | E2E livrés verts 3 fois : une seule coquille après déploiement, PDF gardés ; secours = 0 worker, 0 cache. `sw.js` en `no-cache` (`_headers`) + `updateViaCache: 'none'` |
| CSP | Diff de `_headers` | Google Fonts retiré de `style-src` et `font-src` ; `font-src 'self' data:` ; rien d'élargi. 0 violation sous la CSP de production (E2E) |
| E5 | Licences, repli | OFL 1.1 des 2 familles dans `public/fonts/`, `font-display: swap`, piles terminées par `system-ui` / `ui-monospace` |
| PDF | Annulation et mémoire | Lecture : `destroy()` au démontage et au changement de fichier, y compris pendant le chargement de pdf.js ; canvas libérés hors marge ; page détruite rattrapée |
| E4 | Admin et scouts | E2E livrés : liens 1 et 4, homonymes et autre zone non reliés, `document_id` vérifié en base ; lien « Ouvrir le document » puis retour à la séance, même après rechargement |
| A11y | Titre, focus, 360 px, confirmation au clavier | Entrée sur CONTINUER ne valide pas la carte, focus rendu à QUITTER, Échap puis Tab puis Entrée quitte, pas de débordement à 360 px (QA E2E) |
| Lots 1-2 | Connexion par code, retour Android, minuit, lien magique, import | Verts aux 3 passages |

## 2. Constats

| ID | Sév. | Où | Constat | Statut | Correctif proposé (rôle) |
|---|---|---|---|---|---|
| L3-1 | Mineur (test) | `src/lib/xlsxUnzip.test.ts:62-64` | Test de durée **instable** : délai mesuré à l'horloge murale (< 1 000 ms). Reproduit : 12 échecs sur 12 avec 12 copies et 2 suites en parallèle (2 290 à 4 436 ms) ; 1 échec sur 2 suites complètes lancées ensemble (1 354 ms). La fabrique du zip de 64 Mo coûte 1 à 7,5 s selon la charge | Reproduit | Retirer l'assertion de durée (la borne réelle est déjà prouvée par le test « octets produits », et la non-congélation par l'E2E IM-10 sous CPU / 4) et ramener le menteur à 16 Mo (2 fois la borne). Variante essayée sous la même charge : **12 sur 12 verts**. (Front admin) |
| L3-2 | Mineur | `src/sw/sw.ts:159-169` | Plafond de 150 Mo dépassable : deux `keepPdf` simultanés (aperçu + demande `xxb-keep-pdf`, ou 2 onglets) font chacun `makeRoom` sans voir l'autre, puis `put`. Dépassement borné par la taille des PDF en cours (≤ ~7 Mo chacun) | Plausible (lecture) | Sérialiser `keepPdf` par une file de promesses dans le worker (Front B) |
| L3-3 | Mineur | `src/sw/sw.ts:126` | `asset()` garde toute réponse 200 sous `assets/`. Sans `404.html`, Cloudflare Pages répond `index.html` en 200 à un ancien fichier haché disparu : ce HTML est gardé comme script jusqu'au déploiement suivant | Plausible (lecture ; Pages non disponible ici) | Ne garder que si `content-type` n'est pas `text/html` (Front B) |
| L3-4 | Mineur | `src/sw/rules.ts:67` | Un lien partagé avec un paramètre externe (`fbclid`, `utm_*`) n'est jamais servi hors ligne (liste blanche stricte, choix sûr pour l'Auth) | Plausible (lecture + Vitest existant) | Accepter aussi `fbclid`, `gclid`, `utm_*` ; garder le refus de `code`, `token_hash`, `error`… (Front B) |
| L3-5 | Mineur | `src/App.tsx:32-35` | Confirmation « Quitter ? » ouverte : les touches 1 à 4 (« Je réponds ») ou 1 à 3 (interrogation) agissent sur la carte et ferment la confirmation ; en interrogation, « 3 » note la personne interrogée | Reproduit (`test.fail` dans `qa-lot3-session.spec.ts`) | Dans `useKeyboard`, si `ui.quitAsk`, n'accepter qu'Échap. `App.tsx` est hors colonne de Front A : arbitrage de l'orchestrateur |
| L3-6 | Mineur | `scripts/upload_documents.mjs:70`, `src/sw/sw.ts:136-137` | PDF gardé en « cache d'abord » sans revalidation : un PDF renvoyé au même chemin par le script (`upsert: true`) reste l'ancien sur les téléphones jusqu'à l'éviction. L'admin n'est pas concerné (`upsert: false`, nouveau chemin) | Plausible (lecture) | Documenter dans 06-ops : toujours un nouveau nom de fichier pour un PDF corrigé (SRE) ; à terme, revalidation en ligne (Front B) |

Aucun bloquant, aucun majeur. Risques suivis sans constat : bundle initial à 108,90 Ko pour un plafond de 110 (marge de 1,1 Ko pour le lot suivant) ; un PDF ouvert lors de la toute première visite, avant que le worker prenne la main, n'est pas gardé (attendu).

## 3. Verdict

```
Release lot 3 : GO avec risques
Couverture : E1, E2, E3, E4, E5, IM-10, UX-13, UX-14, IM-11, audits 22 à 24 vérifiés ; parcours critiques verts (3 passages E2E)
Bugs ouverts : bloquants 0, majeurs 0, mineurs 6 (L3-1 à L3-6)
```

| Risque résiduel | Impact | Mitigation | Accepté par (PM) |
|---|---|---|---|
| L3-1 : test instable dans `npm run check` et la CI | Faux rouge en CI chargée | Correctif du test avant la fusion (recommandé), sinon relancer | à signer |
| L3-2, L3-3, L3-6 : cache du worker | Quelques Mo au-dessus du plafond ; écran cassé sur un vieil onglet (déjà possible avant) ; PDF corrigé non rafraîchi | Procédure de secours `VITE_SW=off` testée ; nouveau nom pour tout PDF corrigé | à signer |
| L3-4, L3-5 | Lien externe non servi hors ligne ; raccourci clavier pendant la confirmation (ordinateur seulement) | Lot suivant | à signer |
| Android réel et Cloudflare non testés ici | Comportement du worker sur l'appareil cible | Checklist §4 avant l'annonce (06-ops M5) | à signer |

Recommandation : fusionner après correction de L3-1 (test seul, 10 minutes) ; L3-2 à L3-6 au lot suivant.

## 4. À vérifier par l'utilisateur sur Android après le déploiement (06-ops M3 à M5)

Chrome Android, téléphone d'entrée de gamme, compte de test.
1. **Inscription** : ouvrir le site en ligne, attendre 10 s, ouvrir 2 PDF avec « Ouvrir ↗ » (lecteur du téléphone), revenir au site : la mention HORS LIGNE apparaît sur les 2 fiches (sinon, H2 est fausse : noter l'en-tête CORS du bucket).
2. **Hors ligne réel** : fermer Chrome (glisser l'onglet hors des récents), passer en **mode avion**, rouvrir le site depuis l'historique ou le favori : la bibliothèque s'affiche avec le bandeau « Les documents déjà ouverts sur cet appareil restent lisibles » ; les 2 PDF s'ouvrent dans l'aperçu du site ; un PDF jamais ouvert affiche « Hors réseau : pas encore ouvert sur cet appareil », sans lien.
3. **Lien partagé** : en mode avion, ouvrir `https://xam-xam-bey.pages.dev/?screen=revision` : servi. Un lien avec `?fbclid=…` ne l'est pas (L3-4, attendu).
4. **Révision** : mode avion coupé, répondre à une carte, voir la correction, recharger tout de suite : la réponse compte une fois (E1) ; recharger au milieu de la séance : elle reprend sur la même carte (E2).
5. **Mise à jour du worker** : au premier déploiement suivant qui change le code (un build identique garde la même version, rien ne bouge), ouvrir le site **une fois** en ligne, puis le recharger : la nouvelle version s'affiche (un texte modifié, ou `chrome://serviceworker-internals` : une seule entrée active pour le site, version récente). Les 2 PDF restent lisibles en mode avion.
6. **Si le site reste figé sur une ancienne version** ou boucle au rechargement : appliquer la procédure de secours (`05-build.md`, Lot 3 > Front B ; 06-ops M), puis sur ce téléphone : Paramètres des sites > le site > Effacer, **après** une synchronisation en ligne des notes.

## 6. Après corrections (orchestrateur, 2026-10-13)

- Corrigés : L3-1 (test sans horloge réelle), L3-3 (types de fichiers gardés), L3-4 (paramètres de suivi), L3-5 (raccourcis inactifs pendant la confirmation, `test.fail` retiré), L3-6 (revalidation HEAD en ligne ; consigne « nouveau nom » dans 06-ops J2b). Test « secours » fiabilisé (purge différée, 5/5).
- Accepté : L3-2 (dépassement ponctuel du plafond en cas de mises en cache simultanées).
- Vérifié par l'orchestrateur : typecheck OK, Vitest 467 verts, build OK, index 108,89 Ko gzip. E2E complet : preuve attendue de la CI de la PR (poste local très chargé par des processus tiers).
- Verdict : **GO sous condition de CI verte sur la PR**, puis 06-ops §M ; vérifications Android du §4.
