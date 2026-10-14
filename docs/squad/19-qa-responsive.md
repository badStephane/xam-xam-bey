# 19 · QA responsivité (production lot 5)

Date : 14 octobre 2026 · Rôle : QA · Code audité : branche `feat/lot5` (commit 80c0f81, identique à `main`).
Verdict : **GO avec risques**. Aucun bloquant, 2 majeurs (barre du bas sous 360 px, zoom 200 %), 8 mineurs ou cosmétiques.

## Hypothèses et méthode

- Pas de pile Supabase (Docker figé). Vite dev sur le port 5191 avec `VITE_SUPABASE_URL=http://127.0.0.1:59999` (hôte factice) ; toutes les requêtes vers cet hôte sont servies par `page.route` : session simulée dans `localStorage`, `progress`, `revision_content` et `cards` tirés de `data/seed`, `documents` tiré de `data/catalog.site.json`, RPC `is_admin`, `get_league_state` (états active, vide, pending, no_pseudo), `set_pseudo` en erreur (PSEUDO_TAKEN), `admin_list_pseudos`, `admin_list_blocked_words`. Séance, auto-évaluation et J'interroge : mode `?demo=1`. Hors ligne : `context.setOffline(true)` après chargement.
- Chromium seul (Playwright 1.64), une page à la fois, `isMobile` et `hasTouch` sous 760 px.
- Largeurs : 320×568, 360×740, 390×844, 412×915, 768×1024, 1024×768, 1440×900, paysage 740×360, et « z200 ».
- **z200** = 360 px à 200 % de zoom navigateur, soit 180 px CSS. La variante « font-size racine doublée » est sans effet : toutes les tailles de police du projet sont en `px` (voir R-8).
- Clavier virtuel : simulé en réduisant la hauteur de la fenêtre de 45 % une fois le champ ciblé (e-mail, code, pseudo). L'émulation ne reproduit pas exactement iOS ni le mode `resizes-visual` de Chrome Android.
- Contrôles automatiques sur chaque capture : défilement horizontal (document **et** `#app`), éléments hors écran, textes coupés, chevauchements, cibles < 44 px, police < 12 px, barre du bas qui masque un élément, confirmations hors écran. Puis relecture visuelle des écrans clés.
- **Piège de mesure** : `#app{overflow-x:clip}` (app.css l. 9) masque tout débordement. `document.scrollWidth` ne dépasse donc jamais la fenêtre : le contenu trop large est coupé sans possibilité de défiler. Le premier passage n'avait rien trouvé pour cette raison ; le second mesure les éléments sans tenir compte de `#app`.
- Scripts et captures (hors dépôt) : `/private/tmp/claude-502/-Users-stephane-Documents-xam-xam-bey/e7673be7-d264-4bda-8028-00ef4114cfcc/scratchpad/responsive/` (ci-dessous `SP/`). Captures pleine page `SP/shots/<écran>@<largeur>.png`, extraits `SP/crops/`, mesures `SP/results-all.json`.

## Défauts

