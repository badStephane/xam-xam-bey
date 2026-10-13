# Audit consolidé : Xam Xam Bëy

Date : 2026-10-12 · Commit `68908c7` · Mode Revue, sans modification du code.
Sources : `revue-backend.md`, `revue-frontend.md`, `revue-design.md`, `revue-sre.md`, `revue-qa.md` (les ID renvoient à ces fichiers).
Limites : aucun test sur appareil réel ni appel à la vraie base Supabase. Les points marqués *à vérifier* dépendent du tableau de bord Supabase ou d'un essai sur Android.

## Verdict

**GO sous conditions.** La bibliothèque publique peut ouvrir tout de suite. La révision ouvre après le lot 1.
Aucune faille d'accès n'a été trouvée : la RLS relue est correcte, aucun secret n'est commité et aucune XSS n'est possible. Le bundle initial pèse 142 Ko gzip, dans le budget. Le typecheck, les 72 tests et le build passent.
En revanche, la promesse de la révision (garder sa progression) n'est pas tenue dans des usages normaux, et la connexion risque de ne pas fonctionner au lancement.

## Tableau unique, trié par sévérité

| # | Sév. | Problème | Constaté par | Correctif résumé |
|---|---|---|---|---|
| 1 | CRITIQUE | Liens magiques envoyés par le SMTP intégré de Supabase (≈ 2 e-mails/h, destinataires restreints) : personne ne pourra se connecter au lancement *(à vérifier)* | OPS-1, BE-4 | SMTP externe gratuit (Brevo), relever la limite Auth, tester avec 3 adresses extérieures |
| 2 | HAUTE | Progression écrasée entre deux appareils ou deux onglets (upsert de la ligne entière) | BE-2, FE-11, QA-2 (reproduit) | RPC `save_progress` qui fusionne (max des vues par carte, union des séances), plus bornes de taille (BE-6) |
| 3 | HAUTE | Progression perdue si l'enregistrement échoue en 3G puis que l'onglet se ferme | FE-2, QA-11 | Copie locale versionnée de la progression ; `keepalive` |
| 4 | HAUTE | Jour figé au montage (`AppContext.tsx:81`) : onglet ouvert après minuit, série cassée, nouvelles cartes bloquées | QA-1 (reproduit), FE-13 | Recalculer le jour au retour au premier plan ; horloge injectable et testée |
| 5 | HAUTE | Un PDF « retiré » par l'admin resterait public (pas de politique `select` sur `storage.objects`, `remove()` silencieux) *(à vérifier)* | BE-1 | Politique `select` admin ; vérifier le nombre de lignes renvoyé par `remove()` ; test en staging |
| 6 | HAUTE | Connexion fragile : ni « Renvoyer » ni « Modifier l'adresse », lien ouvert dans un autre navigateur sur Android | UX-1, FE-18 | Boutons renvoyer et modifier ; code à 6 chiffres en plus du lien |
| 7 | HAUTE | Le bouton retour Android quitte le site, y compris en pleine session | FE-1, UX-2 | `pushState` dans `go()`, plus `popstate` |
| 8 | HAUTE | Déploiement : 3 cibles (Netlify, Workers, Pages), envoi manuel `--commit-dirty`, pas de CI ; un build sans variables `VITE_*` passe au vert alors que les 170 PDF répondent 404 | OPS-2, OPS-3, OPS-4 | Une seule cible : Cloudflare Pages reliée à GitHub ; CI (typecheck, test, build) ; build en échec si une variable manque |
| 9 | HAUTE | Supabase gratuit : pause après 7 jours d'inactivité, aucune sauvegarde, aucune supervision | OPS-5, OPS-6, OPS-7, BE-A9 | Sonde quotidienne GitHub Actions (alerte et maintien en activité), UptimeRobot, dump mensuel testé |
| 10 | HAUTE | Deux sources de vérité pour les questions : `content_sql.py` écrase les corrections de l'admin et republie les cartes supprimées ; migrations appliquées de deux façons | BE-3, OPS-9 | ADR « la base fait foi » ; script en `do nothing` ; uniquement `supabase db push` |
| 11 | HAUTE | Admin : une course entre zones déplace des questions en silence ; brouillon perdu au changement de zone ; refus RLS affichés comme des succès | FE-4, UX-5, BE-5, QA-5 | Jeton de requête et zone portée par la carte ; confirmation avant d'abandonner ; `.select('id')` et contrôle des lignes touchées |
| 12 | HAUTE | Page blanche possible : cache local non validé et sans version, aucune error boundary | FE-3, FE-12, QA-9 | Clés `*.v1` validées, repli sur le catalogue intégré, `ErrorBoundary` racine |
| 13 | HAUTE | Chargement sans fin si le réseau ne passe pas (aucun délai d'expiration Supabase) | FE-5 | `AbortSignal.timeout(15000)` sur le fetch du client, puis état « indisponible » |
| 14 | HAUTE | Promesse « lisible hors réseau » non tenue : ni service worker ni cache des PDF | FE-6, UX-3 | Court terme : corriger le texte. Ensuite, décider d'un vrai mode hors ligne |
| 15 | HAUTE | Aucune déconnexion possible sur mobile (téléphone partagé dans une unité) | UX-4 | Bouton compte visible sous 760 px |
| 16 | HAUTE | Contrastes : anneau de focus à 1,7:1 et lien de secours de l'aperçu à 1,15:1 sur les fiches crème | UX-6, UX-7 | `--focus: var(--ink)` et liens en `--green` dans les fiches |
| 17 | HAUTE | Révision faussée : 5 « Su » le même jour donnent +60 j ; une carte réussie du premier coup est classée « lacune » | QA-3, QA-4 (reproduits) | Une montée de niveau par carte et par jour ; critère de lacune à redéfinir (décision produit) |
| 18 | HAUTE | RLS et `adminApi` non testés ; couverture réelle < 25 % de `src/` (77 % sur `src/lib` seulement) | QA-6, chiffres QA | Script de test RLS (12 assertions) sur base locale, branché en CI |
| 19 | MOYENNE | Configuration Auth non versionnée (confirmation d'e-mail, fournisseur mot de passe, redirections) ; Redirect URLs encore sur Netlify | BE-7, OPS-11 | `supabase/config.toml` ; confirmation activée, mot de passe désactivé, URL strictes |
| 20 | MOYENNE | Egress Supabase ≈ 4,6/5 Go avec 300 personnes actives | OPS-8 | Suivi hebdomadaire ; repli : PDF compressés servis par Cloudflare |
| 21 | MOYENNE | Clé service role saisie en clair (historique du shell), aucune rotation | OPS-10 | `read -rs`, clé `sb_secret` révocable |
| 22 | MOYENNE | Lecteur PDF : téléchargements non annulés, canvas jamais libérés (plantage possible avec 2 Go de RAM) | FE-7, FE-8 | `task.destroy()`, libérer les canvas hors écran |
| 23 | MOYENNE | Saisie de recherche lente (contexte recréé à chaque rendu), Google Fonts bloquantes en 3G | FE-9, FE-10 | Mémoïsation et `useDeferredValue` ; polices hébergées sur le site (2 familles) |
| 24 | MOYENNE | Bordure des champs à 1,7:1 ; écran « réservé aux admins » affiché pendant la vérification | UX-8, UX-9, FE-14 | Token `--field-bd` à 3:1 ou plus ; état « vérification… » |
| 25 | MOYENNE | `progress` sans borne de taille alors que l'inscription est ouverte (remplissage des 500 Mo) | BE-6 | `check (pg_column_size(cards) <= 262144)` |

Point 1 : résolu le 2026-10-13 par SMTP Gmail (voir 06-ops §A).

Mineurs : voir les annexes de chaque revue (BE-A1 à A10, FE-16 à 25, UX annexe, OPS-12 à 22, QA-7 à 15). À noter : `?demo=1` et `?frame=1` coupent l'enregistrement en production (FE-17) ; cotes renumérotées après un retrait (QA-10) ; QCM de repli à une seule proposition (QA-8).

## Plan de correction proposé

**Lot 1, avant d'ouvrir la révision (environ 3 jours)** : 1, 2, 3, 4, 5, 8, 18. Ensuite, un essai manuel sur un Android 3G (lien magique, session du jour, 3 PDF).
**Lot 2, dans les deux semaines** : 6, 7, 9, 10, 11, 12, 13, 14 (texte), 15, 16, 17, 19.
**Lot 3, ensuite** : 20 à 25, mineurs, hors ligne réel si décidé, E2E Playwright sur les 3 parcours.
