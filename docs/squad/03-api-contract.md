# Contrat lot 1 : enregistrement de la progression et retrait des documents

Décidé par l'orchestrateur (PM) le 2026-10-12. Le back et le front codent en parallèle contre ce contrat ; tout écart passe par l'orchestrateur.

## 1. RPC `public.save_progress`

```sql
public.save_progress(p_cards jsonb, p_sessions jsonb, p_xp integer)
  returns table (cards jsonb, sessions jsonb, xp integer, updated_at timestamptz)
  -- security invoker, search_path = '', execute accordé à authenticated seulement
```

- Agit uniquement sur la ligne `user_id = auth.uid()` (la crée si absente). Aucun paramètre `user_id`.
- **Fusion** avec la ligne existante, jamais un remplacement :
  - `cards` : union des clés. Pour une clé présente des deux côtés, garder l'entrée au plus grand nombre de vues (`[2]`) ; à égalité, la plus grande échéance (`[1]`).
  - `sessions` : union sans doublon (égalité de l'objet JSON entier), triée par `d` croissant, on garde les 200 dernières.
  - `xp` : `greatest(existant, p_xp)`.
- **Idempotente** : rejouer le même appel donne le même état (indispensable : nouvel essai après expiration en 3G).
- **Validation** (erreur `22023` sinon) : `p_cards` est un objet, chaque valeur un tableau de 5 entiers ≥ 0 ; `p_sessions` est un tableau d'au plus 200 objets ; `0 ≤ p_xp ≤ 10 000 000` ; `pg_column_size(p_cards) ≤ 262 144`.
- Retourne l'état fusionné ; le client l'adopte puis le refusionne avec ce qui a été noté pendant l'appel.
- La table `progress` garde ses politiques ; ajouter les bornes `check` (taille de `cards`, plafond de `xp`) et un déclencheur `updated_at = now()`.

## 2. Fusion côté client : `src/lib/progressMerge.ts`

`mergeProgress(a: Progress, b: Progress): Progress` applique **exactement** les mêmes règles (commutative, idempotente). Elle sert :
- au chargement : fusion de la copie locale et de la ligne serveur ;
- après `save_progress` : fusion de la réponse et de l'état en mémoire.

Copie locale : clé `localStorage` `xxb.progress.v1.<user_id>`, valeur `{ cards, sessions, xp }`, écrite à chaque note, lue et validée (entrées invalides ignorées) au chargement.

## 3. Retrait d'un document

- Politique `select` sur `storage.objects` pour `bucket_id = 'documents'` réservée à `is_admin()`, pour que `remove()` agisse.
- `deleteDocument` et le nettoyage après un échec d'insertion lèvent une erreur visible si `remove()` ne renvoie pas exactement un objet supprimé.

## 4. Variables de build

`vite build` en mode `production` échoue si `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` manquent. La CI fournit des valeurs factices (`https://ci.invalid`, `ci-anon-key`).
