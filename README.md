# Xam Xam Bëy

Plateforme de ressources et de révision scoute (District Grand Dakar).

- **Bibliothèque** : 170 ressources classées en 12 zones mensuelles (octobre 2026 à septembre 2027), avec itinéraire, recherche, filtres et aperçu.
- **Révision** (responsables) : session du jour, entraînement par zone en « Je réponds » ou « J’interroge », plan annuel, fiches, progression (XP, niveaux, séries).

## Développement

Application React + TypeScript construite avec Vite.

```bash
npm install
cp .env.example .env.local   # puis renseigner l’URL et la clé anon du projet Supabase
npm run dev          # serveur local (sert aussi les PDF de site/f)
npm test             # tests unitaires (catalogue, répétition espacée, sessions, planches)
npm run test:coverage
npm run build        # vérifie les types puis écrit dist/ (application seule, sans les PDF)
```

**Tests de bout en bout** (Playwright, hors `npm run check` ; lancés par la CI dans le job `db`, rapport en artefact 7 jours en cas d'échec) : connexion par code lu dans Mailpit, passage à minuit (`page.clock`), bouton retour. Ils lancent `vite` sur `localhost:5173` branché sur la pile Supabase **locale** (55321, Mailpit 55324) ; toute requête vers `*.supabase.co` fait échouer le test.

```bash
npx playwright install chromium   # une fois par poste (Linux : --with-deps chromium)
supabase start                    # pile locale du projet (modèles d'e-mail avec code : supabase/templates/)
npm run e2e
```

## Structure

- `index.html`, `planches.html` : points d’entrée Vite.
- `src/lib/` : logique pure et testée (catalogue, répétition espacée, sessions, démonstration).
- `src/components/` : écrans React (bibliothèque, révision, session, bilan).
- `src/planches/` : guide de style et planche des écrans (chaque écran est l’application chargée en iframe en mode démonstration).
- `dist/` : le site publié (généré). `site/f/` : archive des PDF d’origine, envoyés une fois dans Supabase Storage.
- `data/catalog.site.json` : catalogue d’origine, repli intégré si la base ne répond pas. `data/catalog.json` : catalogue détaillé produit par `scripts/catalog.py`.
- `data/seed/` : `plan.json`, `fiche-1.json`, `cards-1.json` (collection `revision`), produits par `scripts/seed.py`.

## Supabase

- **Connexion** : lien magique par e-mail. Toute personne connectée accède à la révision ; la bibliothèque reste publique.
- **Tables** (`supabase/migrations/`) :
  - `documents` : catalogue de la bibliothèque (lecture publique) ; fichiers dans le bucket public `documents` (PDF, 50 Mo au plus).
  - `cards` : questions de révision, une par ligne, liées à une zone et à leur document source, en brouillon ou publiées.
  - `revision_content` : plan annuel et fiches (`plan`, `fiche-N`).
  - `progress` : une ligne par personne, `{ cards: { id: [niveau, échéance, vues, réussites, premier jour] }, sessions, xp }`.
  - `admins` : e-mails des administrateurs ; `is_admin()` sert aux règles d’accès. Seuls les admins écrivent dans `documents`, `cards` et le bucket.
- **Espace Admin** (onglet visible des seuls admins) : envoyer un PDF dans une zone, le modifier ou le retirer ; écrire les questions d’un document (QCM contrôlé à la saisie), en brouillon puis publiées.
- **Importer des questions depuis Excel** (Admin > Questions) : « Télécharger le modèle » (feuille « Questions » vide sous les en-têtes, exemple dans la feuille « Exemple », jamais importée), remplir une ligne par question (Zone de 1 à 12, Question et Réponse obligatoires ; Bonne proposition et au moins une Mauvaise pour un QCM ; Source et Note facultatives).
  Enregistrer en .xlsx (2 Mo et 1 000 lignes au plus, première feuille seulement), puis « Importer un fichier Excel » : l’aperçu liste les lignes valides par zone et chaque ligne en erreur avec sa raison ; rien n’est écrit avant « Importer N questions ».
  Les questions arrivent en brouillon à la fin de leur zone, les doublons (fichier ou base) sont ignorés ; relire puis publier depuis la liste. Modèle régénérable : `python3 scripts/make_import_xlsx.py`.
- **Ajouter un admin** (éditeur SQL) : `insert into public.admins (email) values ('prenom@exemple.sn');`
- **Mise en place initiale** : appliquer la migration `*_library.sql`, puis envoyer les PDF d’origine avec une clé secrète `sb_secret_…` créée pour l’occasion (Project Settings > API Keys), saisie sans écho ni historique, puis révoquée (`docs/squad/06-ops.md`, section J) :

  ```bash
  read -rs SUPABASE_SECRET_KEY; export SUPABASE_SECRET_KEY   # coller la clé, Entrée (rien ne s’affiche)
  node scripts/upload_documents.mjs                          # refuse de démarrer si la variable manque
  unset SUPABASE_SECRET_KEY                                  # puis supprimer la clé dans Supabase
  ```

  Ne jamais écrire la clé dans la commande (elle resterait dans `~/.zsh_history`), dans un fichier ni dans un message.
- **Publier du contenu en masse** : déposer `fiche-N.json` / `cards-N.json` dans `data/seed/`, lancer `python3 scripts/content_sql.py`, puis `supabase db push`.
- **QCM** : chaque carte peut porter `"qcm": { "ok": "bonne réponse courte", "no": ["3 mauvaises réponses plausibles"] }`. Sans ce champ, l’application prend comme propositions les réponses d’autres cartes de la même zone.
- **Réglages du tableau de bord** : URL de connexion, SMTP Gmail et modèle d’e-mail (code à 6 chiffres) sont décrits pas à pas dans `docs/squad/06-ops.md` (sections A et B).

```bash
supabase link --project-ref <ref>
supabase db push
```

## Hébergement

Production : **Cloudflare Pages**, projet `xam-xam-bey`, en envoi direct (Direct Upload), adresse **https://xam-xam-bey.pages.dev**. Aucune autre cible (ni Netlify, ni Worker).

```bash
git switch main && git pull   # main propre et à jour, CI verte
npm run deploy:pages          # contrôles git, puis npm run check (types, tests, build) et envoi de dist/
```

`scripts/deploy-pages.sh` refuse de partir hors de `main`, avec des modifications non commitées, si `main` diffère de `origin/main` ou sans `.env.local` (les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont lues au build). La connexion Cloudflare est demandée au premier lancement. La version de wrangler est figée dans ce script (`WRANGLER_VERSION`). Retour arrière, migrations et mise en production : `docs/squad/06-ops.md`.

Le site publié est le dossier `dist/` (application seule, environ 5 Mo) ; les PDF sont servis par Supabase Storage et comptent dans le quota d’egress gratuit (5 Go par mois) : relevé hebdomadaire et plan de repli vers Cloudflare dans `docs/squad/06-ops.md`, section K. Depuis le lot 3, un service worker garde sur l’appareil le site et chaque PDF ouvert (lecture hors ligne). Les en-têtes de sécurité (CSP limitée au site et au projet Supabase ; polices hébergées sur le site depuis le lot 3) sont dans `public/_headers`, copié dans `dist/`.

## Planches

`planches.html` affiche les écrans avec les paramètres `?frame=1&demo=1&screen=…&theme=…&layout=…`. En mode démonstration, l’application lit `data/seed/` (disponible seulement en développement) puis, à défaut, le contenu Supabase si la personne est connectée ; la progression est fictive et rien n’est enregistré.

## Notes

- Les scripts Python utilisent des chemins absolus de la session de travail d’origine : à adapter pour les relancer.
- 7 PDF sont des scans sans texte (OCR à faire).
- Dépôt privé : les documents appartiennent à l’association.
- Migration depuis l’artifact claude.ai : la progression enregistrée là-bas n’est pas reprise automatiquement.
