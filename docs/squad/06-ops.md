# 06 : Exploitation pas à pas (Xam Xam Bëy)

Pour un bénévole, sans aide. Cocher chaque case au fur et à mesure. Aucun secret ne s'écrit dans ce fichier, dans git ni dans un message WhatsApp : seulement dans les champs prévus des tableaux de bord.

**Hypothèses** : H1. Cible choisie (lot 2) : **Cloudflare Pages, projet `xam-xam-bey`, envoi direct**, `https://xam-xam-bey.pages.dev` ; Netlify et Workers abandonnés. H2. Dépôt GitHub privé sur un compte gratuit : pas de protection de branche, donc une CI rouge **n'empêche pas** un déploiement ; parades : CI verte vérifiée avant chaque envoi (B1) et `npm run deploy:pages` relance `npm run check`. H3. RPO 30 jours, RTO 4 heures, à valider par le PM. H4. Les sections D et C3 demandent Docker Desktop (la CLI Supabase lance `pg_dump` dans un conteneur).

Vocabulaire : **URL de prod** = adresse publique du site (ex. `https://xam-xam-bey.pages.dev`). **Réf. projet** = identifiant Supabase visible dans l'URL du tableau de bord (`supabase.com/dashboard/project/<réf>`).

## A. Envoi des e-mails : SMTP Gmail de l'association (fait le 2026-10-13)

Sans SMTP externe, Supabase n'envoie qu'environ 2 e-mails par heure. Décision du 2026-10-13 : pas de nom de domaine (budget nul), donc pas de Brevo ; les liens magiques partent du compte Gmail réservé `xamxambey.revision@gmail.com`. Le mot de passe d'application est un secret : il ne s'écrit nulle part ailleurs que dans le champ Password de Supabase.

