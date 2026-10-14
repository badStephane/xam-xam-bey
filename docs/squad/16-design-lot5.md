# Lot 5 : design de la gamification (ligues, pseudo, niveaux, badges, défi)

Rôle : Product Designer · Date : 14/10/2026 · Entrées : `15-lot5.md` (G1 à G5, P1 à P7), `revue-design.md`, écrans `revision/*`, `Shell.tsx`, `BottomNav.tsx`, `app.css`, `srs.ts`, `constants.ts`.
Livrable sans maquette Figma : spec écrite, écrans décrits en blocs ASCII, prête à coder avec les classes existantes (`box`, `kpi`, `chip`, `btn`, `btn-mono`, `banner`, `warn-inline`, `lbl`).

## Hypothèses

- H1. Le vouvoiement reste la voix de l'app (« Lisez la question… »), y compris pour les mineurs.
- H2. XP de ligue = XP perso actuels (Su +10, Hésitant +5, Raté 0), comptés par le serveur au plus une fois par carte et par jour (P1), **plafond proposé : 300 XP de ligue par jour**. Le back fixe la valeur finale ; l'écran l'affiche telle quelle.
- H3. Les niveaux perso restent calculés sur l'appareil (`prog.xp`, 200 XP par niveau, numéro inchangé). Seuls les **noms de grade** changent de seuils (voir C2). Le niveau perso n'est **jamais montré aux autres** : il est déclaré par le client, donc trichable.
- H4. Un scout entre dans le groupe de la semaine à sa première carte notée de la semaine (pas de groupe pour les inactifs).
- H5. Badges de progression calculables depuis la copie locale (hors ligne) ; badges de ligue et de défi attribués par le serveur à la clôture.
- H6. Le Service Worker du lot 4 peut mettre en cache les morceaux chargés à la demande (Ligue, Badges) après une première visite en ligne.

## 1. Navigation (sans casser BottomNav sous 760 px)