| ID | Écran | Largeur | Sévérité | Description | Fichier / sélecteur probable | Capture |
|---|---|---|---|---|---|---|
| R-1 | Barre du bas (tous les écrans avec BottomNav) | 320 (et < 360) | Majeur | La grille a une largeur minimale de 360 px (chaque colonne prend la largeur de son libellé). À 320 px, PROGRÈS occupe 292 à 360 px : il reste 28 px visibles, le libellé affiche « PRO ». PLAN est réduit à 43 px de large. | `app.css` l. 326 `.bottom-nav{grid-template-columns:repeat(5,1fr)}` | `SP/crops/biblio@320.png`, `SP/crops/kb-code-320.png` |
| R-2 | Navigation et contenu à zoom 200 % | z200 | Majeur | Reflow non tenu (WCAG 1.4.10), et le contenu coupé est inatteignable à cause de `overflow-x:clip`. Barre du bas : seuls BIBLIOTHÈQUE et une partie d'AUJOURD'HUI sont visibles. Aujourd'hui : carte « S'entraîner à la carte » de 276 px pour 180 px disponibles. Plan : cartes de mois de 250 px. Connexion : champ e-mail et bouton coupés. Aperçu plein écran : 2e bouton hors écran. Bibliothèque : libellés des chiffres superposés (« PIÈCESZONES ESSENTIMO »). Badges : 2e colonne coupée. Puces PROGRESSION · LIGUE · BADGES : LIGUE (active) coupée et BADGES hors champ. | `.duo` l. 169, `.months` l. 232, `.cadence` l. 242, `.two` l. 153, `.stats` l. 101, `.badge-grid` l. 361, `.gate .stack` | `SP/crops/z200.png`, `SP/crops/biblio@z200.png`, `SP/crops/ligue@z200.png` |
| R-3 | Progrès, liste des lacunes par zone | 320 | Mineur | La colonne « 40/60 VUES » tombe à 0 px de large (`minmax(0,1fr)` alors que le bouton « 8 LACUNES → » est en `auto`) et son texte recouvre « 100 % ». À 360 px, la colonne fait 39 px et passe sur 2 lignes. | `app.css` l. 298 `.gap-row` | `SP/crops/zoom2.png`, `SP/shots/progres@320.png` |
| R-4 | Séance, Fin, Connexion, Ligue vide ou pending | toutes, surtout ≤ 412 | Mineur | La page fait toujours au moins 1400 px de haut, car le fond topographique est en `height:1400px`. Sur un téléphone de 568 px de haut, on peut défiler environ 830 px de vide sous la carte de séance. | `app.css` l. 10 `#topo` | `SP/shots/session-qcm@320.png` (h=1400) |
| R-5 | Séance QCM | paysage 740×360 | Mineur | Le bouton Valider est à y ≈ 550 pour 360 px de hauteur : il faut défiler à chaque question, et la confirmation « Quitter ? » repousse la carte encore plus bas. | `.sess`, `.qcard` (aucune règle pour les hauteurs basses) | `SP/crops/session-qcm@land.png` |
| R-6 | Aujourd'hui, Plan, Fiches, Progrès hors réseau | toutes | Cosmétique | Le bandeau « HORS RÉSEAU » touche le surtitre « MERCREDI 14 OCTOBRE » : le trait pointillé du bas frôle le texte. `.banner` n'a pas de marge basse, contrairement à `.warn-inline` qui a 14 px. | `app.css` l. 103 `.banner`, `RevisionArea.tsx` | `SP/crops/zoom1.png` |
| R-7 | Cibles tactiles | voir détail | Mineur | « Fermer l'aperçu » mesure 36×36 (panneau latéral, ≥ 768 px). La case « Essentiel du mois » (Admin > Documents) a un libellé de 26 px de haut. PLAN mesure 43 px de large à 320 et 360 px (voir R-1). | `PreviewPanel.tsx`, `DocsAdmin.tsx` | `SP/shots/biblio-apercu-lateral@768.png`, `SP/crops/contact3.png` |
| R-8 | Polices | toutes | Mineur | Le projet fixe la règle « pas de texte d'information sous 11 px » (app.css l. 312). Textes qui ne la respectent pas : `.xp-row` (le style en ligne `fontSize: 10.5` dans `Shell.tsx` écrase la règle CSS), zones de la liste des lacunes (10.5), légende de la courbe (10.5) et légende des niveaux (10) dans `Progress.tsx`, « ! VIGILANCE » (10), bouton MASQUER (10), `.tag-resp` (10), `.days span` (10). Toutes les tailles étant en `px`, la taille de police choisie dans le navigateur n'a aucun effet. | `Shell.tsx`, `Progress.tsx`, `Session.tsx` | `SP/results-all.json` (clé `tiny`) |
| R-9 | En-tête non connecté | 320 | Cosmétique | Le nom de marque est tronqué en « XAM XAM … » à cause du compteur « 0/170 PIÈCES ». | `.brand-name` l. 316, `.who` | `SP/crops/biblio@320.png` |
| R-10 | Bibliothèque, lignes de document | ≤ 412 et ≥ 768 (panneau) | Cosmétique | `.d-meta` coupe le fonds par une ellipse (« BASES GÉNÉRA… »). Le texte reste complet dans l'aperçu. | `app.css` l. 135 | `SP/crops/biblio-apercu-lateral@768.png` |

