# Revue UX/UI et accessibilité : Xam Xam Bëy

Date : 12/10/2026 · Rôle : Product Designer · Mode : revue du code existant (lecture seule)

## Hypothèses

- Revue faite sur le code (composants, CSS, planches), sans test sur appareil ni lecteur d'écran. Les points marqués « à vérifier » demandent un essai sur un Android d'entrée de gamme (Chrome et Samsung Internet).
- Les contrastes sont calculés à la main avec la formule WCAG (luminance relative sRGB), à partir des tokens de `src/styles/app.css` lignes 2 à 4. Les opacités sont mélangées sur le fond réel.
- Thème par défaut : sombre, sauf si le téléphone demande le thème clair (`AppContext.tsx:77`).

## Contrastes calculés (tokens)

| Paire | Thème | Ratio | Verdict |
|---|---|---|---|
| `--hud` #E4EDE6 sur `--bg` #0D1512 | sombre | 15,5:1 | OK |
| `--hud2` #93A79E sur `--bg` | sombre | 7,3:1 | OK |
| `--acc` #C8F169 / `--amber` #F3AE45 / `--err` #FF8B78 sur `--bg` | sombre | 14,3 / 9,7 / 8,1:1 | OK |
| `--hud2` #4F4B44 / `--acc` #1D5A3F / `--amber` #8A5007 / `--err` #B32D17 sur `--bg` #EEE8DA | clair | 7,1 / 6,7 / 5,3 / 5,2:1 | OK |
| `--ink` #151515 et `--ink2` #4F4B44 sur fiche crème #F6F1E4 | les deux | 16,2 / 7,7:1 | OK |
| `--stamp` #C8341C sur crème #F6F1E4 / #FBF8F0 | sombre / clair | 4,7 / 5,0:1 | OK de justesse |
| Anneau de focus `--amber` #F3AE45 sur fiche crème #F6F1E4 | sombre | **1,7:1** | **Échec 1.4.11 / 2.4.7** |
| Lien `--acc` #C8F169 sur fiche crème | sombre | **1,15:1** | **Échec 1.4.3** |
| Bordure `--line` des champs sur `--bg` | sombre / clair | **1,7 / 1,8:1** | **Échec 1.4.11** |
| Texte `--ink2` d'une fiche `.off` (opacité 0,55) | sombre | **3,9:1** | **Échec 1.4.3** |
| Bouton `.go` désactivé « Rien à réviser » (opacité 0,5) | sombre | 4,3:1 | Exempté (désactivé), mais c'est le message principal de l'écran |

## Parcours critiques évalués de bout en bout

**P1. Trouver et ouvrir un PDF (public, mobile).** Bibliothèque → recherche ou zone → « Ouvrir ↗ » → lecteur natif dans un nouvel onglet.
Verdict : ⚠️ fonctionne. Recherche, filtres, état vide avec suggestions et annonce du nombre de résultats sont bons. Points faibles : jargon (« pièces », « cote », « fonds », « Mo »), promesse hors ligne non tenue (UX-3), retour arrière Android qui quitte le site (UX-2), retour depuis un autre onglet peu évident pour un public peu à l'aise.

**P2. Se connecter par lien magique puis faire la session du jour.** Révision → e-mail → « Lien envoyé » → clic dans la boîte mail → Aujourd'hui → session QCM → bilan.
Verdict : ❌ fragile à l'étape de connexion. Aucun moyen de corriger l'adresse ni de renvoyer le lien (UX-1) ; le lien peut s'ouvrir dans un autre navigateur que celui de départ (UX-1). Une fois connecté, la session est solide : focus déplacé sur la question puis sur « Carte suivante », verdict annoncé (`role="status"`), réponse complète et source, deuxième chance, enregistrement différé avec bandeau d'erreur et « Réessayer ».

**P3. Admin : envoyer un PDF et écrire des questions.** Connexion → Admin → Documents (envoi) → Questions (nouvelle, brouillon, publier).
Verdict : ⚠️ fonctionne, mais un brouillon de question peut être perdu sans avertissement (UX-5), l'écran affiche « réservé aux administrateurs » le temps de la vérification (UX-9), et l'envoi d'un gros fichier n'a aucune progression (UX-12).

