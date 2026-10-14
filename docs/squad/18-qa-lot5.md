# 18 : Validation indépendante du lot 5 (QA)

Date : 2026-10-14. Base : branche `feat/lot5` (depuis `1b9bc4f`), changements non commités du lot 5 (ligues, pseudo, badges, grades, défi). Méthode des lots précédents : les journaux de `05-build.md` sont des affirmations ; seules les sorties ci-dessous valent preuve.

**Hypothèses**
- H1. La pile locale (CLI **2.120.0** du scratchpad, ports 553xx) représente la production pour l'Auth, le REST et pg_cron. Aucun appel distant, aucun `link` ni `db push`. Horloge réelle de la base : mercredi 2026-10-14 10:36 UTC (semaine de ligue du 12/10).
- H2. Toutes les cartes publiées du contenu réel sont des QCM (665 sur 665) : l'XP de 5 (auto-évaluation, A11) n'existe aujourd'hui qu'en test.
- H3. Aucun téléphone réel ; 360 px, cibles 44 px et `prefers-reduced-motion` vérifiés par relecture du CSS et des composants, pas par capture.

**Ajouts du QA** (aucun code applicatif modifié)
- `supabase/tests/07_qa_lot5_test.sql` : 12 tests (jour déclaré, plafond sur deux appels, ex aequo, pseudo retiré en cours de semaine, `t` vers une semaine close). 3 tests `todo` décrivent L5-1 et L5-2 : ils échouent sans casser la suite.
- `src/hooks/useRevision.test.ts` : 1 test « QA L5 : A puis B sur le même appareil » (file de notes).
- `e2e/qa-lot5-admin.spec.ts` : 1 test admin PSEUDOS (signalé en tête, recherche, filtre, REFUSER avec confirmation, ANNULER, base vérifiée) et MOTS REFUSÉS (ajout normalisé, mot invalide, retrait).
- Script d'attaque REST hors dépôt (scratchpad `qa5/attack.mjs`), 47 vérifications, sortie résumée en §1.

## 1. Preuves exécutées

```
supabase db reset (553xx)                 -> 10 migrations appliquées, dont 20261014120000/100/200 ; cron.job « xxb-close-weeks » 5 * * * *
supabase test db (avant ajouts QA)        -> 6 fichiers, 216 tests, PASS
supabase test db (avec 07_qa_lot5)        -> 7 fichiers, 228 tests, PASS ; 3 TODO en échec attendu (L5-1 x2, L5-2)
npm run check (arbre livré)               -> typecheck 0 ; 549 passed | 1 expected fail (IM-2) | 5 skipped ; build OK
npm run check (après ajout QA)            -> 550 passed | 1 expected fail | 5 skipped ; index-*.js 112,46 Ko gzip (plafond 115)
sw.js                                     -> « coquille de 7 fichiers, 2 écran(s) préchargé(s) » (Gamification + dépendance)
npx playwright test, 1er passage          -> 43 passed, 7 failed : base polluée par mes cartes REST (voir L5-6)
supabase db reset puis npx playwright test -> 51 passed (3,8 min) en UN passage, aucun rejeu (league x2, offline-revision, admin QA compris)
REST attack.mjs (jetons réels, anon et authenticated) -> 45 OK, 1 échec réel (L5-1), 1 erreur de mon script (pseudo déjà choisi : PSEUDO_TOO_SOON avant PSEUDO_TAKEN, ordre correct)
psql : has_function_privilege / relacl     -> voir §3
supabase stop                             -> pile 553xx arrêtée ; 543xx et pid 56612 non touchés
```

