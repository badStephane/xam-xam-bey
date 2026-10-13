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
- **Ajouter un admin** (éditeur SQL) : `insert into public.admins (email) values ('prenom@exemple.sn');`
- **Mise en place initiale** : appliquer la migration `*_library.sql`, puis envoyer les PDF d’origine : `SUPABASE_SERVICE_ROLE_KEY=… node scripts/upload_documents.mjs` (clé à ne jamais enregistrer dans un fichier).
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

`scripts/deploy-pages.sh` refuse de partir hors de `main`, avec des modifications non commitées, si `main` diffère de `origin/main` ou sans `.env.local` (les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont lues au build). La connexion Cloudflare est demandée au premier lancement. Retour arrière, migrations et mise en production : `docs/squad/06-ops.md`.

Le site publié est le dossier `dist/` (application seule, environ 5 Mo) ; les PDF sont servis par Supabase. Les en-têtes de sécurité (CSP limitée au projet Supabase et à Google Fonts) sont dans `public/_headers`, copié dans `dist/`.

## Planches

`planches.html` affiche les écrans avec les paramètres `?frame=1&demo=1&screen=…&theme=…&layout=…`. En mode démonstration, l’application lit `data/seed/` (disponible seulement en développement) puis, à défaut, le contenu Supabase si la personne est connectée ; la progression est fictive et rien n’est enregistré.

## Notes

- Les scripts Python utilisent des chemins absolus de la session de travail d’origine : à adapter pour les relancer.
- 7 PDF sont des scans sans texte (OCR à faire).
- Dépôt privé : les documents appartiennent à l’association.
- Migration depuis l’artifact claude.ai : la progression enregistrée là-bas n’est pas reprise automatiquement.