## Constats (triés par sévérité)

| ID | Sév. | Écran · fichier:ligne | Constat | Impact utilisateur | Correctif proposé |
|---|---|---|---|---|---|
| UX-1 | HAUTE | Connexion · `revision/Gate.tsx:31-37`, `hooks/useRevision.ts:191-205` | L'écran « Lien envoyé » n'a aucun bouton : ni « Renvoyer », ni « Changer d'adresse ». Sur Android, le lien ouvert depuis Gmail s'ouvre dans Chrome, pas forcément dans le navigateur de départ (Samsung Internet) : la personne revient sur l'onglet d'origine, toujours déconnectée (à vérifier). | Bénévole bloqué après une faute de frappe dans l'e-mail ; relances répétées jusqu'à « Trop de demandes ». C'est la porte d'entrée de toute la révision. | Ajouter « Modifier l'adresse » et « Renvoyer le lien » (actif après 60 s, avec décompte). Ajouter un code à 6 chiffres dans l'e-mail (Supabase `{{ .Token }}`) et un champ « Saisir le code » : marche quel que soit le navigateur. |
| UX-2 | HAUTE | Toute l'app · `AppContext.tsx:105-109` | Navigation sans historique : `go()` ne pousse aucune entrée. Le bouton retour d'Android quitte le site depuis Plan, Fiches, Session, Aperçu ou Admin. | Geste le plus naturel sur Android ; l'utilisateur se retrouve hors du site et pense l'avoir cassé. | `history.pushState` à chaque `go()` (écran dans le hash, ex. `#plan`), écoute de `popstate`. En session, retour = demande « Quitter la session ? » (voir UX-14). |
| UX-3 | HAUTE | Bibliothèque hors réseau · `library/Library.tsx:96`, `library/DocCard.tsx:9` | Le bandeau promet « les pièces déjà consultées restent lisibles », mais il n'y a pas de service worker ni de cache des PDF. « Consultée » signifie « bouton touché », pas « fichier gardé ». | Promesse rompue au pire moment (camp, sans réseau) ; perte de confiance. | Court terme : changer le texte (« Hors réseau : les documents s'ouvriront au retour de la connexion. Téléchargez à l'avance ceux dont vous aurez besoin. »). Plus tard : vrai cache (rôle Front). |
| UX-4 | HAUTE | En-tête mobile · `Shell.tsx:46`, `app.css:326` | « SE DÉCONNECTER » est dans la sous-navigation, masquée sous 760 px. Sur téléphone, aucun moyen de se déconnecter ni de voir quel compte est connecté (adresse seulement en `title`). | Téléphone partagé au sein d'une unité : la progression d'une personne se mélange à celle d'une autre. | Ajouter sur mobile un bouton compte (icône dans l'en-tête ou ligne en bas de « Progrès ») affichant l'adresse en clair et « Se déconnecter ». |
| UX-5 | HAUTE | Admin Questions · `admin/CardsAdmin.tsx:117`, `:127-135`, `:72` | Les puces de zone restent cliquables pendant l'édition ; changer de zone ferme l'éditeur (`setEditor(null)`) et jette la saisie. « Annuler », l'onglet Documents et la barre du bas font de même, sans confirmation. | Un admin perd une question rédigée (question, réponse, 4 propositions) d'un seul geste. | Masquer ou désactiver les puces de zone pendant l'édition. Si le brouillon a changé : « Abandonner cette question ? Les modifications seront perdues. [Continuer l'écriture] [Abandonner] ». |
| UX-6 | HAUTE | Fiches crème, thème sombre · `app.css:13`, `:49` | WCAG 2.4.7 et 1.4.11 : l'anneau de focus ambre #F3AE45 sur la fiche crème #F6F1E4 donne 1,7:1 (seuil 3:1). Concerne « Ouvrir », options QCM, « Valider », champs du formulaire d'entraînement et de l'admin. | Une personne au clavier (ou avec un clavier Bluetooth ou un contacteur) ne voit pas où elle se trouve. | Dans `.sheet`, `.qcard`, `.gate-card` : `--focus: var(--ink)` (16:1 sur crème) ou un double anneau (2 px ink + 2 px ambre). |
| UX-7 | HAUTE | Aperçu en erreur · `library/PdfViewer.tsx:81`, `app.css:17` | WCAG 1.4.3 : le lien « Ouvrir le document » prend `--acc` #C8F169 sur la fiche crème du panneau d'aperçu : 1,15:1. | Le seul moyen de s'en sortir quand l'aperçu échoue est presque invisible. | Dans les fiches, liens en `--green` #1D5A3F (7,2:1) et soulignés. Mieux : un vrai bouton `ink-btn` « Ouvrir le PDF ». |
| UX-8 | MOYENNE | Recherche, champs sur la carte · `app.css:113`, `admin/CardsAdmin.tsx:143` | WCAG 1.4.11 : la bordure `--line` du champ de recherche sur le fond donne 1,7:1 (sombre) et 1,8:1 (clair) ; le fond du champ est presque celui de la page. | En plein soleil, le champ de recherche se distingue mal : le point d'entrée principal de la bibliothèque. | Bordure des champs en `--hud2` (7:1) ou un token `--field-bd` à 3:1 minimum. |
| UX-9 | MOYENNE | Admin · `admin/Admin.tsx:13-16`, `AppContext.tsx:92-98` | Tant que la session ou `checkIsAdmin` est en cours, l'écran affiche la connexion puis « réservé aux administrateurs ». Pas d'état de chargement. | Un admin croit avoir perdu ses droits ; il se reconnecte inutilement. | État `isAdmin: 'checking' \| true \| false` et ligne « Vérification de vos droits… ». Ajouter un bouton « Retour à la bibliothèque » sur l'écran refusé. |
| UX-10 | MOYENNE | Admin Questions · `admin/CardsAdmin.tsx:62-67` | Formulaire vierge : 4 erreurs rouges s'affichent avant toute saisie ; elles ne sont pas reliées à leur champ (WCAG 3.3.1). | Effet « vous avez déjà tout faux » ; l'admin ne sait pas quel champ corriger. | Erreurs affichées au premier clic sur « Publier » ou à la sortie du champ, sous chaque champ avec `aria-describedby` et `aria-invalid`. |
| UX-11 | MOYENNE | Admin Documents, modification · `admin/DocsAdmin.tsx:100-102` | WCAG 3.3.2 et 4.1.2 : titre et dossier n'ont qu'un `aria-label` (pas de libellé visible) ; le `select` de zone n'a aucun nom accessible. | En édition, on ne sait plus quel champ est quoi ; « liste déroulante » muette au lecteur d'écran. | Reprendre les libellés visibles du formulaire d'envoi (`f-lbl` + `htmlFor`). |
| UX-12 | MOYENNE | Admin envoi · `admin/DocsAdmin.tsx:44`, `lib/adminApi.ts:21` | Envoi jusqu'à 50 Mo avec seulement « Envoi en cours… » ; les erreurs inconnues remontent le message brut de Supabase (souvent en anglais). | Sur réseau mobile, plusieurs minutes sans signe de vie : l'admin recharge et perd l'envoi. | Barre de progression (pourcentage) ou au moins le temps écoulé et « Ne fermez pas la page ». Messages traduits avec une action (« Vérifiez la connexion puis touchez Réessayer »). |
| UX-13 | MOYENNE | Changement d'écran · `AppContext.tsx:105-109`, `index.html:6` | WCAG 2.4.2 et 2.4.3 : le titre de page reste « Xam Xam Bëy » sur tous les écrans ; le focus reste sur le bouton de navigation après un changement d'écran. | Le lecteur d'écran n'annonce pas qu'on a changé de page. | `document.title = "Plan annuel · Xam Xam Bëy"` et focus sur le `h1` de l'écran à chaque `go()`. |
| UX-14 | MOYENNE | Session · `revision/Session.tsx:101`, `App.tsx:30` | « ✕ QUITTER » et Échap quittent immédiatement, sans confirmation, en haut à gauche, à portée d'un geste involontaire. | Session interrompue par erreur ; la série du jour peut ne pas être comptée. | Confirmation légère en ligne (« Quitter ? Vos réponses déjà données sont gardées. [Continuer] [Quitter] »), pas de modale. |
| UX-15 | MOYENNE | Barre du bas · `app.css:318` | WCAG 2.4.11 (nouveau en 2.2) : la barre fixe de 60 px peut couvrir l'élément qui reçoit le focus en bas de l'écran. | Navigation au clavier ou à la commande vocale : élément actif caché. | `html { scroll-padding-bottom: calc(72px + env(safe-area-inset-bottom)) }`. |
| UX-16 | MOYENNE | Tout le site · `app.css:25`, `:62`, `:86`, `:305` | Beaucoup d'informations en 10 à 11 px, majuscules, chasse fixe (`.lbl`, `.d-meta`, `.tag-resp` 9 à 10 px, KPI, barre du bas). Pas d'échec WCAG strict, mais lisibilité faible sur un petit écran bas de gamme et pour un public peu lecteur. | Métadonnées, étiquettes et légendes sautées ou mal lues. | Plancher de 12 px partout, 13 px pour les légendes de KPI ; majuscules réservées aux étiquettes courtes (moins de 3 mots). |
| UX-17 | MOYENNE | Bibliothèque · `library/Library.tsx:22`, `:93`, `library/PreviewPanel.tsx:20` | Jargon d'archive : « pièces », « cote », « fonds », « MO » ; l'admin dit « documents ». Champ de recherche sans libellé visible (seulement le texte indicatif). | Le public visé ne sait pas ce qu'est une « cote » ; incohérence de vocabulaire. | « documents » partout ; texte indicatif « Ex. : camp, secourisme, statuts » ; « Mo » en « Taille totale ». |
| UX-18 | MOYENNE | Fiche « hors réseau » · `app.css:125`, `library/DocCard.tsx:29` | WCAG 1.4.3 : l'opacité 0,55 fait tomber le texte gris de la fiche, dont l'étiquette « HORS RÉSEAU », à 3,9:1. | L'explication de l'indisponibilité est la partie la moins lisible. | Pas d'opacité globale : garder le texte à 100 %, griser seulement le bouton, avec une icône et « Disponible au retour du réseau ». |
| UX-19 | MOYENNE | Couleurs de zone · `lib/format.ts:9`, `revision/Progress.tsx:10` | `oklch()` et `color-mix()` exigent Chrome 111 ou plus. Sur un navigateur WebView ancien, les losanges, barres et niveaux deviennent transparents (à vérifier). | Indicateurs de progression vides sur les téléphones les plus anciens. | Valeurs de repli en hexadécimal (`background: #xxx; background: oklch(...)`) ou couleurs précalculées dans `ZONES`. |
| UX-20 | MOYENNE | Aujourd'hui · `revision/Today.tsx:25` | « Rien à réviser aujourd'hui » est un bouton désactivé à 50 % d'opacité (4,3:1) : un message présenté comme une action cassée. | La personne pense que l'app ne marche pas ; aucune action proposée. | Bloc d'information (pas un bouton) + action réelle : « S'entraîner sur la zone {mois} » qui lance l'entraînement. |

