# Registre des décisions d'architecture (ADR)

Un ADR court par décision difficile à défaire. Une décision remplacée garde son texte et pointe vers la suivante.

## ADR-1 : La base fait foi pour les cartes et documents

Date : 2026-10-13. Statut : acceptée (décision PM D1, lot 2). Source : audit point 10, `revue-backend.md` BE-3.

**Contexte.** Depuis la migration `library`, l'espace admin crée, corrige, dépublie et supprime les cartes et les documents directement en base. Or `scripts/content_sql.py` régénérait toutes les cartes de `data/seed/` avec `on conflict (id) do update` : au prochain `db push`, une correction de l'admin était écrasée et une carte supprimée revenait publiée.

**Décision.** La table `cards` et la table `documents` de la base de production sont la seule source de vérité. `data/seed/` ne sert plus qu'à amorcer des cartes nouvelles.
- `content_sql.py` ignore toute carte dont l'id figure déjà dans une migration (déjà publiée une fois), et insère les autres avec `on conflict (id) do nothing`.
- `library_sql.py` (exécuté une seule fois) utilisait déjà `do nothing` pour les documents et le transfert des cartes.
- Les fiches et le plan (`revision_content`) ne sont pas éditables dans l'admin : `data/seed/` reste leur source (`do update`).

**Alternatives écartées.** Exporter `cards` vers `data/seed/` avant chaque génération : étape manuelle facile à oublier, et elle demande un accès à la production depuis un poste. Garder `do update` : écrase le travail de l'admin.

**Conséquences.** Une correction se fait dans l'admin, jamais dans `cards-N.json` (une modification d'une carte existante dans `data/seed/` n'a plus aucun effet). `data/seed/` diverge de la base avec le temps : ce n'est pas une sauvegarde, la sauvegarde est celle de la base (`06-ops.md`). Un id de carte ne doit jamais être réutilisé pour une autre question.

**À revoir si :** on veut éditer le contenu en dehors de l'admin (relecture par lots dans un tableur), ou si un export régulier de la base vers le dépôt est mis en place.
