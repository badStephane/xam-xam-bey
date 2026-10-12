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
npm run build        # vérifie les types puis écrit site/index.html, site/planches.html et site/assets/
```

## Structure

- `index.html`, `planches.html` : points d’entrée Vite.
- `src/lib/` : logique pure et testée (catalogue, répétition espacée, sessions, démonstration).
- `src/components/` : écrans React (bibliothèque, révision, session, bilan).
- `src/planches/` : guide de style et planche des écrans (chaque écran est l’application chargée en iframe en mode démonstration).
- `site/` : le site publié. `site/f/` contient les documents en PDF nommés par identifiant ; `site/assets/` est généré.
- `data/catalog.site.json` : catalogue compact importé par l’application. `data/catalog.json` : catalogue détaillé produit par `scripts/catalog.py`.
- `data/seed/` : `plan.json`, `fiche-1.json`, `cards-1.json` (collection `revision`), produits par `scripts/seed.py`.

## Supabase

- **Connexion** : lien magique par e-mail. Toute personne connectée accède à la révision ; la bibliothèque reste publique.
- **Tables** (`supabase/migrations/`) :
  - `revision_content` : documents `plan`, `fiche-N`, `cards-N` (JSON). Lecture pour les personnes connectées, écriture réservée au rôle service.
  - `progress` : une ligne par personne, `{ cards: { id: [niveau, échéance, vues, réussites, premier jour] }, sessions, xp }`, jours comptés depuis 1970. Chacun ne lit et n’écrit que sa ligne (RLS).
- **Publier du contenu** : déposer `fiche-N.json` / `cards-N.json` dans `data/seed/`, lancer `python3 scripts/content_sql.py`, puis `supabase db push`.
- **Réglages du tableau de bord** (Authentication → URL Configuration) : *Site URL* = l’adresse Netlify ; *Redirect URLs* = cette adresse et `http://localhost:5173`. Le service e-mail intégré de Supabase est limité à quelques envois par heure : configurer un SMTP (Authentication → Emails) avant d’ouvrir aux responsables.

```bash
supabase link --project-ref <ref>
supabase db push
```

## Netlify

`netlify.toml` construit le site (`npm run build`) et publie `site/` avec les PDF de `site/f/`. Renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les variables d’environnement du site Netlify. Les en-têtes de sécurité (CSP limitée à Supabase et Google Fonts) y sont définis.

## Planches

`planches.html` affiche les écrans avec les paramètres `?frame=1&demo=1&screen=…&theme=…&layout=…`. En mode démonstration, l’application lit `data/seed/` (disponible seulement en développement) puis, à défaut, le contenu Supabase si la personne est connectée ; la progression est fictive et rien n’est enregistré.

## Notes

- Les scripts Python utilisent des chemins absolus de la session de travail d’origine : à adapter pour les relancer.
- 7 PDF sont des scans sans texte (OCR à faire).
- Dépôt privé : les documents appartiennent à l’association.
- Migration depuis l’artifact claude.ai : la progression enregistrée là-bas n’est pas reprise automatiquement.