## Recommandations prioritaires

1. **Sécuriser la connexion (UX-1, UX-4)** : code à 6 chiffres en plus du lien, boutons « Renvoyer » et « Modifier l'adresse », compte visible et déconnexion sur mobile. C'est la porte de toute la révision.
2. **Respecter le bouton retour d'Android (UX-2, UX-13, UX-14)** : historique par hash, titre et focus à chaque écran, confirmation en ligne avant de quitter une session. Un seul chantier Front.
3. **Corriger les contrastes calculés (UX-6, UX-7, UX-8, UX-18)** : un token `--focus` et un token `--link` propres aux fiches crème, une bordure de champ à 3:1, plus d'opacité sur les textes. Une demi-journée de CSS.
4. **Dire la vérité sur le hors-ligne (UX-3)** : changer le texte tout de suite ; décider ensuite (PM) si un vrai cache des PDF justifie un service worker.
5. **Protéger le travail des admins (UX-5, UX-9, UX-10, UX-12)** : pas de perte de brouillon, erreurs au bon moment et sous le bon champ, progression d'envoi.

## Annexe : constats mineurs (BASSE)

- UX-21 · `App.tsx:31-37` · WCAG 2.1.4 : raccourcis à une touche (1 à 4, Entrée) sans moyen de les désactiver ; les limiter au focus dans la carte de question.
- UX-22 · `library/ZoneRoute.tsx:16`, `revision/Fiches.tsx:17` · WCAG 2.5.3 : le nom accessible (« Zone 1, octobre… ») ne contient pas le texte visible (« 01 OCT ») ; commencer l'`aria-label` par le texte visible.
- UX-23 · `revision/TrainCard.tsx:45-67` · `role="radio"` sans navigation aux flèches (modèle ARIA radiogroup) ; ajouter les flèches ou passer en `aria-pressed`.
- UX-24 · `revision/Session.tsx:99`, `revision/Fin.tsx:30`, `library/Apercu.tsx:13` · WCAG 1.3.1 : pas de repère `<main>` en session, au bilan et en aperçu.
- UX-25 · `revision/Session.tsx:67`, `:140` · l'indication `<kbd>ENTRÉE</kbd>` s'affiche aussi sur téléphone ; la masquer sous 760 px.
- UX-26 · `revision/Fin.tsx:21` · « Quête accomplie » même avec 0 bonne réponse ; adapter le titre au score (« Session terminée, 3 cartes à retravailler »).
- UX-27 · `BottomNav.tsx:11-13` · déconnecté, 4 onglets sur 5 mènent au même écran de connexion ; Admin absent de la barre du bas, aucun onglet actif sur l'écran Admin.
- UX-28 · `admin/DocsAdmin.tsx:123` · la confirmation de suppression ne dit pas la conséquence (fichier retiré pour tous, questions liées sans source).
- UX-29 · `admin/CardsAdmin.tsx:151` · erreur de chargement des questions sans bouton « Réessayer ».
- UX-30 · `app.css:135` · bouton de fermeture du panneau d'aperçu en 36 × 36 px (conforme 2.5.8, sous la cible de 44 px).
- UX-31 · `library/DocCard.tsx:26` · « Ouvrir ↗ » peut télécharger le PDF au lieu de l'afficher selon le navigateur ; texte d'aide « s'ouvre dans votre lecteur PDF ».
- UX-32 · `Shell.tsx:26` · « 12/170 PIÈCES » sans explication ; préciser « documents consultés ».
- UX-33 · `useCatalog.ts:26` · statut `bundled` (catalogue intégré, peut-être périmé) sans bandeau, contrairement à `cached`.
- UX-34 · `app.css:31`, `revision/Session.tsx:121`, `app.css:166-168`, `:233` · espacements hors échelle de 4 px (6, 10, 14, 22) et couleurs codées en dur (#F3AE45, #FFFFFF, #C9C0AE, #D8D0BF) au lieu de tokens.
- UX-35 · `planches/frames.ts:13-36` · la planche ne montre ni l'Admin, ni « Lien envoyé », ni l'erreur de connexion, ni « Les cartes arrivent », ni le chargement de la révision.
- UX-36 · `index.html:9` · 4 familles de polices Google, 13 graisses : lourd en 3G ; garder 2 familles (rôle Front ou SRE).
- UX-37 · `index.html` · ni `theme-color` ni manifeste : pas d'ajout simple à l'écran d'accueil, pourtant utile à ce public.
- UX-38 · signalé au Front · `revision/Session.tsx:84` puis `:94` : hooks appelés après un `return` conditionnel (règle des hooks React).

Points forts relevés : `lang="fr"`, cibles de 44 px quasi partout, `prefers-reduced-motion` géré globalement, états vide, erreur et hors ligne de la bibliothèque prévus, focus programmé en session, libellés visibles sur la connexion et l'entraînement, confirmations en ligne plutôt qu'en modale.
