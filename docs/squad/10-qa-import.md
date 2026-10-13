# 10 : Validation indépendante de l'import Excel (QA, P7)

Date : 2026-10-13. Base : branche `feat/import-excel` (`091ab92`) avec les changements non commités. La section « Import Excel » de `05-build.md` est traitée comme une liste d'affirmations ; seules les sorties ci-dessous valent preuve.

**Hypothèses.** H1 : la pile locale (CLI 2.109.1, ports 553xx) représente la production pour le SQL et la RLS. H2 : ni Excel ni LibreOffice sur le poste. La deuxième lecture du modèle est faite avec openpyxl 3.1.5, dans un venv jetable du scratchpad. H3 : la CSP de production est celle de `public/_headers`. Pour l'E2E, seule sa directive `script-src` est rejouée.

**Ajouts du QA** (aucun code applicatif modifié) : `src/lib/qaImport.test.ts` (15 tests), `src/lib/__fixtures__/qa/` (générateur openpyxl et 8 classeurs), `e2e/qa-import.spec.ts`, `e2e/qa-import-csp.spec.ts`, `e2e/qa-import-scout.spec.ts`, `e2e/qa-import-helpers.ts`, `e2e/fixtures/qa/` (2 classeurs). Les `test.fails` et `test.fail()` marquent des défauts ouverts : ils passent au rouge une fois le défaut corrigé, il suffit alors de les retirer.

## 1. Preuves exécutées

```
npm run typecheck                    -> code 0 (et tsc strict sur les 4 fichiers e2e/qa-* : code 0)
npx vitest run                       -> Test Files 31 passed | 1 skipped ; Tests 306 passed | 5 skipped
                                        (avant ajout QA : 30 fichiers, 291 tests, conforme à 05-build)
couverture (nouveaux fichiers)       -> cardImport 100 % lignes / 99,1 % branches ; cardImportFlow 100/100 ;
                                        cardRules 100/97,7 ; xlsxRead 87,5 (l. 16-17, échec du chunk) ; adminApi 83,3
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=dummy npm run build -> OK
   index 370,44 / 104,89 kB gzip ; CardsImport 10,26 / 4,35 ; read-excel-file 61,39 / 17,72 ; index.html ne précharge que index et client
npm audit --omit=dev                 -> found 0 vulnerabilities
npm run e2e (pile 553xx, 360 px)     -> 17 passed (11 existants + 6 QA, dont IM-5 en échec attendu) ; 0 ligne [QA]/[E2E] restante
axe-core 4.14 (injecté, hors projet) -> 0 violation WCAG 2.1 AA : panneau, aperçu, aperçu sombre ; scrollWidth 360 partout
```
Démarrage : `supabase/.temp/project-ref` mis de côté pendant `supabase start`, puis restauré (`cmp` identique) ; `supabase stop` à la fin. Pile 543xx (eventwebsite) non touchée.

**Modèle `public/modele-questions.xlsx`.** `zipfile.testzip()` OK. 7 parties, XML bien formé partout. `[Content_Types]` déclare workbook, sheet1, sharedStrings et styles. Les relations `_rels/.rels` et `workbook.xml.rels` sont complètes. Les styles contiennent fonts, fills (none et gray125), borders, cellStyleXfs et cellXfs. Relecture par openpyxl : feuille « Questions » A1:I2, volet figé en A2, en-têtes exacts, ligne d'exemple lue. Le script `make_import_xlsx.py`, rejoué dans le scratchpad, redonne les 3 fichiers à l'octet près (déterministe). Réserve : openpyxl signale « no default style » (pas de `<cellStyles>`), voir IM-9.

**Classeurs « comme Excel » (openpyxl : inlineStr, styles, nombres, dates).** En-têtes placés en ligne 3 et décalés en colonne B, avec une colonne en double et une colonne inconnue : les numéros de ligne Excel sont exacts. Zones lues : `3` (nombre), `3.0`, `"3"` et `"3"` suivi d'une espace insécable sont acceptées. `"3,0"`, une date et `12.5` sont refusées avec un message clair. Emojis et arabe sont conservés. Une date dans la Réponse devient `1907-08-01`. `0.1+0.2` devient `0.3`. Une formule avec valeur en cache est lue. Une formule sans cache ou une cellule `#DIV/0!` donnent une erreur de ligne, pas un échec du fichier. Un `.xls` renommé produit le message dédié. 1 000 lignes : import réel en une requête, positions de fin de zone continues (E2E). 1 001 lignes : refus, rien en base. Double clic sur « Importer » : 1 seul POST, 2 lignes (E2E). Échec base (403) : déjà couvert par l'E2E du build, revu. Côté scouts : la Session « Je réponds » sur une carte sans QCM est vérifiée par l'E2E (IM-6). Fiches et le mode « J'interroge » ne lisent pas `qcm` (revue de code).