**Attaques menées par REST (`/rest/v1/rpc/save_progress`, jeton d'un scout réel)**

| Attaque | Résultat |
|---|---|
| `p_xp` = 10 000 000 | 200, `week_xp` 0 (p_xp ne sert qu'à l'XP perso) |
| QCM : `a` inventé + `g: 2` ; `g: 2` sans `a` | comptée (plafond), 0 XP ; note serveur 0 |
| Même carte reprise le même jour avec la bonne réponse | `grades_counted` 0 |
| Carte brouillon, carte inconnue | 0 comptée |
| `d` = +2, -9, 1e12, -5, texte | 200, 0 comptée (pas d'erreur qui bloquerait la file) |
| Doublons dans un lot (3 fois la même carte) | 1 comptée |
| 50 QCM réussis le même jour | `today_xp` 280 (30 cartes, 2 ratées comprises) ; sur deux appels : 30 au plus (pgTAP 07) |
| `t` dans 2 jours | ignoré (heure de réception) |
| `t` = dimanche 15:00 dernier pour viser la semaine échue | 0 comptée ; pgTAP 07 : `t` vers une semaine close reçue lundi 07:00, 0 |
| `p_grades` non tableau ; plus de 500 | 400 `22023 GRADES_INVALID` (front : file abandonnée, progression repart) |
| **Jours déclarés passés + demain, en un appel** | **1 480 XP de semaine un mercredi matin (L5-1)** |
| Appel du lot 4 à 3 clés | 200, réponse avec les 3 nouvelles colonnes en plus (le front du lot 4 les ignore) |
| Nouveau front sur ancienne base | PostgREST renvoie bien `PGRST202` pour une clé inconnue (vérifié) ; `isGradesUnsupported` garde la file (Vitest livré) |

## 2. Constats

| ID | Sévérité | Constat | Preuve | Statut |
|---|---|---|---|---|
| L5-1 | Mineur (anti-triche, limite de conception) | Le plafond A6 s'applique au **jour déclaré** `d`, pas au jour de réception. Un script peut, en un seul appel, déclarer 30 cartes pour chaque jour encore ouvert : dimanche précédent (sans `t`, la note est datée 23:59:59 donc semaine suivante), lundi, mardi, aujourd'hui et **demain** (`v_today + 1`, accepté pour des « fuseaux à l'est » alors que Dakar est en UTC+0). Le défi « 4 jours différents » s'obtient de la même façon. Borne : 9 jours x 300 = 2 700 XP par semaine contre ~2 100 à 2 400 pour un scout honnête au maximum. Les bonnes réponses étant lisibles par tout scout connecté (`cards.qcm.ok`), un script atteint toujours le plafond : seul le rattrapage en une séance et le jour « demain » sont évitables | REST : compte inscrit depuis 30 j, mercredi 10:36, `week_xp` 280 → **1 480** (`grades_counted` 120 ; jours -3..+1 tous rangés dans la semaine du 12/10). pgTAP 07 : 150 notes acceptées en un appel ; TODO « note datée de demain refusée » et « dimanche sans t : semaine du dimanche » en échec | Ouvert, **à arbitrer PM**. Pistes Back : refuser `d > v_today` ; sans `t`, dater la note du début du jour `d` (le front envoie toujours `t`) ; éventuellement plafonner le nombre de jours passés crédités par appel |
| L5-2 | Mineur (règle A8) | Ex aequo faussé : `league_refresh` met `last_gain_at = p_now` à chaque note reçue, **même à 0 XP** (QCM raté). Le scout arrivé le premier au total perd sa place dès qu'il rate une carte ensuite, ce qui peut changer une montée ou une descente | pgTAP 07 (TODO en échec) : 2 et 3 à 60 XP (09:00 et 10:00), 2 rate un QCM à 11:00, groupe de 5 : 3 monte au lieu de 2 | Ouvert, Back. Correctif d'une ligne proposé, non appliqué (migration du Back) : `last_gain_at = case when <nouvelle xp> <> m.xp then p_now else m.last_gain_at end` ; même règle à l'entrée (`max(received_at)` des seules notes à XP > 0). Passer le test 07 de `todo` à test |
| L5-3 | Mineur (modération) | Faux positifs de la liste amorcée : un mot en **inclusion** bloque des prénoms courants au Sénégal (famille Nazir, Nazira, Naziha, Nazim) ; trois mots wolof **exacts** peuvent être des noms ou surnoms usuels (un nom de famille, un surnom courant, un mot neutre) ; un mot français en inclusion bloque une graphie de Salahoudine. Rien d'autre sur 120 prénoms, noms de famille, villes et mots courants testés | `pseudo_blocked(pseudo_key(..))` sur la liste QA (psql) ; détail des mots donné à l'oral, la liste n'est pas recopiée ici | Ouvert. Back : passer le mot concerné en exact ; utilisateur : trancher les 3 mots wolof (déjà prévu par A12). Impact limité : l'aide du formulaire déconseille son prénom |
| L5-4 | Info (vie privée) | Changement de compte **sans** déconnexion : la file de notes et le classement gardé de A restent sur l'appareil sous les clés de A (pseudos du groupe de A). Jamais envoyés au nom de B ni affichés à B. Même règle que la copie de progression du lot 4 ; effacés à la déconnexion de A | Vitest « QA L5 : A puis B » (p_grades envoyés = seulement la carte de B ; file de A conservée pour A) | Accepté par conception, à savoir pour les téléphones partagés |
| L5-5 | Cosmétique | Bloc « Cette semaine » hors réseau : « DÉFI 3/4 JOURS (sur cet appareil) » alors que la valeur vient du dernier classement reçu (l'estimation locale est hors lot, A13) | `WeekBlock.tsx`, relecture | Ouvert, Front : retirer la mention ou écrire « (dernière connexion) » |
| L5-6 | Info (tests) | Les E2E du lot 3 (`qa-lot3-session`, `session-resume`) supposent que toute carte publiée est un QCM. Une carte publiée sans propositions (insérée par mes essais REST) a fait échouer 7 tests ; base remise à zéro : 51/51. Une telle carte est désormais un cas produit (A11) | 1er passage 43/50 ; captures : carte 2 sur 11, « À REJOUER 1 » ; 2e passage sur base propre 51/51 | Ouvert, QA ou Front : rendre ces E2E indépendants du type de la première carte |
| L5-7 | Info | Bannière « La semaine est terminée : le classement ne bouge plus » (`frozen`) inatteignable : entre dimanche 20:00 et lundi 06:00, le serveur renvoie déjà la semaine suivante en `pending` (« RÉSULTATS LUNDI MATIN » s'affiche bien) | `league_week_of` (+4 h) et `league_state`, relecture | Sans action (code mort inoffensif) |

Aucun bloquant, aucun majeur.

## 3. Points vérifiés sans constat

**Vie privée de mineurs**
- `get_league_state` (REST, groupe de 3 vrais comptes) : membres = `id, pseudo, xp, rank, zone, isMe` ; aucun `user_id`, aucun e-mail, aucun `@` dans la réponse ; `lastResult` seulement pour soi. `id` = `public_id` opaque par semaine ; `report_pseudo` avec un `user_id` : 400 `MEMBER_NOT_FOUND` ; avec l'id opaque : 204 sans corps ; deuxième signalement : sans effet.
- 8 nouvelles tables : RLS active, aucune politique, `relacl` = postgres et service_role seulement ; lecture REST : 403 (authenticated), 401 (anon) pour chacune.
- Fonctions : `has_function_privilege` = faux pour anon sur toutes les fonctions du lot 5 ; authenticated n'exécute que les 9 RPC publiques et `save_progress`. Par REST, 10 fonctions internes (`league_ingest` avec un `p_uid` d'autrui, `league_state`, `league_close_due`…) : 403/404. `pg_default_acl` local accorde bien EXECUTE par défaut : les `revoke` le compensent.
- 5 RPC admin appelées par un scout : 403 `42501 FORBIDDEN` ; par anon : 401. Écran admin : aucun e-mail (E2E QA).
- Séquence `league_groups_id_seq` : USAGE pour anon par `pg_default_acl`, sans conséquence (aucune RPC ne l'expose).

**Clôture (pgTAP 05 relu et rejoué, 07)** : refus avant lundi 06:00, faite à 06:05, rejouée sans effet, rejeu forcé sans double promotion ni badge ; n = 1 (rien), 5 (1 monte, filet 100 XP), 20 (5 montent, 3 descendent, milieu reste) ; ligue 6 sans montée, ligue 1 sans descente ; < 50 XP pas de montée ; inactif ni groupe ni changement ; pseudo retiré en cours de semaine : ni rang, ni issue, ni podium, ligue gardée (07). Fenêtre A7 : note de dimanche reçue lundi 05:00 comptée, 07:00 refusée ; état `pending` jusqu'à la clôture ; repli paresseux par `league_close_due` dans `get_league_state` ; pg_cron planifié toutes les heures.

**Hors ligne** : file `xxb.grades.v1.<uid>` envoyée une fois puis vidée, gardée sur erreur réseau, abandonnée sur `GRADES_INVALID`, gardée sur `PGRST202`, effacée à la déconnexion avec le classement gardé (Vitest livrés) ; aucune note de A envoyée au nom de B (QA). E2E : Ligue et Badges rechargés hors réseau depuis le worker, et ouverts hors réseau sans visite préalable (préchargement) ; `offline-revision` et `offline` du lot 4 verts.

**UX (relecture)** : phrases du design présentes à l'identique (invitation, bienvenue, hors réseau Ligue avec et sans cache, Badges hors réseau, erreur de classement, Quitter, pseudo retiré, signalement, admin) ; « Non merci » enregistré par le serveur (`opted_out`, l'invitation n'est montrée qu'en `no_pseudo`) ; aucun composant de séance modifié (pas de compteur de ligue en séance) ; résultat de la semaine montré au seul intéressé et sans « relégué » (« Vous continuez en … ») ; puces, lignes (48 px), boutons et résumés à 44 px ; fondu 200 ms coupé par la règle globale `prefers-reduced-motion` ; ligne de classement sur deux lignes sous 420 px.

## 4. Non couvert

- Captures réelles à 360 px, zoom 200 %, lecteur d'écran ; Android réel.
- Charge : 20 arrivées simultanées dans un groupe (verrou consultatif relu, non stressé) ; clôture sur un gros volume.
- pg_cron sur le projet hébergé (extension et droits) : responsabilité du SRE au déploiement.
- CI GitHub de la PR : non observable d'ici ; reste une condition de la porte.

## 5. Verdict

```
Release lot 5 : GO avec risques
Couverture : G1-G5, P1-P7, A1-A13 vérifiés sur les points d'anti-triche, vie privée, clôture, hors ligne et compatibilité ;
             E2E 51/51 en un passage, pgTAP 228 (3 TODO documentés), check vert, index 112,46 Ko gzip
Bugs ouverts : bloquants 0, majeurs 0, mineurs 3 (L5-1, L5-2, L5-3), cosmétique 1 (L5-5), infos 3
Risques résiduels :
| Risque | Impact | Mitigation | Accepté par (PM) |
| L5-1 jours déclarés : rattrapage en une séance, « demain » accepté | un script gagne jusqu'à ~2 700 XP/semaine en une fois | refuser d > aujourd'hui ; dater sans t au début du jour | à signer |
| L5-2 ex aequo repoussé par une note à 0 XP | une montée ou descente attribuée au mauvais scout à égalité | correctif d'une ligne (Back), test QA prêt | à signer ou corriger |
| L5-3 faux positifs de la liste de mots | quelques prénoms refusés | passer un mot en exact ; relecture wolof (A12) | à signer |
Recommandation : fusionner après correction de L5-2 (une ligne) et décision PM sur L5-1 ; L5-3 avant la mise en production.
```
