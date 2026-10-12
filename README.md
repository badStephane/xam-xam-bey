# Xam Xam Bëy

Plateforme de ressources et de révision scoute (District Grand Dakar).

- **Bibliothèque** : 171 ressources classées en 12 thèmes mensuels (octobre 2026 à septembre 2027), avec recherche et filtres.
- **Révision** (responsables) : plan annuel, fiches, cartes à répétition espacée, mini-examens, progression.

## Structure

- `site/index.html` : la page complète (HTML, CSS et JS dans un seul fichier).
- `site/f/` : les documents, tous en PDF, nommés par identifiant (`<id>.pdf`).
- `scripts/template.html` : la page avec l'emplacement du catalogue (`/*CATALOG_JSON*/[]`).
- `scripts/catalog.py` : classe les fichiers par thème et produit `data/catalog.json`.
- `scripts/seed.py` : produit les cartes, la fiche et le plan d'octobre.
- `data/seed/` : `plan.json`, `fiche-1.json`, `cards-1.json` (collection `revision`).

## Révision

Les documents `plan`, `fiche-N` et `cards-N` sont dans la collection `revision` de la base de l'artifact. La progression de chacun est dans `data/users/<id>/progress` (privé).

## Notes

- Les scripts utilisent des chemins absolus de la session de travail d'origine : à adapter pour les relancer.
- 7 PDF sont des scans sans texte (OCR à faire).
- Dépôt privé : les documents appartiennent à l'association.