## 2. Constats

| ID | Sév. | Où | Statut | Constat | Correctif proposé (rôle) |
|---|---|---|---|---|---|
| IM-5 | **Majeur** | `public/_headers:6` ; `xlsxRead.ts:20` | Reproduit (E2E `qa-import-csp`) | Quand une partie du zip dépasse 512 Kio décompressée, fflate décompresse dans un Worker `blob:`. `script-src 'self'` sans `worker-src` l'interdit : Chrome journalise « Creating a worker from 'blob:…' violates … » et l'écran reste sur « LECTURE DE « big.xlsx »… » sans fin, champ fichier désactivé. Témoin sans CSP : 900 lignes lues. Un classeur réaliste de 600 à 1 000 questions avec QCM dépasse ce seuil (fichier de test : 205 Ko, feuille de 971 Kio). | SRE : ajouter `worker-src 'self' blob:` à la CSP. Front : borner `readFirstSheet` par un délai (30 s) avec message d'erreur. Puis retirer `test.fail()`. |
| IM-1 | **Majeur** | `cardImport.ts:118`, `cardRules.ts:33-42` vs `:55` ; publication sans contrôle `CardsAdmin.tsx:109` | Reproduit (unitaire, 3 cas) | L'import n'applique que `readQcm` ; l'éditeur ajoute le contrôle « deux propositions identiques » (`norm`). L'import accepte donc `Paris / paris`, `B / B`, ou `A / A,B` (la mauvaise égale à la bonne est retirée sans rien dire). Cela contredit la décision PM « même règle ». Côté scouts, `Paris / paris` n'affiche qu'**une** proposition. Le bouton « Publier » de la liste ne vérifie rien, donc ces questions peuvent partir en ligne. | Front : déplacer le contrôle de doublons (`norm`) dans `readQcm`, pour que l'éditeur et l'import aient la même règle, puis passer les 3 `test.fails` IM-1 en `test`. |
| IM-6 | Mineur | `qcm.ts:21` | Reproduit (E2E `qa-import-scout`) | Une carte sans QCM, publiée seule dans sa zone (la zone 12 n'a aujourd'hui aucune carte publiée), donne un QCM à **une** proposition, forcément juste, qui rapporte de l'XP. Avant ce lot, l'éditeur imposait un QCM, ce cas n'existait pas. | PM : choisir entre compléter avec des réponses d'autres zones quand il y a moins de 3 leurres, et basculer la carte en auto-évaluation. Front ensuite. |
| IM-2 | Mineur | `cardImportFlow.ts:35-39` ; `library.sql:80` (pas d'unicité) | Reproduit (unitaire, entrelacement forcé) | Deux admins qui importent le même fichier au même moment : les deux relectures précèdent les deux insertions. Résultat : question en double et position 8 attribuée deux fois. Il n'y a pas de collision d'identifiant (clé primaire, insertion tout ou rien). | Back : RPC `import_cards` transactionnelle (verrou par zone, doublons et positions calculés en base) ou index unique `(zone, position)`. Probabilité faible. |
| IM-3 | Mineur | `cardImport.ts:72`, `:99` | Reproduit (unitaire) | Une ligne vide dans les 9 colonnes du modèle mais remplie dans une colonne inconnue (commentaire, formule tirée vers le bas) est signalée « Zone vide. Question vide. Réponse vide. ». Elle compte aussi dans la limite de 1 000 lignes. | Front : tester la ligne vide sur les seules colonnes reconnues. |
| IM-4 | Mineur | `CardsImport.tsx:102` ; `fetchTimeout.ts:2` (15 s) | Plausible (unitaire simulé) | Si la base valide l'insertion mais que la réponse se perd (délai de 15 s, envoi lent de 1 000 lignes sur un réseau mobile), l'écran affirme « Aucune question n'a été importée ». Le réessai se corrige tout seul (tout passe en doublon). | Front : pour une erreur réseau ou un délai, écrire « Résultat incertain : rechargez la liste avant de réessayer ». |
| IM-7 | Mineur | `make_import_xlsx.py:20-23` | Reproduit (unitaire existant) | La ligne d'exemple du modèle (« Quelle est la devise des scouts ? », source inventée « Livre du scoutisme ») est une ligne valide. Si l'admin ne l'efface pas, elle est importée en brouillon dans la zone 01. | Front : marquer l'exemple (par exemple « [EXEMPLE] … ») et l'ignorer à l'import, ou le placer dans une 2e feuille. |
| IM-8 | Mineur | `xlsxRead.ts:20` ; `cardImport.ts:106` | Reproduit (Node) | Aucune borne sur la taille décompressée. Une bombe de 1,5 Mo (1,5 Go d'espaces) est lue en 3,9 s avant l'erreur « Cannot create a string longer… », avec le message « Fichier illisible ». Une feuille de 180 000 lignes de 2,0 Mo est analysée en entier (1,3 s, 285 Mo) avant le refus « 1 000 au plus ». Le risque reste local à l'onglet d'un admin. | Front : lire les tailles du répertoire central du zip avant la décompression (plafond de 20 Mo). |
| IM-9 | Cosmétique | `make_import_xlsx.py` (styles) ; `cardImport.ts:66-69`, `:85` | Plausible / reproduit | Le modèle n'a pas de `<cellStyles>` (Normal) et Excel peut proposer une réparation, ce qui reste à vérifier au §4. Un booléen s'affiche `true` au lieu de VRAI. Une cellule `#DIV/0!` donne « Réponse vide ». Quand une feuille de consignes est placée en premier, le message ne cite pas « première feuille ». | Front : ajouter `cellStyles` au générateur, préciser les messages. |

Points revus sans défaut : RLS (insertion réservée à `is_admin()`), aucun `dangerouslySetInnerHTML`, chargement à la demande vérifié par l'E2E, `document_id` null, statut `draft`, `qcm = null` accepté par la contrainte SQL, réenregistrement depuis l'éditeur sans QCM (E2E du build).

## 3. Verdict de la recette 1 (remplacé par le §5)

**NO-GO.** Les critères d'acceptation sont tenus sur les petits fichiers, mais deux défauts majeurs touchent le parcours principal. IM-5 bloque en production l'import des gros classeurs, sans aucun message. IM-1 viole la règle QCM décidée par le PM et peut publier un QCM à une seule proposition. Les deux correctifs sont petits, estimés à une demi-journée avec leurs tests : une directive CSP plus un délai, et le contrôle de doublons déplacé dans `readQcm`. Après correction et passage au vert de `qa-import-csp` et de `qaImport` (IM-1), on peut passer en GO avec risques. Les mineurs IM-2, IM-3, IM-4, IM-6, IM-7 et IM-8 sont à accepter par écrit par le PM, ou à corriger.

## 4. À vérifier à la main par l'utilisateur

1. Ouvrir `public/modele-questions.xlsx` dans Excel (Windows ou Mac) **et** dans Google Sheets : aucune demande de réparation, en-têtes en gras, ligne 1 figée.
2. Supprimer la ligne d'exemple, saisir 3 questions : une avec QCM complet, une avec 1 seule mauvaise, une sans QCM. Taper la zone au clavier (`3`) et coller un texte contenant un emoji.
3. Enregistrer en .xlsx : dans Excel avec « Enregistrer », dans Google Sheets avec « Télécharger > Microsoft Excel ». Importer dans l'admin de **production** (après IM-5) : 3 lignes valides, puis « 3 questions importées en brouillon ». Contrôler les 3 brouillons dans l'éditeur.
4. Après correction d'IM-5, importer un classeur réel de plus de 600 lignes en production et vérifier que l'aperçu s'affiche.

## 5. Recette 2 (après « Correctifs après la recette QA » de 05-build.md)

**Mes tests modifiés par le Front, relus.** Ces modifications ne les affaiblissent pas. « Paris / paris » vérifie maintenant le refus à l'import, et qu'une donnée ancienne de ce type passe en auto-évaluation (`options = []`) au lieu d'afficher un QCM à une proposition. « Carte seule » couvre les trois branches : leurres pris dans la zone, leurres pris dans les autres zones, aucun leurre. Le constat E2E IM-6 vérifie maintenant 4 propositions en zone 12, ce qui correspond au comportement corrigé.
J'ai renforcé trois points :
- Propriété IM-6 : 2 000 tirages aléatoires (doublons, casse, QCM rédigés dégénérés). Résultat toujours de 0 ou d'au moins 2 propositions, toutes distinctes, avec la bonne réponse présente.
- Spec CSP : elle vérifie en plus qu'aucun Worker n'est créé et qu'aucune violation CSP n'est journalisée.
- Nouvel E2E « zone isolée ». Toutes les autres cartes publiées repassent en brouillon pendant le test, puis sont restaurées (665 publiées avant et après). Il vérifie l'auto-évaluation : pas de radiogroup, les touches 1 et Entrée ne sautent pas l'étape, « Voir la réponse » affiche la réponse, le focus va sur « Je savais », et ce bouton note la carte.
J'ai aussi mis à jour l'intitulé du test IM-4 au niveau du flux. IM-2 reste un `test.fails` (accepté par le PM).

```
npm run typecheck                    -> code 0 ; tsc strict sur e2e/qa-import* -> code 0
npx vitest run                       -> Test Files 31 passed | 1 skipped ; Tests 326 passed | 5 skipped
couverture                           -> cardImport 100 % ; cardImportFlow 100 ; cardRules 100 ; qcm 100 ; xlsxRead 85,7 (chemins d'erreur de chargement)
build (variables factices)           -> OK ; index 105,43 kB gzip ; à la demande : CardsImport 4,95, read-excel-file 14,15, fflate 12,33 ; préchargés : index et client seulement
npm audit --omit=dev                 -> found 0 vulnerabilities
npm run e2e (pile 553xx)             -> 20 passed (dont qa-import-csp sans test.fail, qa-import-scout 2 tests) ; 0 ligne [QA]/[E2E] restante
modèle (openpyxl)                    -> 2 feuilles « Questions » (en-têtes seuls) et « Exemple » ; plus d'alerte « no default style »
```
project-ref mis de côté puis restauré (`cmp` identique), `supabase stop` fait, pile 543xx intacte (11 conteneurs).

**Points sensibles vérifiés.**
- **IM-5, corrigé.** Classeur de 1 000 lignes réalistes (230 Ko, réponses de 60 mots, QCM complet) lu sous la CSP de production : 0 Worker. À vitesse CPU normale, l'aperçu s'affiche en 167 ms. Avec un CPU ralenti 4 fois (proche d'un mobile), il faut 442 ms au total, la tâche bloquante la plus longue dure 136 ms et l'ensemble des tâches longues 472 ms. L'onglet n'est jamais gelé de façon perceptible.
- **IM-8, corrigé pour une bombe honnête, avec une réserve.** Bombe de 1,5 Mo annonçant 1,5 Go : refus `tooBig` en 99 ms, 4 Mo de mémoire. Feuille de 180 000 lignes : refus en 16 ms.
  Réserve **IM-10 (Mineur, reproduit en Node)** : un zip qui **ment** sur sa taille (répertoire central et en-tête local patchés à 2 000 octets) passe la borne. fflate décompresse alors dans un tampon de taille fixe : la mémoire reste bornée (RSS 62 Mo), mais le CPU tourne 5,4 s sur le fil principal, puis le message affiché est « Fichier illisible ». Il faut le fabriquer volontairement, et seul l'onglet de l'admin est touché. Correctif possible : décompresser par flux (`Unzip`/`Inflate` de fflate) et arrêter au-delà de 20 Mo réels.
- **IM-1, corrigé.** La règle unique (`readQcm` avec `norm`) est vérifiée par les 3 cas, et la publication depuis la liste est refusée (E2E du Front, rejoué).
- **IM-3, IM-4, IM-7, IM-9, corrigés.** Les tests passés de `test.fails` à `test` sont verts, l'E2E « résultat incertain » est vert, le modèle est relu.
- **Aucune régression.** Session QCM normale (`qcm.test`, E2E midnight-back), éditeur (réenregistrement sans QCM, refus des doublons), Fiches et mode « J'interroge » non concernés.

**Nouveaux constats.**
- IM-10 (Mineur) : voir la réserve d'IM-8 ci-dessus.
- IM-11 (Cosmétique, `Session.tsx`, dernière ligne) : en auto-évaluation, l'aide clavier affiche encore « 1 À 4 : CHOISIR · ENTRÉE : VALIDER ». Les touches ne font rien, sans effet nuisible.
- Point de vigilance PM : « Je savais » rapporte l'XP d'un Su sur simple déclaration. Ce comportement est voulu, mais il n'existe que dans les zones sans aucun leurre.

**Verdict final : GO avec risques.** Couverture : 9 constats sur 9 traités (8 corrigés, IM-2 accepté), parcours critiques verts, 0 bloquant, 0 majeur ouvert.

| Risque résiduel | Impact | Mitigation | Accepté par (PM) |
|---|---|---|---|
| IM-2 import concurrent | Doublon, position ex aequo | Moins de 5 admins, `test.fails` en place | Oui (orchestrateur, recette 2) |
| IM-10 zip menteur | 5 s de gel, onglet admin seulement | Décompression par flux, au prochain lot | À confirmer |
| Excel et Google Sheets réels non testés | Demande de réparation possible | §4 à faire avant l'annonce aux admins | À confirmer |

Le §4 reste à faire par l'utilisateur. Le point 1 doit maintenant aussi vérifier que l'onglet « Exemple » n'est pas importé.
