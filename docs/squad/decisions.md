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

## ADR-2 : L'XP de ligue vient de notes vérifiées par le serveur

Date : 2026-10-14. Statut : acceptée (P1, A6, A11, lot 5). Détail : `17-archi-lot5.md`.

**Contexte.** `save_progress` accepte un `p_xp` libre jusqu'à 10 000 000 : un classement dessus se triche en une requête. Le client déclare aussi la note des cartes.

**Décision.** Le classement ne lit que `grade_events` : une ligne par (scout, jour, carte), insérée par `save_progress` via `p_grades`. Le serveur fixe l'XP : QCM 10 si le texte choisi est égal à `qcm.ok` de la carte publiée, sinon 0 ; carte sans QCM 5 fixes. 30 cartes par jour au plus, QCM ratés compris. `p_xp` reste l'XP personnelle (niveaux).

**Alternatives écartées.** Différence de `progress.cards` d'un envoi à l'autre (déclaré par le client, jour inconnu) ; RPC séparé `record_grades` (une requête de plus en 3G, pas d'atomicité) ; payer le « Su » auto-déclaré (pousse à cliquer « Su »).

**Conséquences.** Borne honnête : 300 XP par jour. Le texte de la bonne réponse est lisible par tout scout connecté (table `cards`) : un script peut toujours atteindre le plafond, comme un scout très assidu. Les cartes sans QCM rapportent moitié moins.

**À revoir si :** des plaintes de triche apparaissent (exiger que la carte soit due, ou tirer les propositions côté serveur), ou si beaucoup de cartes restent sans QCM.

## ADR-3 : Clôture par date limite fixe, pg_cron plus repli paresseux

Date : 2026-10-14. Statut : acceptée (P5, A7, lot 5).

**Contexte.** Pas de serveur à nous, plan gratuit. La clôture doit être rejouable sans double promotion.

**Décision.** Semaine du lundi 00:00 au dimanche 20:00 UTC ; notes acceptées jusqu'au lundi 06:00 UTC, puis refusées : les données sont gelées, la clôture donne toujours le même résultat. `league_close_week` pose un verrou, sort si `closed_at` est posé, et **affecte** la ligue (`tier = tier de la semaine + issue`), jamais d'incrément. Déclenchée par `pg_cron` (toutes les heures à la minute 5, migration séparée) et par `get_league_state`.

**Alternatives écartées.** Cron seul (peut manquer une heure) ; paresseux seul (première lecture du lundi plus lente, reste le repli).

**Conséquences.** Entre dimanche 20:00 et la clôture, le scout est « en attente » (`pending`). Une note hors ligne arrivée après lundi 06:00 ne compte que pour l'XP perso.

**À revoir si :** des plaintes « ma note de dimanche n'a pas compté » apparaissent (allonger la grâce).

## ADR-4 : Entrée paresseuse dans les groupes

Date : 2026-10-14. Statut : acceptée (lot 5).

**Décision.** Un scout avec pseudo entre dans un groupe de sa ligue à sa première note de la semaine (le groupe ouvert le plus rempli, sinon un nouveau ; 20 au plus, verrou par semaine et ligue). Pas de groupe formé à l'avance, donc pas de membre inactif affiché. Les petits groupes ne sont pas fusionnés.

**Conséquences.** Le dernier groupe d'une ligue peut être petit (un scout seul ne monte ni ne descend).

**À revoir si :** plus de 2 000 scouts par ligue, ou trop de groupes de moins de 5.

## ADR-5 : Les admins peuvent consulter la progression d'un scout, scouts prévenus et consultations notées

Date : 2026-10-22. Statut : acceptée (choix de l'utilisateur).

**Contexte.** La progression n'était lisible que par la personne (RLS de `progress`). Les statistiques globales (onglet STATS) ne suffisent pas : l'utilisateur veut suivre l'évolution d'un scout en particulier. Beaucoup de scouts sont mineurs.

**Décision.** Onglet SUIVI : recherche par une partie de l'e-mail ou du pseudo (3 caractères au moins, 20 résultats), fiche nominative (identité, 7 semaines de réponses, zones, 10 dernières séances). Accès par RPC security definer réservées aux admins ; la table `progress` reste fermée. Chaque recherche (elle affiche jusqu'à 20 e-mails) et chaque ouverture de fiche sont notées dans `admin_views` (e-mail de l'admin, e-mail du compte ou texte cherché, date ; recopiés pour survivre à la suppression d'un compte, purgés après un an), visibles des admins. Les scouts sont prévenus sur l'écran de connexion, dans le panneau du compte et sur l'écran Progression.

**Conséquences.** Les e-mails des comptes trouvés sont visibles des admins ; l'onglet PSEUDOS reste sans e-mail. La liste complète des comptes n'est pas proposée.

**À revoir si :** des responsables non admins doivent suivre leur seule unité (il faudrait des groupes et des droits par unité), ou si une demande de suppression du journal arrive.