- [x] A1. Compte Gmail réservé, **validation en deux étapes active** (indispensable aux mots de passe d'application). Accès : 2 admins, téléphone de récupération de l'association.
- [x] A2. Compte Google > **Sécurité** > **Mots de passe des applications** : mot de passe nommé « supabase » (affiché une seule fois, collé directement en A3).
- [x] A3. Supabase > **Authentication** > **Emails** > **SMTP Settings**, custom SMTP activé : Host `smtp.gmail.com`, Port `587` ; Username et Sender email = `xamxambey.revision@gmail.com` (doivent être identiques) ; Sender name `Xam Xam Bëy` ; Password = mot de passe d'application de A2.
- [ ] A4. **Authentication** > **Rate Limits** > e-mails : **20 par heure** (lot 2 ; était 30). 20 × 24 = 480, sous le plafond Gmail ≈ 500 par jour, même avec le bouton « Renvoyer ».
- [x] A5. **URL Configuration** : Site URL `https://xam-xam-bey.pages.dev`, Redirect URLs `https://xam-xam-bey.pages.dev/**` ; anciennes URL Netlify retirées.
  En option (jamais d'autres domaines) : `http://localhost:5173/**` pour tester la connexion en local ; `https://*.xam-xam-bey.pages.dev/**` seulement si on envoie un jour un aperçu (autre `--branch`). Sans eux, le lien y est refusé.
- [x] A6. Test du 2026-10-13 : 3 adresses extérieures à l'équipe, **3 e-mails reçus**. À refaire après tout changement de A2 à A7 (regarder aussi les Spams, ouvrir le lien sur un Android).
- [ ] A7. **Modèles d'e-mail avec code** (lot 2, D4). **À faire dès maintenant, avant le lot 2** : le front du lot 1 en ligne n'utilise que le lien, et le lien reste dans l'e-mail. Seul effet d'ici I7 : l'e-mail montre un code que l'écran du lot 1 ne demande pas encore. **Authentication** > **Emails** > **Templates**. Textes définitifs : `05-build.md`, « Lot 2 > Front A », identiques aux fichiers `supabase/templates/*.html` testés par l'E2E (copier depuis l'un ou l'autre, sans retoucher).
  - **Magic Link** (adresse déjà connue). Sujet : `Votre connexion à Xam Xam Bëy : code {{ .Token }}`. Corps (onglet Source) : contenu de `supabase/templates/magic_link.html`. **Save**.
  - **Confirm signup** (premier envoi à une adresse inconnue). Sujet : `Bienvenue sur Xam Xam Bëy : code {{ .Token }}`. Corps : contenu de `supabase/templates/confirmation.html`. **Save**.
  - Relire les deux corps : `{{ .Token }}` (code) **et** `{{ .ConfirmationURL }}` (lien) présents, et la phrase « Pas les deux : le lien utilise le code. » (le lien et le code partagent un seul jeton : QA L2-2).
  - **Authentication** > **Sign In / Providers** > **Email** : *Email OTP Length* = **6**, *Email OTP Expiration* = **3600** s (comme `supabase/config.toml`).
  - Test (front lot 1, 2 envois sur les 20 par heure de A4) : (1) une adresse **connue** (un admin) ; (2) une adresse **neuve**, jamais utilisée sur le site. Chaque e-mail arrive (regarder les Spams), a le bon sujet avec 6 chiffres, le même code dans le corps, et un lien qui connecte au site. Le code saisi dans l'écran se teste en I8 (front lot 2). Si échec : recoller le sujet et le corps d'avant (les copier dans une note locale avant de modifier, ils ne contiennent aucun secret), le lien du lot 1 refonctionne.

**Rotation** (fuite supposée, départ d'un bénévole qui y avait accès, ou une fois par an) :
- [ ] Compte Google > Mots de passe des applications > **révoquer** « supabase », en créer un nouveau du même nom, le coller dans Supabase (A3) > **Save**, refaire le test A6 avec une adresse.
- [ ] Départ d'un bénévole : changer aussi le mot de passe du compte Google (cela révoque tous les mots de passe d'application : recréer celui de A2 juste après) et retirer son téléphone de la validation en deux étapes.

**Diagnostic** (Supabase > **Authentication** > **Logs**, filtrer sur les erreurs d'envoi) :
- `535` (« Username and Password not accepted ») : mot de passe d'application révoqué ou faux, ou validation en deux étapes désactivée. Vérifier A1, puis rotation.
- `550 5.4.5` / « Daily sending limit exceeded », ou e-mails qui n'arrivent plus sans erreur Supabase : plafond Gmail atteint, **Gmail bloque l'envoi jusqu'à 24 h**. Rien à faire côté Supabase ; prévenir les responsables (connexion possible le lendemain), ne pas relever A4.
- `rate limit` côté Supabase : la limite de A4 est atteinte (plus de 20 envois dans l'heure), attendre l'heure suivante.
- Alerte de sécurité dans la boîte du compte (« connexion bloquée ») : la lire depuis un poste admin, confirmer l'activité.

**Plan de sortie** : si les besoins dépassent 500 e-mails par jour (ou blocages Gmail répétés), acheter un nom de domaine (~10 $/an) et passer à Brevo (300/jour gratuit, domaine authentifié), avec un nouveau test A6.

## B. Déployer le site (Cloudflare Pages, envoi direct)

Réalité depuis le lot 1 : le projet Pages `xam-xam-bey` est en **Direct Upload** (aucun lien avec GitHub). Le site part d'un poste par `npm run deploy:pages` (`scripts/deploy-pages.sh`), **toujours depuis `main` propre** : le script refuse une autre branche, des modifications non commitées, un `main` différent de `origin/main` ou l'absence de `.env.local`, puis lance `npm run check` (types, tests, build) et envoie `dist/`.
Pourquoi pas d'intégration Git : Cloudflare ne relie pas un projet Direct Upload à Git après coup. Migrer = créer un **nouveau** projet Pages « Connect to Git » (build `npm run check`, sortie `dist`, variables `VITE_*` et `NODE_VERSION=22`), donc une nouvelle adresse `*.pages.dev` : refaire A5, F (`SITE_URL`), G, prévenir les responsables, puis supprimer l'ancien projet.

- [ ] B1. GitHub > Actions > **ci** : dernier run de `main` vert (jobs `app` et `db`). Sinon, ne pas déployer.
- [ ] B2. `git switch main && git pull`, puis `git status` vide.
- [ ] B3. `.env.local` contient la vraie URL `https://<réf>.supabase.co` et la clé anon (pas `https://ci.invalid`) ; ne jamais le commiter.
- [ ] B4. `npm run deploy:pages` (connexion Cloudflare demandée la première fois). Noter le SHA affiché.
- [ ] B5. URL de prod en navigation privée : la bibliothèque s'affiche, 3 PDF s'ouvrent, la connexion fonctionne. Sinon, C1.
- [ ] B6. Nettoyage côté tableaux de bord (le dépôt est fait au lot 2) : site Netlify supprimé (Site configuration > **Delete this site**) ; Worker `xam-xam-bey` éventuel supprimé dans Workers & Pages. Noter la date.

## C. Revenir en arrière (objectif : moins de 5 minutes)

**C1. Le site (Cloudflare Pages)**
- [ ] Cloudflare > **Workers & Pages** > `xam-xam-bey` > **Deployments**.
- [ ] Repérer le dernier déploiement **Production** sain (date antérieure au problème).
- [ ] Menu **⋯** > **Rollback to this deployment** > confirmer (marche aussi en envoi direct : les anciens envois sont gardés). Effet en moins d'une minute, sans rebuild.
- [ ] Vérifier l'URL de prod en navigation privée (bibliothèque, 1 PDF, connexion).

**C2. Corriger dans git, sinon le prochain envoi réintroduit le bug**
- [ ] `git log --oneline -10` pour trouver le commit fautif, puis `git revert <sha>` et `git push origin main`.
- [ ] Attendre la CI verte, puis redéployer par la section B (rien ne part tout seul), et vérifier à nouveau.

**C3. La base (pas de retour en arrière de schéma : on corrige en avant)**
- [ ] **Avant toute migration**, faire un dump de sécurité (variable `DB_URL` comme en D2) :
  `supabase db dump --db-url "$DB_URL" --data-only --use-copy -s public -f avant-$(date +%F).sql`
- [ ] Appliquer la migration **uniquement** par `supabase db push`, jamais par l'éditeur SQL. Contrôler avec `supabase migration list`.
- [ ] En cas de dégât : écrire une **nouvelle migration** qui corrige (colonne remise, données rétablies), la pousser par `supabase db push`.
- [ ] Si des lignes ont été perdues : retrouver les lignes concernées dans `avant-<date>.sql` et les réinsérer par une migration ciblée. Ne jamais rejouer tout le fichier sur la prod.

**C4. Exercice** : une fois par trimestre, déployer un petit changement visible, faire C1, chronométrer, noter dans le journal.

## D. Sauvegarde mensuelle et test de restauration

Le 1er de chaque mois, ~15 min, sur l'ordinateur d'un admin (Docker Desktop lancé, CLI Supabase installée).

- [ ] D1. Créer un dossier hors du dépôt : `mkdir -p ~/sauvegardes-xxb/$(date +%Y-%m) && cd ~/sauvegardes-xxb/$(date +%Y-%m)`
- [ ] D2. Chaîne de connexion : Supabase > **Connect** (en haut) > **Session pooler** > copier l'URI. La saisir **sans** qu'elle reste dans l'historique :
  `read -rs DB_URL; export DB_URL` (coller, Entrée ; rien ne s'affiche, c'est normal). Remplacer `[YOUR-PASSWORD]` avant de coller (mot de passe : Project Settings > Database > Reset si perdu).
- [ ] D3. Dumps :
  `supabase db dump --db-url "$DB_URL" -f roles.sql --role-only`
  `supabase db dump --db-url "$DB_URL" -f schema.sql`
  `supabase db dump --db-url "$DB_URL" -f data.sql --data-only --use-copy -s public,auth`
- [ ] D4. Copie des PDF du bucket (liste lue dans la table `documents`, clé anon publique) :
  `read -rs SUPABASE_URL; read -rs ANON; mkdir -p pdf`
  `curl -fsS -H "apikey: $ANON" -H "Accept: text/csv" "$SUPABASE_URL/rest/v1/documents?select=storage_path" | tail -n +2 | while read -r p; do curl -fsS -o "pdf/$p" "$SUPABASE_URL/storage/v1/object/public/documents/$p" || echo "ÉCHEC $p"; done`
  Vérifier : `ls pdf | wc -l` égale le nombre de documents, aucune ligne « ÉCHEC ».
- [ ] D5. Chiffrer (les dumps contiennent des e-mails) :
  `tar czf - roles.sql schema.sql data.sql pdf | openssl enc -aes-256-cbc -pbkdf2 -salt -out xxb-$(date +%Y-%m).tar.gz.enc`
  Mot de passe : celui du coffre de l'association (jamais dans ce fichier). Puis `rm -rf roles.sql schema.sql data.sql pdf`.
- [ ] D6. Déposer le `.enc` sur le Drive de l'association **et** garder une copie sur un disque externe (3 copies, 2 supports, 1 hors site). Garder 6 mois.
- [ ] D7. `unset DB_URL ANON` et fermer le terminal.

**Test de restauration** (une fois par trimestre, chronométré, objectif < 4 h) :
- [ ] Créer un projet Supabase gratuit **de test** (2 projets gratuits par organisation), noter sa chaîne de connexion dans `TEST_DB_URL` avec `read -rs`.
- [ ] Déchiffrer : `openssl enc -d -aes-256-cbc -pbkdf2 -in xxb-AAAA-MM.tar.gz.enc | tar xzf -`
- [ ] Restaurer :
  `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "$TEST_DB_URL"`
- [ ] Contrôler : nombre de lignes de `documents`, `cards`, `progress` identique à la prod (éditeur SQL : `select count(*) from public.cards;`), un compte connu existe dans Authentication > Users.
- [ ] Noter la durée dans le journal, puis **supprimer le projet de test** (Project Settings > General > Delete project).

## E. Runbooks

**E1. Le site ne charge plus, ou les PDF ne s'ouvrent plus**
Symptôme : alerte UptimeRobot, e-mail d'échec de la sonde GitHub, ou message d'un responsable.
1. [ ] Ouvrir l'URL de prod en navigation privée sur téléphone. Erreur Cloudflare ? Voir cloudflarestatus.com.
2. [ ] La page s'affiche mais pas les PDF ni la connexion : Supabase > tableau de bord. Bandeau **Paused** ? Cliquer **Restore project** (quelques minutes), puis GitHub > Actions > **sonde** > **Run workflow**.
3. [ ] Pas en pause : Supabase > **Usage** (quota d'egress dépassé ?) et status.supabase.com.
4. [ ] Problème apparu juste après un déploiement (comparer avec Cloudflare > Deployments) : **rollback C1** immédiatement, comprendre ensuite.
5. [ ] Message au groupe WhatsApp des responsables au début et à la résolution.
Escalade : mainteneur technique, puis propriétaire de l'organisation Supabase / du compte Cloudflare.

**E2. Plus personne ne reçoit le lien de connexion**
1. [ ] Tester soi-même avec une adresse extérieure (et regarder les Spams).
2. [ ] Supabase > **Authentication** > **Logs** : appliquer le **Diagnostic** de la section A (`535` = rotation du mot de passe d'application ; `550 5.4.5` ou rien = plafond Gmail, blocage jusqu'à 24 h ; `rate limit` = attendre l'heure suivante).
3. [ ] Se connecter au compte Gmail de l'association : alerte de sécurité ? dossier **Envoyés** (les liens partent-ils) ? messages « Delivery Status Notification » (adresse refusée) ?
4. [ ] Le lien arrive mais renvoie vers une mauvaise adresse ou une erreur : vérifier **URL Configuration** (A5).
5. [ ] Le lien s'ouvre dans un autre navigateur que celui de la demande (Android) : saisir le **code à 6 chiffres** de l'e-mail dans l'application (lot 2). Pas de code dans l'e-mail : refaire A7.
6. [ ] Prévenir les responsables, donner une heure de retour estimée.

## F. Secrets GitHub pour la sonde

GitHub > dépôt > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**, trois fois :
- [ ] `SITE_URL` : URL de prod, sans `/` final.
- [ ] `SUPABASE_URL` : `https://<réf>.supabase.co`.
- [ ] `SUPABASE_ANON_KEY` : clé anon (jamais la clé service role ni une clé `sb_secret_…`).
- [ ] Actions > **sonde** > **Run workflow** : le job doit passer au vert.
- [ ] La personne qui doit recevoir les alertes est celle qui a modifié en dernier la ligne `cron` de `.github/workflows/sonde.yml` (règle GitHub). Si ce n'est pas le mainteneur, il fait un petit commit sur cette ligne. Vérifier aussi GitHub > Settings > Notifications > Actions : « Only notify for failed workflows » coché, par e-mail.
- La sonde tourne chaque jour : elle maintient aussi le projet Supabase actif (pause après 7 jours sans activité).

## G. UptimeRobot (alerte toutes les 5 minutes, indépendante de GitHub)

- [ ] Compte gratuit sur uptimerobot.com avec l'e-mail de l'association.
- [ ] **Add New Monitor** : type **Keyword**, URL = URL de prod, keyword = `root`, alerte si **Keyword not exists**, intervalle **5 minutes**.
- [ ] **Alert Contacts** : ajouter 2 bénévoles (e-mail), les cocher sur la sonde.
- [ ] Test : mettre la sonde en pause puis la réactiver, vérifier la réception d'un e-mail par chacun.
- Seuil : panne > 10 min = runbook E1.

## H. Mise en production du lot 1 (migration `20261013090000_lot1.sql` puis front)

Reprend la checklist de `07-qa.md` §6. Une personne, un ordinateur avec Docker Desktop et la CLI Supabase, depuis la racine du dépôt à jour (`git pull`, `git status` vide). **Ne pas sauter d'étape. Si une étape échoue : s'arrêter, appliquer la consigne « Si échec », ne pas continuer.**

- [ ] H0. Prérequis : CI verte sur le dernier commit de `main` (GitHub > Actions > ci, jobs `app` et `db`). SMTP Gmail en place et testé (section A, fait le 2026-10-13).
  Si échec : ne rien pousser en base ; signaler au Back le job rouge.
- [ ] H1. **Sauvegarde d'abord** : faire la section D (D1 à D7) complète, puis le dump de sécurité C3 :
  `supabase db dump --db-url "$DB_URL" --data-only --use-copy -s public -f avant-$(date +%F).sql`
  Vérifier que le fichier n'est pas vide : `ls -lh avant-*.sql`.
  Si échec (erreur Docker, mot de passe) : lancer Docker Desktop ; recopier l'URI du Session pooler (D2). Pas de dump = pas de migration.
- [ ] H2. Lier le dépôt au projet : `supabase link --project-ref <réf>` (mot de passe de la base demandé, saisie masquée).
  Si échec : vérifier la réf. dans l'URL du tableau de bord ; « permission denied » = se connecter d'abord avec `supabase login`.
- [ ] H3. `supabase migration list`. Colonne **Remote** : les 5 versions du 2026-10-12 (`20261012120000`, `20261012153523`, `20261012160527`, `20261012164101`, `20261012191639`) doivent y figurer ; `20261013090000` doit figurer en **Local** seulement.
  Si une des 5 manque en Remote alors qu'elle a déjà été appliquée à la main (tables `documents`, `cards`, `revision_content` présentes dans Table Editor), pour **chacune** : `supabase migration repair --status applied <version>`, puis relancer `supabase migration list`.
  Si une des 5 n'a jamais été appliquée (table absente) : s'arrêter et demander au Back, ne pas réparer.
- [ ] H4. `supabase db push --dry-run` : la liste proposée doit contenir **uniquement** `20261013090000_lot1.sql`.
  Si échec (d'autres fichiers proposés) : NE PAS pousser ; revenir à H3 (sinon le contenu de révision est réécrit et les cartes et documents supprimés par l'admin reviennent).
- [ ] H5. Contrôle des bornes, Supabase > **SQL Editor** (lecture seule), tous les nombres doivent valoir **0** :
  `select count(*) filter (where xp > 10000000) as xp_trop, count(*) filter (where pg_column_size(cards) > 262144) as cartes_trop, count(*) filter (where pg_column_size(sessions) > 65536) as seances_trop from public.progress;`
  (`seances_trop` vérifie la contrainte `progress_sessions_size` ajoutée par la migration : une ligne au-delà ferait échouer H6.)
  Si échec (un nombre > 0) : ne pas pousser ; transmettre au Back le résultat de `select user_id, xp, pg_column_size(cards), pg_column_size(sessions) from public.progress order by 3 desc limit 5;` pour décider (correction de la ligne ou borne relevée).
- [ ] H6. `supabase db push` (confirmer par `y`), puis `supabase migration list` : `20261013090000` présent en Local **et** Remote.
  Si échec : la migration est dans une transaction, rien n'est appliqué à moitié. Copier le message d'erreur au Back ; le site actuel continue de fonctionner (aucun front n'a été déployé).
- [ ] H7. **Seulement maintenant**, déployer le front par la section B (`npm run deploy:pages` depuis `main` propre). Jamais le front avant la base.
  Si échec : le site précédent reste en ligne ; lire le message du script ou de wrangler, corriger, relancer.
- [ ] H8. Vérification en prod, compte A, deux navigateurs : noter une carte différente dans chacun, recharger les deux : les deux cartes sont là. DevTools > Network : `rpc/save_progress` répond 200.
  Si échec : rollback du site seul (C1) ; la base peut rester (compatible avec l'ancien front). Prévenir Back et QA.
- [ ] H9. Admin : retirer un PDF de test : message de succès, puis son URL publique en navigation privée répond 400 ou 404.
  Si échec : remettre le PDF, signaler au Back (le reste du lot peut rester en ligne).
- [ ] H10. **Smoke Android** : téléphone d'entrée de gamme en 3G (ou Chrome DevTools en « Slow 3G ») : lien magique reçu et ouvert, session du jour, 3 PDF ouverts ; noter une carte, fermer l'onglet, rouvrir : la note est là.
  Si échec : rollback C1 si bloquant pour tous ; sinon ouvrir un bug et ne pas annoncer la révision.
- [ ] H11. Annoncer la révision aux responsables seulement après H10. Noter la date et la durée dans le journal.

Retrait de la migration (dernier recours, jamais en éditant l'ancien fichier) : nouvelle migration avec le SQL de `07-qa.md` §6 « Retrait de la migration », poussée par `supabase db push`.

## I. Mise en production du lot 2 (migration `20261014090000_lot2.sql` puis front)

Même discipline que H (une personne, Docker Desktop, CLI Supabase, consigne « Si échec » de H en cas d'erreur). La base passe avant le front : la migration reste compatible avec le front du lot 1 encore en ligne.

- [ ] I0. Prérequis : PR du lot 2 fusionnée, CI verte sur `main` (B1) ; verdict QA du lot 2 = GO ; A4 (20/h) fait. A7 ne bloque plus : il se fait avant, indépendamment (voir A7) ; s'il n'est pas encore fait, le faire ici, avant I7, sinon le front lot 2 demande un code que l'e-mail ne contient pas.
- [ ] I1. Sauvegarde : section D complète puis dump C3 (`avant-$(date +%F).sql`, non vide). Pas de dump = pas de migration.
- [ ] I2. `supabase link --project-ref <réf>` si le poste n'est pas encore lié (comme H2).
- [ ] I3. `supabase migration list` : `20261013090000` en Local **et** Remote ; `20261014090000` en **Local seulement**.
- [ ] I4. `supabase db push --dry-run` : la liste contient **uniquement** `20261014090000_lot2.sql`. Sinon NE PAS pousser, revenir à I3 et demander au Back.
- [ ] I4b. Avant le push, dans le SQL Editor de Supabase : `select version();`. Noter la version ; attendu « PostgreSQL 17 ». Si elle est inférieure, pousser quand même : la migration saute le retrait de `maintain` sans erreur. Signaler la version au Back.
- [ ] I5. `supabase db push` (confirmer par `y`), puis `supabase migration list` : `20261014090000` en Local et Remote.
- [ ] I6. Front du lot 1 toujours en ligne : noter une carte, recharger, la note est là (`rpc/save_progress` 200). Si échec : prévenir le Back (correctif par nouvelle migration, voir 05-build « Lot 2 > Back »).
- [ ] I7. Front : section B (B2 à B5) depuis `main` propre.
- [ ] I8. Vérifications en prod (Android d'entrée de gamme en 3G, ou « Slow 3G ») : e-mail reçu avec lien **et** code ; le code saisi connecte ; « Renvoyer » attend 60 s ; le bouton retour Android revient à l'écran précédent ; noter une carte, fermer, rouvrir : la note est là ; 3 PDF ouverts ; Admin : une modification de carte est enregistrée. Si bloquant : C1 (la base peut rester).
- [ ] I9. Annoncer aux responsables, noter date et durée dans le journal.

## Journal d'exploitation

| Date | Exercice / incident | Durée | Remarque |
|---|---|---|---|
| 2026-10-13 | Mise en place SMTP Gmail, test 3 adresses extérieures | | 3 e-mails reçus (section A) |
| 2026-10-13 | Mise en production lot 1 (H1 à H10) | | Sauvegarde faite ; historique réparé pour 20261012191639 (appliquée à la main) ; migration 20261013090000 poussée ; front déployé par deploy:pages ; H8, H9, H10 OK. Mot de passe de la base changé (exposé en conversation). |
| | | | |