- BottomNav garde **5 onglets**. « PROGRÈS » devient actif pour les écrans `progression`, `ligue` et `badges`.
- Nouvelles valeurs de `Screen` : `ligue`, `badges` (chargées à la demande, P7). Retour Android : chaque changement d'onglet interne pousse une entrée d'historique (comme UX-2).
- En tête des trois écrans, une rangée de puces (`nav.chips`, `aria-label="Progrès"`, `aria-current="page"`), 44 px de haut : `PROGRESSION · LIGUE · BADGES`. Même rangée sur mobile et desktop ; la sous-navigation desktop (`SUBNAV`) reste à 4 puces, « PROGRESSION » y est active pour les 3 écrans.
- Aujourd'hui : un bloc compact « CETTE SEMAINE » (défi + place en ligue), lien vers Ligue. Il ne charge qu'une petite lecture, pas l'écran Ligue.
- En-tête : la ligne `NIV. 7 · ÉCLAIREUR · 1 240 / 1 400 XP` reste ; la barre se remplit **dans le niveau courant** (aujourd'hui elle se remplit sur le cumul : à signaler au front).
- Admin : nouvel onglet `PSEUDOS` à côté de Documents et Questions.

## 2. Parcours

**P-A. Premier contact (pseudo proposé, jamais imposé).**
1. Le scout termine sa première séance après la mise en production : sur le bilan (Fin), sous les chiffres, bloc `box` « Rejoindre les ligues ? ».
2. Texte : « Comparez votre semaine avec une vingtaine de scouts. Seul votre pseudo est visible, jamais votre nom ni votre e-mail. »
3. Deux boutons de même taille : `CHOISIR UN PSEUDO` (ouvre le formulaire en ligne, pas de modale) et `NON MERCI`.
4. « Non merci » : le bloc ne revient jamais tout seul. L'invitation reste dans l'écran Ligue. XP, niveaux, badges et défi marchent sans pseudo.
5. Pseudo validé : message « Bienvenue en Ligue Piste, CalaoAgile27. Vos prochaines cartes comptent pour la semaine. » puis lien `VOIR MA LIGUE`.

**P-B. Réviser et gagner de l'XP de ligue.** Aucun changement dans la séance (pas de compteur de classement pendant les questions : la qualité prime). Les boutons de note gardent `+10 XP` / `+5 XP`.

**P-C. Fin de séance.** Sous les chiffres existants (`+XP GAGNÉS`), dans l'ordre, chaque bloc seulement s'il a du contenu :
1. **Ligue** (si pseudo) : `LIGUE BOUSSOLE · 240 XP CETTE SEMAINE · 6E SUR 18 ▲2`. Valeur lue sur le serveur après l'envoi ; en attendant, ligne skeleton. Hors réseau : « Hors réseau : votre place sera mise à jour au retour du réseau. » Plafond atteint : « Plafond du jour atteint (300 XP) : les cartes suivantes comptent pour votre niveau, pas pour la ligue. » Reprise (`REDO`) : « Cartes déjà comptées aujourd'hui pour la ligue. »
2. **Nouveau badge** (un bloc par badge, 3 au plus puis « et 2 autres ») : icône, nom, règle en une phrase, lien `VOIR MES BADGES`. `role="status"`. Apparition en fondu 200 ms, supprimée sous `prefers-reduced-motion`. Pas de confettis.
3. **Défi** : `DÉFI : 3/4 JOURS` ; s'il vient d'être relevé : « Défi relevé ! Badge Défi relevé ×3. »
4. **Invitation pseudo** (P-A), une seule fois.

**P-D. Écran Ligue.** Voir 4.1. Lundi, première ouverture après la clôture : carte « Semaine passée » en tête, puis classement neuf.

**P-E. Badges et grade.** Voir 4.2. Accès par la puce BADGES ou le lien du bilan.

**P-F. Défi de la semaine.** Visible sur Aujourd'hui (bloc « Cette semaine »), sur le bilan et en tête de l'écran Badges. Règles en C4.

**P-G. Quitter les ligues.** Bas de l'écran Ligue, bouton `btn-mono` `QUITTER LES LIGUES` → confirmation en ligne : « Quitter les ligues ? Votre pseudo disparaît des classements tout de suite. Vos XP, niveaux, badges et défis restent à vous. » `[RESTER]` `[QUITTER]`. Après : écran Ligue en état « sans pseudo ». Revenir = choisir un pseudo (l'ancien est libéré), retour dans la dernière ligue atteinte.

