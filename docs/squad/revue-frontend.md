# Revue front-end : Xam Xam Bëy

Rôle : Développeur Front-End. Mode Revue, lecture seule. Date : 2026-10-12.
Commandes lancées : `npm run typecheck` (vert), `npm test` (72 tests verts, 10 fichiers), `npm run build` (vert).

## Hypothèses

- Cible : Android d'entrée de gamme, Chrome mobile, 3G/4G instable (contexte `00-contexte.md`).
- Le comportement de Chrome Android envers un PDF ouvert dans un nouvel onglet (lecteur intégré ou téléchargement) n'a pas été testé sur appareil réel ; les constats qui en dépendent sont formulés au conditionnel.
- Aucun test sur appareil ni en throttling réseau n'a été possible (pas de navigateur dans cet environnement) : les constats viennent de la lecture du code et du build.

## Constats (triés par sévérité)

| ID | Sév. | Fichier:ligne | Constat | Scénario d'échec concret | Correctif proposé |
|---|---|---|---|---|---|
| FE-1 | HAUTE | `src/AppContext.tsx:105-109`, `src/App.tsx:44-59` | Navigation 100 % en état React : aucun `history.pushState`, aucun écouteur `popstate`. | Sur Android, en pleine session de 20 cartes, la personne appuie sur le bouton retour du téléphone : elle quitte le site (ou revient au client mail du lien magique). La session en cours est perdue, et l'écran Aperçu ne se ferme pas avec le geste retour. | Dans `go()`, faire un `history.pushState({ screen })` (l'URL peut garder `?screen=`). Ajouter un écouteur `popstate` qui appelle `setUi` avec l'écran de l'état. En session, le retour appelle `quitSession` (bilan) au lieu de quitter la page. |
| FE-2 | HAUTE | `src/hooks/useRevision.ts:82-104`, `:177-183` | La progression n'existe qu'en mémoire jusqu'à l'upsert Supabase. L'envoi sur `pagehide` est un `fetch` normal (sans `keepalive`), qui est souvent annulé à la fermeture de l'onglet. Rien n'est écrit en local. | La personne révise en 3G, l'upsert échoue (bandeau « nouvel essai dans quelques secondes »), puis elle ferme l'onglet ou Chrome le tue en arrière-plan. XP, niveaux et série du jour sont perdus sans retour possible. | Écrire chaque `commit` dans `localStorage` (clé `xxb.progress.v1.<userId>`, avec `updated_at`) et le relire dans `loadFor` en prenant la version la plus récente. L'upsert devient une simple synchronisation. Option : `fetch` avec `keepalive` via l'option `global.fetch` du client. |
| FE-3 | HAUTE | `src/hooks/useCatalog.ts:17-18`, `src/lib/catalog.ts:15-22`, `src/lib/format.ts:13`, `src/main.tsx:9` | Le catalogue mis en cache (`xxb.catalog`) est relu sans validation ni version de schéma, avant tout appel réseau, et l'app n'a aucune error boundary. | Après une migration qui renomme ou rend nullable une colonne (`title`, `file_name`), `cleanTitle(undefined)` lève une exception au premier rendu. Tous les utilisateurs qui reviennent voient une page blanche, y compris hors ligne, jusqu'à ce qu'ils vident le stockage du navigateur. Même risque si `xxb.seen` est corrompu (`ui.seen.includes` n'est pas une fonction). | Versionner les clés (`catalog.v1`), valider chaque ligne (garde de type ou Zod) et retomber sur `BUNDLED_ROWS` si une ligne est invalide. Valider que `seen` est un tableau de nombres. Ajouter une `ErrorBoundary` racine qui propose « Recharger » et purge les clés `xxb.*`. |
| FE-4 | HAUTE | `src/components/admin/CardsAdmin.tsx:113-117`, `:35`, `:135` | `refresh()` n'annule pas la requête précédente. L'éditeur enregistre avec la `zone` sélectionnée, pas avec `r.zone` de la ligne. | En 3G, l'admin touche Zone 01 puis Zone 02. La réponse de la zone 01 arrive après celle de la zone 02 : les questions de la zone 01 s'affichent sous l'en-tête « ZONE 02 ». L'admin ouvre une de ces questions et l'enregistre : `saveCard` écrit `zone: 2`, et la question est **déplacée silencieusement** dans une autre zone. | Ajouter un jeton de requête (ou un drapeau `alive` dans l'effet) et ignorer les réponses périmées. Ajouter `zone` à `EditorState` (depuis `r.zone`) et l'utiliser dans `save`. |
| FE-5 | HAUTE | `src/lib/supabase.ts:12`, `src/hooks/useRevision.ts:118-128`, `:188` | Aucun délai d'expiration sur les appels Supabase. `retry()` ne fait rien tant que le statut est `loading`. | Réseau qui paraît connecté mais ne passe pas (`navigator.onLine` vaut vrai) : « CHARGEMENT DE L'ESPACE DE RÉVISION… » reste affiché sans fin. Le bouton Réessayer n'apparaît jamais, et l'appui sur l'onglet Révision ne relance rien. | Passer `global: { fetch: (u, o) => fetch(u, { ...o, signal: o?.signal ?? AbortSignal.timeout(15000) }) }` à `createClient`. Ajouter un repli si `AbortSignal.timeout` est absent sur les vieux Chrome. Après expiration, passer à `unavailable`. |
| FE-6 | MOYENNE | `src/components/library/Library.tsx:96`, `src/components/library/DocCard.tsx:9`, `public/` (aucun service worker) | Le bandeau hors ligne promet que « les pièces déjà consultées restent lisibles », mais rien ne les met en cache (pas de service worker, pas de Cache API). `seen` indique seulement qu'on a cliqué. L'app elle-même ne se recharge pas hors ligne. | La personne a ouvert un PDF la veille et le rouvre hors réseau depuis l'onglet encore ouvert : erreur réseau (sauf si le cache HTTP l'a gardé, ce qui n'est pas garanti). Si l'onglet a été fermé, le site ne s'ouvre pas du tout. | À court terme, corriger le texte (« ont pu être enregistrées par votre navigateur ») et ne plus griser les pièces selon `seen`. Ensuite, un petit service worker (coquille + `pdfjs` + PDF ouverts, cache borné) pour tenir la promesse. |
| FE-7 | MOYENNE | `src/lib/pdf.ts:41-48`, `src/components/library/PreviewPanel.tsx:18` | La vignette (`maxPages={1}`) charge le PDF avec les options par défaut de pdf.js (auto-fetch et streaming actifs). La tâche n'est exposée qu'une fois résolue, donc on ne peut pas l'annuler pendant le téléchargement. | Sur ordinateur ou en paysage (largeur ≥ 760 px, donc certains téléphones), cliquer cinq pièces de suite déclenche cinq téléchargements complets en parallèle (jusqu'à 50 Mo chacun). Démonter la vignette ne les arrête pas. | Retourner `task` tout de suite (`{ task, promise }`) et appeler `task.destroy()` au démontage. Pour la vignette, passer `disableAutoFetch: true, disableStream: true` (Supabase Storage gère les requêtes Range). |
| FE-8 | MOYENNE | `src/components/library/PdfViewer.tsx:28-36` | Chaque page dessinée garde son canvas (jusqu'à environ 2,9 Mo pour 720×1018 px à l'échelle 2). Rien n'est libéré en s'éloignant de la page, et `page.cleanup()` n'est jamais appelé. | Dans l'Aperçu plein écran (atteint via `?screen=apercu&sel=` ou en largeur intermédiaire), faire défiler un PDF de 120 pages consomme plus de 300 Mo de canvas. Sur un téléphone de 2 Go, l'onglet plante. | Libérer le canvas quand la page sort de la marge de l'IntersectionObserver (`canvas.width = 0`, puis le retirer), appeler `page.cleanup()` après le rendu, et abaisser `MAX_RENDER_SCALE` à 1,5 si `navigator.deviceMemory <= 2`. |
| FE-9 | MOYENNE | `src/AppContext.tsx:135-184`, `src/hooks/useCatalog.ts:17`, `src/components/library/Library.tsx:84`, `src/App.tsx:41` | La valeur du contexte est recréée à chaque rendu et `go` dépend de `rev` (objet neuf à chaque rendu). Tout l'arbre se réaffiche à chaque `patch`. `useCatalog` refait `JSON.parse` du catalogue (29 Ko) à chaque rendu. `useKeyboard` se réabonne à chaque rendu. | Chaque frappe dans la recherche réaffiche jusqu'à 170 `DocCard`, recalcule les filtres et analyse le cache. Sur un Android d'entrée de gamme, l'INP risque de dépasser 200 ms et la saisie saccade. | Lire le cache dans l'initialiseur de `useState` uniquement. Mémoïser `rev` (`useMemo`) et `value`. Utiliser `useDeferredValue(ui.q)` pour le filtrage et `memo(DocCard)`. |
| FE-10 | MOYENNE | `index.html:7-9` | Quatre familles Google Fonts (environ 13 graisses) chargées par une feuille de style bloquante sur deux origines tierces. | En 3G, le premier affichage attend le DNS, le TLS et le CSS de `fonts.googleapis.com` avant de dessiner : environ 1 à 2 s de LCP en plus, puis plusieurs centaines de Ko de polices. | Héberger 2 familles au plus sur le site (WOFF2 sous-ensemble latin, `font-display: swap`), précharger la police du titre et retirer les deux origines de la CSP. |
| FE-11 | MOYENNE | `src/hooks/useRevision.ts:91-93` | L'upsert remplace toute la progression par la copie en mémoire (le dernier qui écrit gagne). | Révision sur le téléphone le matin, puis sur un onglet d'ordinateur ouvert depuis la veille le soir : la sauvegarde de l'ordinateur écrase les cartes et l'XP du matin. | Relire puis fusionner avant d'écrire (par carte, garder l'entrée au compteur `p[2]` le plus élevé, et fusionner les sessions), ou faire la fusion dans une RPC côté base (à voir avec le Back). |
| FE-12 | BASSE | `src/components/revision/Session.tsx:84`, `:94-97` | `useRef` et `useEffect` sont appelés après un `return null` conditionnel : la règle des hooks n'est pas respectée. | Aujourd'hui protégé par `Screen` (`App.tsx:47`). Si un jour `Session` est rendu avec `session` nul puis non nul, React lève l'erreur « Rendered more hooks » et la page devient blanche. | Placer les hooks avant le retour anticipé. |
| FE-13 | BASSE | `src/AppContext.tsx:81` | `now` est figé au montage. | Un onglet laissé ouvert d'un jour à l'autre (fréquent sur Android) affiche les cartes dues de la veille et date les sessions du mauvais jour, ce qui fausse la série. | Recalculer `now` au retour de `visibilitychange` si le jour a changé. |
| FE-14 | BASSE | `src/AppContext.tsx:93-98`, `src/lib/adminApi.ts:26` | Un échec de `is_admin` (réseau) vaut « pas admin », sans nouvel essai. | Un admin en 3G voit « Cet espace est réservé aux administrateurs » et l'onglet ADMIN disparaît. | Utiliser un état à trois valeurs (inconnu, oui, non), avec un message et un bouton Réessayer en cas d'erreur. |
| FE-15 | BASSE | `src/App.tsx:47-48` | `Session` et `Fin` sont rendus hors de `RevisionArea` : le bandeau `saveErr` n'y apparaît pas. | Les échecs d'enregistrement pendant toute une session sont invisibles ; on ne les découvre qu'en revenant sur Aujourd'hui. | Afficher un petit indicateur « non enregistré » dans `sess-top` quand `rev.saveErr` est vrai. |

