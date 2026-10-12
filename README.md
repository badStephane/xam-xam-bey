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
- **Réglages du tableau de bord** (Authentication → URL Configuration) : *Site URL* = l’adresse Netlify ; *Redirect URLs* = cette adresse et `http://localhost:5173`. Le service e-mail intégré de Supabase est limité à quelques envois par heure : configurer un SMTP (Authentication → Emails) avant d’ouvrir aux responsables.

```bash
supabase link --project-ref <ref>
supabase db push
```

## Hébergement

Le site publié est le dossier `dist/` (application seule, environ 5 Mo) ; les PDF sont servis par Supabase. Les en-têtes de sécurité (CSP limitée au projet Supabase et à Google Fonts) sont dans `public/_headers`, lu par Cloudflare Pages comme par Netlify. Les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` doivent être définies au moment du build.

**Cloudflare Pages** (offre gratuite sans crédits, 500 builds par mois), au choix :
- *Relié à GitHub* : Workers & Pages → Create → Pages → Connect to Git → dépôt `xam-xam-bey`, branche `main`. Build command `npm run build`, output directory `dist`, variables d’environnement `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. Chaque push sur `main` redéploie le site.
- *Envoi direct* : `npm run deploy:cloudflare` (connexion Cloudflare demandée au premier lancement), ou glisser le dossier `dist/` dans Workers & Pages → Create → Pages → Upload assets.

**Netlify** : `netlify.toml` construit et publie `dist/`.

Après un changement d’adresse, l’ajouter dans Supabase : Authentication → URL Configuration (Site URL et Redirect URLs, par exemple `https://xam-xam-bey.pages.dev/**`).

## Planches

`planches.html` affiche les écrans avec les paramètres `?frame=1&demo=1&screen=…&theme=…&layout=…`. En mode démonstration, l’application lit `data/seed/` (disponible seulement en développement) puis, à défaut, le contenu Supabase si la personne est connectée ; la progression est fictive et rien n’est enregistré.

## Notes

- Les scripts Python utilisent des chemins absolus de la session de travail d’origine : à adapter pour les relancer.
- 7 PDF sont des scans sans texte (OCR à faire).
- Dépôt privé : les documents appartiennent à l’association.
- Migration depuis l’artifact claude.ai : la progression enregistrée là-bas n’est pas reprise automatiquement.
