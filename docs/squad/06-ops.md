# 06 : Exploitation pas à pas (Xam Xam Bëy)

Pour un bénévole, sans aide. Cocher chaque case au fur et à mesure. Aucun secret ne s'écrit dans ce fichier, dans git ni dans un message WhatsApp : seulement dans les champs prévus des tableaux de bord.

**Hypothèses** : H1. La cible de production n'est pas encore choisie (Netlify, Workers ou Pages) ; la section B recommande Cloudflare Pages reliée à Git. H2. Dépôt GitHub privé sur un compte gratuit : la protection de branche n'y est pas disponible, donc une CI rouge **n'empêche pas** un déploiement ; c'est pourquoi Pages doit construire avec `npm run check` (B.3). H3. RPO 30 jours, RTO 4 heures, à valider par le PM. H4. Les sections D et C.5 demandent Docker Desktop (la CLI Supabase lance `pg_dump` dans un conteneur).

Vocabulaire : **URL de prod** = adresse publique du site (ex. `https://xam-xam-bey.pages.dev`). **Réf. projet** = identifiant Supabase visible dans l'URL du tableau de bord (`supabase.com/dashboard/project/<réf>`).

## A. Envoi des e-mails : SMTP Gmail de l'association (fait le 2026-10-13)

Sans SMTP externe, Supabase n'envoie qu'environ 2 e-mails par heure. Décision du 2026-10-13 : pas de nom de domaine (budget nul), donc pas de Brevo ; les liens magiques partent du compte Gmail réservé `xamxambey.revision@gmail.com`. Le mot de passe d'application est un secret : il ne s'écrit nulle part ailleurs que dans le champ Password de Supabase.