## Annexe : constats mineurs (une ligne chacun)

- FE-16 `src/components/library/Apercu.tsx:10` : si la pièce est introuvable (supprimée, `sel` invalide), l'écran est blanc et n'a pas de bouton retour.
- FE-17 `src/hooks/useRevision.ts:85` et `src/lib/params.ts:8-19` : `?demo=1` ou `?frame=1` restent actifs en production et coupent silencieusement l'enregistrement si quelqu'un partage un tel lien.
- FE-18 `src/hooks/useRevision.ts:153-159` et `:164-172` : au retour du lien magique, `init()` et `SIGNED_IN` lancent tous deux `loadFor` (requêtes en double en 3G). Il n'y a pas de jeton de séquence : un `loadFor` lent qui se termine après `signOut` réinstalle l'ancien utilisateur.
- FE-19 `src/hooks/useCatalog.ts:24` : une table `documents` vide est traitée comme une erreur, donc l'ancien catalogue reste affiché.
- FE-20 `src/hooks/useCatalog.ts:26` : le statut `bundled` (base injoignable, pas de cache) n'affiche aucun bandeau, contrairement à `cached`.
- FE-21 `src/lib/catalog.ts:29-30` : les identifiants du catalogue intégré (`i + 1`) ne correspondent pas forcément aux `id` de la base, donc `seen` peut pointer vers une autre pièce.
- FE-22 `src/lib/pdf.ts:42` et `src/lib/adminApi.ts:32` : `source.slice(0)` double la mémoire d'un PDF de 50 Mo au comptage des pages. Il n'y a ni progression ni délai d'expiration sur l'envoi.
- FE-23 `src/components/admin/CardsAdmin.tsx:96` et `DocsAdmin.tsx:123` : les boutons Confirmer ne sont pas désactivés pendant l'action (double clic possible, sans gravité ici).
- FE-24 `src/components/admin/CardsAdmin.tsx:53` : `setSt({ ...st, src })` utilise un état capturé périmé (préférer la forme fonctionnelle).
- FE-25 `src/AppContext.tsx:107` : `window.scrollTo(0, 0)` à chaque `go`, y compris pour les sous-onglets (perte de position sur Plan).