## Statut des correctifs (Front, 14 octobre 2026, branche `feat/sombre-par-defaut`)

Vérifié en rejouant l'audit de la QA (mêmes 27 écrans, mêmes 9 tailles) en thème sombre, puis en clair sur 5 tailles. L'audit mesure maintenant contre la largeur cible (en émulation mobile, Chrome élargissait la fenêtre de mise en page jusqu'au contenu trop large, ce qui masquait les débordements à z200). Détail technique : `05-build.md`, section « Responsivité ».

| ID | Statut | Correctif |
|---|---|---|
| R-1 | Corrigé | Colonnes `minmax(min-content,1fr)`, cases ≥ 44 px ; sous 360 px, libellés BIBLIO, JOUR, PLAN, FICHES, PROGRÈS (`aria-label` complet) ; à 320 px, cases de 64 px ; de 360 à 399 px, libellés complets sans espacement de lettres (serrés, à revoir par le Design). |
| R-2 | Corrigé | `#app{overflow-x:clip}` retiré ; grilles `min(Npx,100%)`, règles `@container (max-width:260px)`, barre du bas sur deux lignes sous 300 px. Contrôle automatique : `e2e/responsive.spec.ts`. |
| R-3 | Corrigé | Lacunes par zone sur deux lignes sous 420 px (trois sous 260). |
| R-4 | Corrigé | Fond topographique dans un cadre coupé à la hauteur de la page (`#topo-clip`). Séance QCM à 320 px : 769 px de haut au lieu de 1400. |
| R-5 | Corrigé | Paysage bas : QCM sur deux colonnes, Valider collé en bas de l'écran. |
| R-6 | Corrigé | Marge de 14 px sous le bandeau hors réseau. |
| R-7 | Corrigé | Fermer l'aperçu 44×44, « Essentiel du mois » 44 px de haut, MASQUER 44 px. |
| R-8 | Corrigé | Aucun texte sous 11 px ; toutes les tailles de police en `rem` (la taille choisie dans le navigateur s'applique). |
| R-9 | Corrigé | La marque passe à la ligne, plus de troncature. |
| R-10 | Corrigé | `.d-meta` passe à la ligne au lieu de l'ellipse. |
| Admin > Questions | Corrigé | 50 questions puis « Afficher 50 de plus (N restantes) ». |

Résultat de l'audit après correctifs : 0 défilement horizontal, 0 élément hors écran, 0 texte coupé, 0 cible < 44 px, 0 texte < 11 px, 0 bouton masqué par la barre du bas, sur les 243 captures en sombre et les 135 en clair (320, 360, z200, paysage, 1440) ; idem à 320 et 360 px avec une police de navigateur à 20 px (54 captures). Aucune erreur JavaScript. Restent signalés et écartés : chevauchements de textes en ligne (faux positifs déjà notés en annexe) et Valider collé au-dessus de la proposition D en paysage (voulu, la proposition reste atteignable en défilant).

## Règles CSS proposées (à valider par le Front ; aucun correctif écrit dans `src/`)

- **R-1** : `.bottom-nav{grid-template-columns:repeat(5,minmax(0,1fr))}` et `.bottom-nav button{min-width:0;padding:0 2px;text-align:center;overflow-wrap:anywhere}`. Sous 360 px, il faut en plus des libellés courts (« BIBLIO », « JOUR ») ou un libellé sur 2 lignes : le choix revient au Design.
- **R-2** : `.duo{grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))}` et `.duo>*{min-width:0}`. Même principe avec `min(250px,100%)` pour `.months` et `min(220px,100%)` pour `.cadence`. Ajouter `@container (max-width:260px){.two,.stats,.badge-grid{grid-template-columns:1fr 1fr}}` (1 colonne pour `.two`). À plus long terme, remplacer `#app{overflow-x:clip}` par une correction à la source, pour que les débordements restent visibles en recette.
- **R-3** : `.gap-row{grid-template-columns:62px minmax(max-content,1fr) 52px auto}`, ou sous 360 px `.gap-row>button{grid-column:1/-1}`.
- **R-4** : `#app{overflow:clip}` (sur les deux axes ; `#app` grandit avec son contenu, seul le fond est coupé).
- **R-5** : `@media (max-height:420px) and (orientation:landscape)` : réduire les marges de `.qcard` et les propositions sur 2 colonnes, ou bouton Valider collant en bas de carte.
- **R-6** : `.banner{margin-bottom:14px}` dans le contexte de révision.
- **R-7** : `.icon-btn` du panneau à 44×44 ; libellé de case à cocher en `min-height:44px;display:flex;align-items:center`.
- **R-8** : retirer `fontSize: 10.5` en ligne de `.xp-row` et relever les 10 px à 11 px. Passer progressivement en `rem` (hors périmètre de ce lot).

## Écrans vérifiés sans défaut propre (en dehors de R-1, R-2, R-4 et R-8, qui sont transverses)

- Bibliothèque : recherche (`q=baden`), catalogue, filtres (puces défilantes, itinéraire défilant volontairement), aperçu latéral à 768, 1024 et 1440 px, aperçu PDF plein écran (le PDF tient dans la largeur, aucun débordement de 320 à 1440 px), bandeau hors réseau.
- Révision non connectée : formulaire e-mail, écran « Ouvrez le lien reçu » avec code en erreur (« Code incorrect ou expiré »), bouton « Renvoyer dans 59 s ». Avec le clavier simulé, le champ et le bouton restent visibles au-dessus de la barre (320 et 360 px).
- Aujourd'hui avec le bloc « Cette semaine », de 320 à 1440 px (en deux colonnes à partir de 1024).
- Séance : QCM, correction, deuxième chance, J'interroge, confirmation « Quitter ? » (bloc dans la page, jamais hors écran, focus sur CONTINUER).
- Fin de séance : bilan démo, puis vraie séance jouée avec la ligue en `no_pseudo`. L'invitation « Rejoindre les ligues » et le formulaire de pseudo en erreur (« Ce pseudo est déjà pris. Essayez Ibrahima2. ») restent lisibles de 320 à 1440 px. Avec le clavier simulé, le champ, l'erreur et les deux boutons tiennent dans la hauteur restante.
- Plan, Fiches (documents cités, puces de mois défilantes), Badges, Progrès avec puces PROGRESSION · LIGUE · BADGES (≥ 320 px).
- Ligue : classement de 20 lignes avec des pseudos longs (18 à 19 caractères), zones de montée, maintien et descente, ligne VOUS. Lisible à 320 px (une carte par ligne, XP sous le pseudo, `@media (max-width:420px)`). Écrans vide, pending (« Résultats lundi matin ») et hors ligne vérifiés.
- Admin : Documents (formulaire en une colonne sous 560 px), Questions, Pseudos (une carte par ligne, boutons qui passent à la ligne) et MOTS REFUSÉS déplié à 320 px. Aucun tableau illisible.
- En-tête (Shell) : onglets et sous-navigation au-dessus de 760 px ; bouton compte et thème en dessous. Barre du bas absente en séance, en fin de séance et en aperçu.
- La barre du bas ne masque aucun bouton une fois la page défilée en bas (`padding-bottom: 72px` respecté), sur tous les écrans et à toutes les largeurs.

## Annexe (une ligne par point)

- Faux positifs écartés : chevauchements signalés sur les textes en ligne (`strong` et `span` qui passent à la ligne dans Fiches et Fin) ; contenu des `<details>` fermés ; contour orange des titres (focus programmatique de `useScreenA11y`, visible seulement sans interaction).
- Admin > Questions affiche les 665 cartes sans pagination : la page fait 197 000 px de haut à 320 px. Ce n'est pas un défaut de mise en page ; à voir avec le PM pour la performance.
- Non couvert : Safari iOS et WebKit (le moteur de rendu n'a pas été testé), vrais appareils, clavier virtuel réel, mode `interactive-widget`, carte en auto-évaluation pure (seulement si une zone n'a qu'une seule réponse possible), import Excel en cours (seul le formulaire est affiché), thème clair et thème sombre non systématiques.
- Rejouer l'audit : lancer `vite` sur un port libre avec l'URL factice, puis `node SP/run.mjs [filtre] [largeurs]`.