**P-H. Admin : pseudos.** Onglet `PSEUDOS` : liste (signalés d'abord, puis les plus récents), recherche. Ligne : pseudo, ligue, `2 SIGNALEMENTS`, date de choix. Aucun e-mail, aucun nom. Actions par ligne :
- `RÉINITIALISER` : retire le pseudo ; le scout disparaît des classements jusqu'à un nouveau choix.
- `REFUSER` : retire le pseudo et l'ajoute aux pseudos interdits (casse et accents ignorés).
- `IGNORER` (si signalé) : remet le compteur de signalements à zéro.
Confirmation en ligne pour Réinitialiser et Refuser : « Retirer CalaoAgile27 ? Le scout devra choisir un autre pseudo. » `[ANNULER]` `[RETIRER]`. Côté scout, à la prochaine ouverture de Ligue : « Votre pseudo a été retiré par un responsable. Choisissez-en un autre pour réapparaître dans les ligues. » (formulaire juste dessous). Aucune mention publique.

**P-I. Signaler un pseudo.** Toucher une ligne du classement (autre que la sienne) la déplie : `SIGNALER CE PSEUDO` → « Signalé. Un responsable va vérifier. » Un signalement par pseudo et par scout ; pas de motif à saisir.

## 3. Inventaire d'écrans et états

| Écran | Tâche | Vide | Chargement | Erreur | Hors ligne (phrase exacte) | Nominal |
|---|---|---|---|---|---|---|
| Ligue (lazy) | Voir ma place | Sans pseudo : invitation + formulaire. Pseudo sans groupe : « Notez une carte pour entrer dans un groupe de cette semaine. » + `DÉMARRER LA SESSION DU JOUR` | Skeleton : en-tête + 8 lignes de 48 px | « Le classement n'a pas pu être chargé. Vérifiez la connexion puis touchez Réessayer. » `RÉESSAYER` | Avec cache : « Hors réseau : classement de la dernière connexion (lundi 14 h 05). » Sans cache : « Hors réseau : le classement s'affichera au retour du réseau. Vos révisions comptent quand même. » | 4.1 |
| Badges (lazy) | Voir badges, grade, défi | Tous verrouillés avec progression ; en tête « Votre premier badge : notez une carte. » | Skeleton : grille de 6 tuiles | Badges locaux affichés + `warn-inline` « Les badges de ligue et de défi n'ont pas pu être chargés. » `RÉESSAYER` | « Hors réseau : badges de ligue et de défi de la dernière connexion. » | 4.2 |
| Formulaire pseudo (dans Ligue et Fin) | Choisir un pseudo | Champ vide, suggestion au hasard proposée | Bouton « VÉRIFICATION… » désactivé | Erreurs C5 sous le champ | Bouton désactivé + « Le choix du pseudo demande du réseau. » | Champ rempli, `REJOINDRE LES LIGUES` |
| Bloc « Cette semaine » (Aujourd'hui) | Voir défi et place | Sans pseudo : défi seul | Ligne skeleton | Bloc masqué (pas d'alerte sur l'accueil) | Défi : « 3/4 jours (sur cet appareil) » ; ligue : « Hors réseau » à la place du rang | `DÉFI 3/4 JOURS · LIGUE BOUSSOLE 6E` |
| Blocs du bilan (Fin) | Voir le gain | Rien de neuf : blocs absents | Ligne skeleton | « Place non disponible pour le moment. » (sans bouton, l'XP est gardée) | « Hors réseau : votre place sera mise à jour au retour du réseau. » | P-C |
| Admin Pseudos | Modérer | « Aucun pseudo pour le moment. » / « Aucun signalement. » | Skeleton 5 lignes | « La liste n'a pas pu être chargée. » `RÉESSAYER` | « Hors réseau : la modération demande du réseau. » | P-H |

Écran Ligue ou Badges jamais ouvert en ligne puis ouvert hors réseau (morceau absent) : « Cet écran n'est pas encore sur votre téléphone. Il s'ouvrira au retour du réseau. » `RETOUR AUX PROGRÈS`.
Permission refusée : sans objet pour le scout (ses propres données) ; l'onglet Admin Pseudos n'existe que pour `is_admin`.

## 4. Écrans

### 4.1 Ligue (360 px)

```
[PROGRESSION] [LIGUE*] [BADGES]
SEMAINE DU 12 AU 18 OCT · FIN DANS 4 JOURS
(icône boussole) Ligue Boussole            h1
Groupe de 18 · les 5 premiers montent
┌ Semaine passée (lundi seulement, bouton ✕ FERMER 44 px) ┐
│ 3e sur 17 en Ligue Bivouac. Vous passez en Ligue Boussole ! │
└───────────────────────────────────────────────────────────┘
▲ ZONE DE MONTÉE
 1  [B] BaobabSage       420 XP
 …
 5  [L] LionVif07        260 XP
── ZONE DE MAINTIEN ──
 6  [C] CalaoAgile27     240 XP   VOUS     (bordure 2 px --acc + texte « VOUS »)
 …
▼ ZONE DE DESCENTE
16  [G] GazelleCalme     40 XP
 …
Comment ça marche ? (détails repliables, 4 lignes de C3)
[QUITTER LES LIGUES]
```

- Liste `<ol>` ; chaque ligne 48 px, nom accessible « 6e, CalaoAgile27, 240 XP, vous ». Avatar = initiale sur carré teinté (teinte déduite du pseudo), `aria-hidden`.
- Zones : séparateurs avec icône **et** texte (jamais la couleur seule). Zone de descente en `--hud2`, pas en rouge.
- Ex aequo : même XP, la place revient à qui a atteint ce total en premier ; affichage « 7e ex aequo » non nécessaire.
- Compte à rebours en jours seulement : « Fin dans 4 jours », dimanche : « Dernier jour de la semaine ». Jamais d'heures ni de secondes.
- Pas de mise à jour automatique : rechargé à l'ouverture et par `ACTUALISER` (`btn-mono`, horodatage « à 14 h 05 »).
- Groupe de 1 à 9 : sous le titre, « Le groupe se remplit au fil de la semaine. »
- Ligue la plus haute : pas de zone de montée ; « ★ PODIUM » au-dessus des 3 premiers. Ligue la plus basse : pas de zone de descente.

### 4.2 Badges et grade

```
[PROGRESSION] [LIGUE] [BADGES*]
GRADE : ÉCLAIREUR · NIV. 7                h1 « Badges »
████████░░  1 240 XP · Guide à 2 000 XP
DÉFI DE LA SEMAINE  Réviser 4 jours  ███░ 3/4 · fin dans 4 jours
6 BADGES SUR 14
┌──────────┐ ┌──────────┐   grille 2 colonnes (360), 4 (≥760)
│ (icône)  │ │ (contour)│
│ Série 7  │ │ Série 30 │
│ 12 oct.  │ │ 9/30 j   │
└──────────┘ └──────────┘
Échelle des grades (liste des 8, le sien marqué « VOUS ÊTES ICI »)
```

- Tuile obtenue : icône pleine, nom, date. Tuile verrouillée : icône en contour, mention « À DÉBLOQUER » et progression chiffrée. Tuile entière = bouton 44 px min. qui déplie la règle exacte.
- Badges à compteur (Défi relevé, Zone maîtrisée, Podium) : « ×3 ».

## 5. Contenu

### C1. Ligues (6 paliers, du bas vers le haut)

| # | Nom | Icône |
|---|---|---|
| 1 | Ligue Piste | trace de pas |
| 2 | Ligue Bivouac | tente |
| 3 | Ligue Boussole | boussole |
| 4 | Ligue Feu de camp | flamme |
| 5 | Ligue Baobab | baobab |
| 6 | Ligue Étoile polaire | étoile |

Pas de couleur par ligue obligatoire : l'icône et le nom portent l'information.

### C2. Grades (le numéro de niveau reste 200 XP par niveau)

| Grade | Dès | | Grade | Dès |
|---|---|---|---|---|
| Novice | 0 XP | | Guide | 2 000 XP |
| Pisteur | 200 XP | | Pionnier | 3 500 XP |
| Campeur | 500 XP | | Routier | 6 000 XP |
| Éclaireur | 1 000 XP | | Ancien | 10 000 XP |

Aujourd'hui « Ancien » est atteint à 1 400 XP (140 cartes sues) : trop tôt. Effet de bord : un scout entre 500 et 1 400 XP verra un grade plus bas au déploiement (question Q1).

### C3. Règles de ligue

- Semaine : lundi 00:00 à dimanche 23:59, heure de Dakar (G1). Chaque semaine repart de 0 XP.
- Groupe : formé au fil de l'eau ; un scout avec pseudo entre dans un groupe de sa ligue à sa première carte notée de la semaine ; les groupes se remplissent jusqu'à 20, puis un nouveau s'ouvre.
- Fin de semaine, pour un groupe de n scouts : **montent** les `min(5, floor(n/3))` premiers ayant au moins 50 XP ; **descendent** les `min(3, floor(n/5))` derniers, **sauf** ceux qui ont fait au moins 100 XP dans la semaine (filet : qui révise ne descend pas).
- Ligue Étoile polaire : personne ne monte ; les 3 premiers (groupe ≥ 5) gagnent « Podium ». Ligue Piste : personne ne descend.
- Inactif (aucune carte de la semaine) : pas de groupe, ligue gardée, aucun message.
- Nouveau pseudo en cours de semaine : Ligue Piste (ou dernière ligue atteinte s'il revient).
- Notes hors ligne : comptent pour le jour où elles ont été faites si elles arrivent avant la clôture (P4).

### C4. Défi de la semaine (le même pour tous, tournant, défini côté serveur)

| Semaine (rang mod 4) | Défi | Vérification |
|---|---|---|
| 0 | Réviser 4 jours différents | jours avec au moins une carte notée |
| 1 | Noter 30 cartes de la zone du mois | cartes notées dont la zone = zone courante |
| 2 | Obtenir 40 « Su » | notes Su, une par carte et par jour |
| 3 | Noter 60 cartes | cartes notées, une par carte et par jour |

Ouvert à tous, avec ou sans pseudo. Relevé = badge « Défi relevé » (+1 au compteur). Pas d'échec affiché : le dimanche, un défi incomplet disparaît, le suivant arrive le lundi.

### C5. Pseudo : règles et messages

Règles : 3 à 20 caractères ; lettres (accents permis), chiffres, `-` et `_` ; commence par une lettre ; 4 chiffres au plus (pas de numéro de téléphone) ; pas de `@` ; unique sans tenir compte de la casse ni des accents ; liste de mots refusés côté serveur.
Libellé : « Votre pseudo ». Aide sous le champ : « Visible des autres scouts. Pas votre vrai nom ni votre prénom. » Bouton `UN PSEUDO AU HASARD` (adjectif + animal + 2 chiffres, ex. CalaoAgile27).

| Cas | Message sous le champ |
|---|---|
| Trop court / trop long | « 3 caractères au moins. » / « 20 caractères au plus. » |
| Caractère interdit | « Lettres, chiffres, tiret (-) et tiret bas (_) seulement, sans espace. » |
| Commence par un chiffre ou un signe | « Commencez par une lettre. » |
| Plus de 4 chiffres ou `@` | « Pas de numéro ni d'adresse dans un pseudo. » |
| Mot refusé ou pseudo interdit | « Ce pseudo n'est pas accepté. Choisissez-en un autre. » (sans citer le mot) |
| Déjà pris | « Ce pseudo est déjà pris. Essayez CalaoAgile28. » (suggestion du serveur) |
| Trop d'essais | « Trop d'essais. Réessayez dans une minute. » |
| Erreur inconnue | « Le pseudo n'a pas pu être enregistré. Vérifiez la connexion puis réessayez. » |

Vérification de format à la sortie du champ et à l'envoi (pas pendant la frappe) ; `aria-invalid` et `aria-describedby` vers le message.

### C6. Badges (14)

| Badge | Règle exacte | Source |
|---|---|---|
| Premier pas | 1 carte notée | progrès local |
| Cent cartes | somme des vues (`cards[*][2]`) ≥ 100 | local |
| Mille cartes | somme des vues ≥ 1 000 | local |
| Série de 3 | `bestStreak` ≥ 3 | local |
| Série de 7 | `bestStreak` ≥ 7 | local |
| Série de 30 | `bestStreak` ≥ 30 | local |
| Zone maîtrisée (×n) | toutes les cartes publiées d'une zone (au moins 10) au niveau ≥ 4 ; compteur = nombre de zones | local + contenu |
| Cartographe | au moins 1 carte acquise (niveau ≥ 4) dans 6 zones différentes | local |
| Sans faute | une séance `daily` avec `n ≥ 10` et `ok = n` | local (`sessions`) |
| Examen parfait | un mini-examen (`k = exam`) avec `ok = n = 10` | local |
| Défi relevé (×n) | défi de la semaine atteint ; compteur = nombre de défis | serveur |
| Première montée | avoir monté de ligue une fois | serveur |
| Podium (×n) | 1er à 3e d'un groupe d'au moins 5 à la clôture | serveur |
| Étoile polaire | atteindre la ligue Étoile polaire | serveur |

Aucun badge lié à l'heure (pas de « couche-tard » ni « lève-tôt »). Badges locaux : la date affichée est celle du premier constat sur l'appareil.

## 6. Accessibilité (WCAG 2.2 AA)

- Couleurs : uniquement les jetons existants (`--acc`, `--amber`, `--hud2`, `--err` : contrastes déjà vérifiés ≥ 5:1). Zone de descente sans rouge ; « VOUS » écrit, pas seulement surligné.
- Cibles ≥ 44 px : puces, lignes du classement (48 px), tuiles de badge, boutons du formulaire.
- Titre de page et focus sur le `h1` à l'arrivée sur Ligue et Badges (UX-13) ; `scroll-padding-bottom` pour la barre du bas (UX-15).
- Annonces : bilan (badge, place) en `role="status"` ; le compte à rebours n'est pas une région vivante.
- Animations : fondu de 200 ms au plus sur `opacity`, aucune obligatoire, coupées par la règle globale `prefers-reduced-motion`.
- Textes : plancher 12 px (UX-16), majuscules seulement pour les étiquettes courtes ; tout en français simple, phrases de moins de 20 mots.
- Zoom 200 % : la ligne de classement passe sur deux lignes (pseudo puis XP), sans troncature du pseudo.

## 7. Bien-être (mineurs)

- Aucun « vous avez perdu », « relégué » ni liste publique de qui descend ; le résultat de la semaine n'est montré qu'à l'intéressé.
- Filet anti-descente à 100 XP ; inactivité jamais signalée aux autres ni sanctionnée.
- Pas de compte à rebours en heures, pas de bandeau « dernières heures », pas de badge horaire, pas de push (P6) : rien ne pousse à réviser la nuit.
- Plafond quotidien de ligue : passer la nuit à réviser ne rapporte rien de plus.
- Participation retirable à tout moment (P-G) ; « Non merci » respecté (P-A).
- Le classement n'apparaît jamais pendant la séance.

## 8. Données attendues du back (à confirmer dans son contrat)

- Lecture « ma semaine » (légère, pour Aujourd'hui et Fin) : ligue, XP de la semaine, rang, taille du groupe, plafond du jour atteint (oui/non), progression du défi (valeur, cible, libellé), nouveaux badges serveur non vus.
- Lecture « mon groupe » : semaine (dates), ligue, n, nombres qui montent et descendent, lignes `{rang, pseudo, xpSemaine, estMoi}` uniquement (aucun identifiant réutilisable, aucun e-mail), horodatage de calcul.
- Résultat de la semaine passée : ligue, rang, n, issue (`up` / `stay` / `down`), ligue suivante, lu ou non.
- Pseudo : vérifier et enregistrer (codes d'erreur alignés sur C5 + suggestion si pris), quitter, état `retiré par un responsable`.
- Signaler (par rang de la ligne ou par jeton opaque, pas par identifiant d'utilisateur).
- Badges serveur : code, compteur, date.
- Admin : liste des pseudos (pseudo, ligue, signalements, date), réinitialiser, refuser, ignorer.

## Annexe (une ligne par point)

- A1. Barre XP de l'en-tête : remplissage dans le niveau courant `(xp mod 200) / 200` (front).
- A2. Adjectifs du tirage : Agile, Brave, Calme, Rapide, Sage, Vif, Loyal, Patient, Curieux, Joyeux.
- A3. Animaux du tirage : Calao, Gazelle, Lion, Lamantin, Pélican, Faucon, Tortue, Dauphin, Héron, Guépard.
- A4. Icônes : SVG au trait 2 px comme BottomNav, 24 px, `aria-hidden`, regroupées dans le morceau lazy.
- A5. Desktop (≥ 760 px) : Ligue en deux colonnes (classement à gauche, semaine passée et règles à droite).
- A6. Mode démo / planches : ajouter Ligue nominale, Ligue sans pseudo, Badges, Fin avec badge (UX-35).
- A7. Événements analytiques proposés : invitation vue, pseudo choisi, non merci, ligues quittées, signalement.
- A8. Le libellé « XP CETTE SEMAINE » est toujours écrit en entier pour ne pas confondre avec l'XP total.