- [x] A1. Compte Gmail réservé, **validation en deux étapes active** (indispensable aux mots de passe d'application). Accès : 2 admins, téléphone de récupération de l'association.
- [x] A2. Compte Google > **Sécurité** > **Mots de passe des applications** : mot de passe nommé « supabase » (affiché une seule fois, collé directement en A3).
- [x] A3. Supabase > **Authentication** > **Emails** > **SMTP Settings**, custom SMTP activé : Host `smtp.gmail.com`, Port `587` ; Username et Sender email = `xamxambey.revision@gmail.com` (doivent être identiques) ; Sender name `Xam Xam Bëy` ; Password = mot de passe d'application de A2.
- [x] A4. **Authentication** > **Rate Limits** > e-mails : **30 par heure** (plafond Gmail ≈ 500 envois par jour).
- [x] A5. **URL Configuration** : Site URL `https://xam-xam-bey.pages.dev`, Redirect URLs `https://xam-xam-bey.pages.dev/**` ; anciennes URL Netlify retirées.
- [x] A6. Test du 2026-10-13 : 3 adresses extérieures à l'équipe, **3 e-mails reçus**. À refaire après tout changement de A2 à A5 (regarder aussi les Spams, ouvrir le lien sur un Android).

**Rotation** (fuite supposée, départ d'un bénévole qui y avait accès, ou une fois par an) :
- [ ] Compte Google > Mots de passe des applications > **révoquer** « supabase », en créer un nouveau du même nom, le coller dans Supabase (A3) > **Save**, refaire le test A6 avec une adresse.
- [ ] Départ d'un bénévole : changer aussi le mot de passe du compte Google (cela révoque tous les mots de passe d'application : recréer celui de A2 juste après) et retirer son téléphone de la validation en deux étapes.

**Diagnostic** (Supabase > **Authentication** > **Logs**, filtrer sur les erreurs d'envoi) :
- `535` (« Username and Password not accepted ») : mot de passe d'application révoqué ou faux, ou validation en deux étapes désactivée. Vérifier A1, puis rotation.
- `550 5.4.5` / « Daily sending limit exceeded », ou e-mails qui n'arrivent plus sans erreur Supabase : plafond Gmail atteint, **Gmail bloque l'envoi jusqu'à 24 h**. Rien à faire côté Supabase ; prévenir les responsables (connexion possible le lendemain), ne pas relever A4.
- `rate limit` côté Supabase : la limite de A4 est atteinte (plus de 30 demandes dans l'heure), attendre l'heure suivante.
- Alerte de sécurité dans la boîte du compte (« connexion bloquée ») : la lire depuis un poste admin, confirmer l'activité.

**Plan de sortie** : si les besoins dépassent 500 e-mails par jour (ou blocages Gmail répétés), acheter un nom de domaine (~10 $/an) et passer à Brevo (300/jour gratuit, domaine authentifié), avec un nouveau test A6.

## B. Choisir une cible unique et basculer

Recommandation : **Cloudflare Pages reliée à GitHub**. Chaque push sur `main` déploie, l'historique des déploiements permet un retour en arrière en 1 minute, la bande passante est illimitée, et chaque branche a son aperçu.

- [ ] B1. Le PM confirme la cible et l'URL de prod (noter ici la date, pas l'URL si elle doit rester discrète).
- [ ] B2. Cloudflare > **Workers & Pages** > **Create** > onglet **Pages** > **Connect to Git** > dépôt `xam-xam-bey`, branche de production `main`.
- [ ] B3. Réglages de build : Framework preset **None** ; Build command **`npm run check`** (types, tests puis build : un test cassé fait échouer le déploiement) ; Build output directory **`dist`**.
- [ ] B4. **Variables de build** (Settings > Variables and Secrets, environnement Production **et** Preview) : `VITE_SUPABASE_URL` = `https://<réf>.supabase.co`, `VITE_SUPABASE_ANON_KEY` = clé anon (Supabase > Project Settings > API Keys). Ajouter `NODE_VERSION` = `22`.
- [ ] B5. Lancer le déploiement. Vérifier sur l'URL obtenue : la bibliothèque s'affiche, **3 PDF** s'ouvrent, un lien magique arrive et connecte.
- [x] B6. Supabase > **Authentication** > **URL Configuration** : fait le 2026-10-13 (voir A5), Netlify retiré. Si besoin, ajouter `https://*.xam-xam-bey.pages.dev/**` (aperçus) et `http://localhost:5173` : la connexion n'y fonctionne pas sans eux.
- [ ] B7. Mettre à jour le secret GitHub `SITE_URL` (section F) et la sonde UptimeRobot (section G).
- [ ] B8. Retirer les autres cibles, une fois B5 et B6 verts depuis 48 h :
  - [ ] Netlify : Site configuration > **Delete this site** (ou au moins couper les builds) ; supprimer `netlify.toml` et `.netlify/` du dépôt.
  - [ ] Worker `xam-xam-bey` éventuel dans Cloudflare : le supprimer ; supprimer `wrangler.jsonc` et le script `deploy:cloudflare`.
  - [ ] README, section Hébergement : ne garder que Pages.
- [ ] B9. Prévenir les responsables de la nouvelle adresse si elle change (groupe WhatsApp).

`npm run deploy:pages` (envoi depuis un poste) reste un **secours** : uniquement depuis un `main` à jour et propre (`git status` vide), avec un `.env.local` rempli.

## C. Revenir en arrière (objectif : moins de 5 minutes)

**C1. Le site (Cloudflare Pages)**
- [ ] Cloudflare > **Workers & Pages** > `xam-xam-bey` > **Deployments**.
- [ ] Repérer le dernier déploiement **Production** sain (date antérieure au problème).
- [ ] Menu **⋯** > **Rollback to this deployment** > confirmer. Effet en moins d'une minute, sans rebuild.
- [ ] Vérifier l'URL de prod en navigation privée (bibliothèque, 1 PDF, connexion).
- Si la cible est encore un Worker : Worker > **Deployments** > version saine > **Rollback**. Si Netlify : **Deploys** > déploiement sain > **Publish deploy**.

**C2. Corriger dans git, sinon le prochain push réintroduit le bug**
- [ ] `git log --oneline -10` pour trouver le commit fautif, puis `git revert <sha>` et `git push origin main`.
- [ ] Attendre la CI verte et le nouveau déploiement Pages, puis vérifier à nouveau.

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
4. [ ] Le lien arrive mais renvoie vers une mauvaise adresse ou une erreur : vérifier **URL Configuration** (B6).
5. [ ] Le lien s'ouvre dans un autre navigateur que celui de la demande (Android) : conseiller de copier le lien dans Chrome. Contournement connu, correctif côté front prévu.
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
- [ ] H7. **Seulement maintenant**, déployer le front : `git push origin main` (ou attendre le build Pages du dernier commit). Commande de build Pages = `npm run check` (B3). Jamais le front avant la base.
  Le `dist/` local est un build factice (`https://ci.invalid`) : en secours `npm run deploy:pages`, ce script reconstruit avec `.env.local` ; vérifier que `.env.local` contient les vraies valeurs **avant** de le lancer.
  Si échec (build Pages rouge) : le site précédent reste en ligne ; lire le journal du build (Deployments > le déploiement > View details), corriger, repousser.
- [ ] H8. Vérification en prod, compte A, deux navigateurs : noter une carte différente dans chacun, recharger les deux : les deux cartes sont là. DevTools > Network : `rpc/save_progress` répond 200.
  Si échec : rollback du site seul (C1) ; la base peut rester (compatible avec l'ancien front). Prévenir Back et QA.
- [ ] H9. Admin : retirer un PDF de test : message de succès, puis son URL publique en navigation privée répond 400 ou 404.
  Si échec : remettre le PDF, signaler au Back (le reste du lot peut rester en ligne).
- [ ] H10. **Smoke Android** : téléphone d'entrée de gamme en 3G (ou Chrome DevTools en « Slow 3G ») : lien magique reçu et ouvert, session du jour, 3 PDF ouverts ; noter une carte, fermer l'onglet, rouvrir : la note est là.
  Si échec : rollback C1 si bloquant pour tous ; sinon ouvrir un bug et ne pas annoncer la révision.
- [ ] H11. Annoncer la révision aux responsables seulement après H10. Noter la date et la durée dans le journal.

Retrait de la migration (dernier recours, jamais en éditant l'ancien fichier) : nouvelle migration avec le SQL de `07-qa.md` §6 « Retrait de la migration », poussée par `supabase db push`.

## Journal d'exploitation

| Date | Exercice / incident | Durée | Remarque |
|---|---|---|---|
| 2026-10-13 | Mise en place SMTP Gmail, test 3 adresses extérieures | | 3 e-mails reçus (section A) |
| | | | |