## Vérifications sans constat

- **XSS** : `Md.tsx` rend du texte via React (échappé). Aucun `dangerouslySetInnerHTML` ni `innerHTML` dans `src/`. Les `href` des PDF sont construits à partir de `storage_path` encodé. Rien d'exploitable trouvé.
- **CSP** (`public/_headers`) : compatible avec ce que charge le build. `dist/index.html` ne contient aucun script inline. Le worker pdf.js est servi depuis `'self'` (`script-src` sert de repli à `worker-src`). Les polices standard et CMaps viennent de `/pdfjs/` (`connect-src 'self'`). Les PDF et l'API sont sur `*.supabase.co`, autorisé dans `connect-src`. Google Fonts est couvert. Point d'attention : la CSP s'applique aussi au worker, qui hérite donc de `connect-src`, ce qui est correct.
- **Chargement de pdf.js** : bien à la demande (`import()` dans `src/lib/pdf.ts:21-23`). Il n'est pas dans le bundle initial.
- **localStorage** : tous les accès passent par `try/catch` (`src/lib/storage.ts`), mais aucun schéma n'est versionné (voir FE-3).

## Verdict par écran sur les 5 états

| Écran | Chargement | Vide | Erreur | Partiel | Idéal |
|---|---|---|---|---|---|
| Bibliothèque | ⚠️ catalogue intégré ou en cache affiché tout de suite (bon choix), sans indication de rafraîchissement | ✅ « Aucune pièce trouvée » avec suggestions | ⚠️ bandeau pour `cached`, aucun pour `bundled` (FE-20) | ❌ promesse hors ligne non tenue (FE-6) | ✅ |
| Aperçu / lecteur PDF | ⚠️ texte seul, sans progression pour plusieurs Mo | ❌ écran blanc si pièce introuvable (FE-16) | ✅ message et lien de repli | ✅ page illisible signalée page par page | ⚠️ mémoire (FE-8) |
| Révision (porte d'accès) | ❌ peut tourner sans fin (FE-5) | ✅ `EmptyGate` | ✅ `UnavailableGate` et Réessayer | n/a | ✅ |
| Aujourd'hui | ✅ (via porte) | ✅ « Rien à réviser » | ✅ bandeau `saveErr` | ✅ | ✅ |
| Session QCM / J'interroge | n/a (données en mémoire) | ✅ démarrage bloqué si 0 carte | ❌ échec d'enregistrement invisible (FE-15) et perte possible (FE-2) | n/a | ⚠️ pas de retour Android (FE-1) |
| Bilan (Fin) | n/a | ✅ « Aucune réponse enregistrée » | ❌ même lacune que Session | n/a | ✅ |
| Plan annuel | ✅ (via porte) | ✅ « Cartes publiées en… » | ✅ (via porte) | ✅ zones sans cartes gérées | ✅ |
| Fiches | ✅ (via porte) | ✅ « À paraître » avec lien vers les pièces | ✅ (via porte) | ✅ | ✅ |
| Progression | ✅ (via porte) | ✅ messages par bloc | ✅ (via porte) | ✅ | ✅ |
| Admin Documents | ⚠️ aucun état pendant `reloadCatalog` | ✅ « Aucun document dans cette zone » | ✅ messages `adminError` | n/a | ✅ |
| Admin Questions | ✅ « CHARGEMENT… » | ✅ « Aucune question pour ce filtre » | ✅ message ; ❌ course entre zones (FE-4) | n/a | ✅ |
| Contrôle admin | ❌ « réservé aux admins » pendant la vérification ou en cas d'échec (FE-14) | n/a | ❌ | n/a | ✅ |

## Tailles du bundle (mesurées sur `dist/` le 2026-10-12)

| Fichier | Brut | gzip -9 | brotli | Chargement |
|---|---|---|---|---|
| `index-*.js` (app + supabase-js + catalogue intégré) | 348 Ko | 96 Ko | 82 Ko | initial |
| `client-*.js` (React DOM, partagé avec les planches) | 142 Ko | 46 Ko | 40 Ko | initial (modulepreload) |
| `index-*.css` | 24,6 Ko | 5,9 Ko | n/a | initial |
| **Total JS initial** | 490 Ko | **142 Ko** | **122 Ko** | sous le budget de 170 Ko |
| `pdf.min-*.js` (pdf.js legacy) | 406 Ko | 122 Ko | 103 Ko | à la demande |
| `pdf.worker.min-*.mjs` | 1 418 Ko | 415 Ko | 339 Ko | à la demande |
| `dist/pdfjs/` (polices standard, CMaps) | 2,4 Mo | n/a | n/a | à la demande, par fichier |

Le premier aperçu PDF coûte donc environ 440 à 540 Ko compressés avant même le PDF, soit environ 10 s en 3G. C'est acceptable parce que c'est à la demande et réservé à l'ordinateur, mais à garder en tête si l'aperçu intégré revient sur mobile. À cela s'ajoutent les Google Fonts (FE-10), hors bundle et bloquantes.

## Recommandations prioritaires

1. **Ne plus perdre la progression** (FE-2, FE-5, FE-11) : copie locale versionnée de la progression, délai d'expiration de 15 s sur le client Supabase, fusion à l'écriture. C'est le cœur de la valeur « révision » en 3G.
2. **Bouton retour Android** (FE-1) : `pushState` dans `go` et `popstate`, environ 30 lignes. C'est le geste le plus fréquent sur le terminal cible.
3. **Filet anti page blanche** (FE-3, FE-12) : error boundary racine, clés `localStorage` versionnées et validées.
4. **Corriger la course admin** (FE-4) avant que les admins saisissent les questions des prochaines zones : risque de déplacer des questions en silence.
5. **Hors ligne honnête puis réel** (FE-6, FE-10) : corriger tout de suite le texte du bandeau, puis service worker minimal et polices hébergées sur le site.
