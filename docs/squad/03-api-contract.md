# Contrat lot 1 : enregistrement de la progression et retrait des documents

Décidé par l'orchestrateur (PM) le 2026-10-12. Le back et le front codent en parallèle contre ce contrat ; tout écart passe par l'orchestrateur.

## 1. RPC `public.save_progress`

```sql
public.save_progress(p_cards jsonb, p_sessions jsonb, p_xp integer)
  returns table (cards jsonb, sessions jsonb, xp integer, updated_at timestamptz)
  -- security invoker, search_path = '', execute accordé à authenticated seulement
```

- Agit uniquement sur la ligne `user_id = auth.uid()` (la crée si absente). Aucun paramètre `user_id`.
- **Fusion** avec la ligne existante, jamais un remplacement :
  - `cards` : union des clés. Pour une clé présente des deux côtés, garder l'entrée au plus grand nombre de vues (`[2]`) ; à égalité, la plus grande échéance (`[1]`).
  - `sessions` : union sans doublon (égalité de l'objet JSON entier), triée par `d` croissant, on garde les 200 dernières.
  - `xp` : `greatest(existant, p_xp)`.
- **Idempotente** : rejouer le même appel donne le même état (indispensable : nouvel essai après expiration en 3G).
- **Validation** (erreur `22023` sinon) : `p_cards` est un objet, chaque valeur un tableau de 5 entiers ≥ 0 ; `p_sessions` est un tableau d'au plus 200 objets ; `0 ≤ p_xp ≤ 10 000 000` ; `pg_column_size(p_cards) ≤ 262 144`.
- Retourne l'état fusionné ; le client l'adopte puis le refusionne avec ce qui a été noté pendant l'appel.
- La table `progress` garde ses politiques ; ajouter les bornes `check` (taille de `cards`, plafond de `xp`) et un déclencheur `updated_at = now()`.

## 2. Fusion côté client : `src/lib/progressMerge.ts`

`mergeProgress(a: Progress, b: Progress): Progress` applique **exactement** les mêmes règles (commutative, idempotente). Elle sert :
- au chargement : fusion de la copie locale et de la ligne serveur ;
- après `save_progress` : fusion de la réponse et de l'état en mémoire.

Copie locale : clé `localStorage` `xxb.progress.v1.<user_id>`, valeur `{ cards, sessions, xp }`, écrite à chaque note, lue et validée (entrées invalides ignorées) au chargement.

## 3. Retrait d'un document

- Politique `select` sur `storage.objects` pour `bucket_id = 'documents'` réservée à `is_admin()`, pour que `remove()` agisse.
- `deleteDocument` et le nettoyage après un échec d'insertion lèvent une erreur visible si `remove()` ne renvoie pas exactement un objet supprimé.

## 4. Variables de build

`vite build` en mode `production` échoue si `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` manquent. La CI fournit des valeurs factices (`https://ci.invalid`, `ci-anon-key`).

# Lot 5 : gamification (ligues, pseudo, badges, défi)

Implémenté par le back le 2026-10-14 (P5), arbitrages A1 à A11 de `15-lot5.md` appliqués. Migrations `20261014120000_lot5_league.sql`, `20261014120100_lot5_pseudo.sql`, `20261014120200_lot5_cron.sql`. Modèle : `17-archi-lot5.md`.
Tous les RPC : `security definer`, `search_path = ''`, `execute` accordé à `authenticated` seulement (`anon` reçoit `42501`), aucun paramètre `user_id` côté scout.

Erreurs : format PostgREST `{ code, message, details, hint }`. `code` est le SQLSTATE, `message` un **code métier stable** en MAJUSCULES que le front traduit. Les textes ne sont jamais affichés tels quels.

## L5-1. `save_progress` (évolution, compatible lot 4)

```sql
public.save_progress(p_cards jsonb, p_sessions jsonb, p_xp integer, p_grades jsonb default '[]')
  returns table (cards jsonb, sessions jsonb, xp integer, updated_at timestamptz,
                 week_xp integer, grades_counted integer, today_xp integer)
```
- Fusion et validation des 3 premiers paramètres : inchangées (§1). `p_xp` reste l'XP **personnelle** ; elle n'entre jamais dans le classement.
- `p_grades` : une entrée par carte notée, **la première note du jour** de cette carte :
  ```json
  [{ "c": "t1-01", "d": 20744, "a": "Texte exact de la proposition choisie", "t": 1792065600 },
   { "c": "t7-12", "d": 20744, "g": 1, "t": 1792065660 }]
  ```
  - `c` : id de carte. `d` : `dayNum` du jour de la note.
  - `a` (QCM, mode « Je réponds ») : texte de la proposition choisie, 500 caractères au plus. Le serveur le compare à `qcm.ok` de la carte publiée (NFC, espaces réduits, sans espace autour). **Égal = 10 XP, sinon 0.** Aucun « correct » déclaré n'est lu.
  - `g` ∈ {0, 1, 2} (carte sans `qcm` en base, auto-évaluation) : **5 XP quelle que soit la note**. Obligatoire pour ces cartes, ignoré pour les QCM.
  - `t` (facultatif, recommandé) : secondes epoch de la note. Sert à rattacher une note du dimanche à la bonne semaine (après 20:00 UTC : semaine suivante). Ignoré s'il est dans le futur (+5 min) ou à plus d'un jour de `d`. Sans `t` (ou `t` ignoré), la note est datée du **début** du jour `d` : une note de dimanche reste dans sa semaine si elle arrive avant lundi 06:00.
  - Mode « J'interroge » : n'envoie rien (0 XP de ligue).
  - C'est l'état de la carte **au moment du traitement** qui fait foi : une carte qui a reçu un `qcm` depuis la note exige `a`.
- Au plus 500 entrées et 256 Kio, sinon `22023 GRADES_INVALID`. Une entrée invalide, en double (même carte le même jour, y compris d'un appel précédent), hors borne (`d` avant l'inscription, plus de 8 jours en arrière, ou après aujourd'hui UTC : pas de tolérance J+1), d'une semaine close (après lundi 06:00 UTC) ou au-delà de **30 cartes par jour** est ignorée sans erreur. Les QCM ratés comptent dans les 30.
- `week_xp` : XP de ligue de la semaine en cours après l'appel (calculée même sans pseudo). `today_xp` : XP de ligue du jour UTC ; `today_xp >= 300` = plafond atteint (message du bilan). `grades_counted` : notes enregistrées par cet appel, QCM ratés compris.
- Le front retire de sa file `xxb.grades.v1.<user_id>` toutes les notes **envoyées** dès que l'appel réussit, et garde celles ajoutées pendant l'appel. En cas d'échec `retry`, il renvoie la même file : sans risque, l'appel est idempotent.
- Appel à 3 clés (front du lot 4) : fusion identique au lot 2 ; les 3 colonnes en plus sont ignorées. Vérifié par PostgREST en local.

## L5-2. Pseudo et participation

### `set_pseudo(p_pseudo text) returns jsonb`
- `{ "pseudo": "Élodie_K", "state": "ok" }`. Choisir un pseudo remet aussi `optIn` à vrai. Effet de bord : entrée dans un groupe si le scout a déjà des notes cette semaine (XP reprise).
- Règles (design C5) : 3 à 20 caractères ; commence par une lettre ; lettres latines accentuées et wolof (`ë ñ ŋ`), chiffres, `-`, `_` ; 4 chiffres au plus ; pas de `@` ni d'espace ni de point.
- Erreurs :
  - `22023 PSEUDO_INVALID` : `details` ∈ `too_short`, `too_long`, `chars`, `first_char`, `digits` (le front choisit le message C5).
  - `22023 PSEUDO_REFUSED` : mot refusé. Message neutre, sans dire lequel.
  - `23505 PSEUDO_TAKEN` : déjà pris, sans tenir compte de la casse, des accents ni des séparateurs. `hint` = suggestion libre (ex. `CalaoAgile28`) ou chaîne vide.
  - `P0001 PSEUDO_TOO_SOON` : un changement par 24 h. `hint` = date ISO UTC du prochain changement possible. Libres : le premier choix, un simple changement de casse, le choix après réinitialisation par l'admin.
- `p_pseudo = null` : retire le pseudo, le scout sort du classement de la semaine.
- Pas de limitation « trop d'essais » côté serveur (le front espace les envois).

### `set_league_opt_in(p_in boolean) returns jsonb`
- `{ "optIn": false }`. `false` (« Quitter les ligues » ou « Non merci ») : sort tout de suite du groupe et **libère le pseudo** (design P-G). Revenir = `set_pseudo` (retour dans la dernière ligue atteinte). `true` : annule un « Non merci ».

## L5-3. `get_league_state() returns jsonb`

Lecture de l'écran Ligue, du bloc « Cette semaine » et du bilan. Une requête, environ 3 Ko. Effet de bord : clôture paresseuse des semaines échues.

```json
{
  "status": "active",
  "weekStart": "2026-10-12", "weekEnd": "2026-10-18",
  "endsAt": "2026-10-18T20:00:00+00:00", "deadline": "2026-10-19T06:00:00+00:00",
  "pseudo": "Élodie_K", "pseudoState": "ok", "optIn": true,
  "tier": 2, "weekXp": 230, "todayXp": 60,
  "groupSize": 18, "upCount": 5, "downCount": 3,
  "group": [ { "id": "b1c4…", "pseudo": "Moussa7", "xp": 400, "rank": 1, "zone": "up", "isMe": false } ],
  "lastResult": { "weekStart": "2026-10-05", "rank": 3, "outcome": 1, "tierBefore": 1, "tierAfter": 2, "groupSize": 17 },
  "challenge": { "kind": "active_days", "target": 4, "progress": 2, "done": false, "zone": null },
  "badges": [ { "badge": "promoted", "weekStart": "2026-10-05", "earnedAt": "2026-10-12T06:05:00+00:00" } ],
  "serverTime": "2026-10-14T10:00:00+00:00"
}
```

`status` vaut :
- `reset` : pseudo retiré par un responsable, inviter à en choisir un autre.
- `opted_out` : le scout a quitté les ligues ou dit « Non merci ».
- `no_pseudo` : aucun pseudo choisi.
- `active` : le scout est dans un groupe.
- `pending` : entre dimanche 20:00 et lundi 06:00 UTC, la semaine passée n'est pas close (« Résultats lundi matin »), `group` est vide.
- `not_started` : aucune note cette semaine, `group` est vide.

Hors `active` : `group = []`, `groupSize = upCount = downCount = 0` ; `tier`, `weekXp`, `todayXp`, `challenge` et `badges` toujours fournis.

Semaine : lundi 00:00 à dimanche 20:00 UTC (`endsAt`) ; notes acceptées jusqu'à `deadline` (lundi 06:00). Entre `endsAt` et lundi 00:00, `weekStart` est déjà le lundi suivant.

Champs du groupe :
- trié par `rank`, 20 lignes au plus ; ex aequo : le premier arrivé au total passe devant (une note à 0 XP ne change pas cette heure).
- `id` : identifiant opaque, différent chaque semaine, à passer à `report_pseudo`. Ce n'est **jamais** un `user_id`.
- `zone` : `up` si `rank <= upCount` et `xp >= 50` ; `down` si `rank > groupSize - downCount` et `xp < 100` ; sinon `stay`. `upCount = min(5, ⌊n/3⌋)` (0 en ligue 6), `downCount = min(3, ⌊n/5⌋)` (0 en ligue 1).
- Un membre sans pseudo valide n'est pas listé.

`lastResult` : `null` si le scout n'a pas été classé la semaine précédente. `outcome` ∈ -1, 0, 1. Le front l'affiche une fois.
`challenge.kind` (rotation fixe, design C4) : `active_days` (4), `zone_cards` (30, `zone` = zone du mois en cours), `su` (40 QCM réussis ou auto-évaluations « Su »), `cards` (60). Tout calculé depuis les notes serveur.
`badges[].badge` ∈ `challenge` (une par semaine relevée), `podium` (une par semaine), `promoted` (une fois), `polar_star` (une fois).

Hors ligne : le front affiche la dernière réponse mise en cache, avec « Hors réseau : classement de la dernière connexion » et `serverTime`.

## L5-4. `report_pseudo(p_member uuid) returns void`

`p_member` = `group[].id` de la semaine en cours. Un signalement par (auteur, cible, pseudo), un second est sans effet. Sans motif.
- `22023 MEMBER_NOT_FOUND` : identifiant hors du groupe de l'auteur, ou soi-même.
- `P0001 RATE_LIMITED` : plus de 10 signalements en 24 h.

## L5-5. Administration (`is_admin()`, sinon `42501 FORBIDDEN`)

### `admin_list_pseudos(p_search text default null, p_after text default null, p_limit int default 50)`
- Retourne `table (user_id uuid, pseudo text, tier smallint, changed_at timestamptz, reports int, cursor text)`. Aucun e-mail.
- Tri : signalements non écartés décroissants, puis choix le plus récent (design P-H). `p_after` = `cursor` de la dernière ligne reçue (opaque, sinon `22023 CURSOR_INVALID`). `p_limit` borné à 1..100. `p_search` : sous-chaîne, sans casse ni accents. Liste vide : `[]`.

### `admin_moderate_pseudo(p_user uuid, p_action text) returns void`
- `reset` : pseudo effacé, `pseudoState = reset`, le scout disparaît des classements (il reste membre, non classé tant qu'il n'a pas de nouveau pseudo).
- `refuse` : comme `reset`, et la clé est ajoutée aux mots refusés exacts.
- `ignore` : écarte les signalements en cours (compteur à 0).
- Les trois écartent les signalements. Erreurs : `22023 ACTION_INVALID`, `22023 USER_NOT_FOUND` (pas de pseudo actif).

### Mots refusés (A10)
- `admin_list_blocked_words() returns table (word text, exact boolean)`.
- `admin_set_blocked_word(p_word text, p_exact boolean default false) returns text` : mot normalisé renvoyé (`Gros Mot` → `grosmot`), `22023 WORD_INVALID` hors 2 à 30 caractères. `exact = false` : refusé s'il est contenu dans le pseudo ; `true` : seulement s'il est égal (avec ou sans chiffres).
- `admin_remove_blocked_word(p_word text) returns void`.
- Ajouter un mot ne retire pas les pseudos existants : l'admin les cherche et les réinitialise.

## L5-6. Calculé côté client (aucun appel)

- Niveaux et grades : `xpLevel(progress.xp)`, barème C2, grade affiché = max(nouveau barème, ancien) (A1).
- Badges personnels (série, questions sues, zone maîtrisée…) : fonctions pures sur `progress`, disponibles hors ligne.
- Estimation hors ligne de l'avancement du défi : file locale des notes plus dernier `challenge` reçu, affichée « à confirmer » jusqu'au prochain envoi.
