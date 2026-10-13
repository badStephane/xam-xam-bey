#!/bin/sh
# Mise en production du site : Cloudflare Pages, projet xam-xam-bey, envoi direct (Direct Upload).
# Lancé par `npm run deploy:pages` depuis la racine du dépôt. Refuse de partir si :
#   - la branche courante n'est pas main ;
#   - le dépôt a des modifications non commitées (fichiers suivis ou nouveaux fichiers non ignorés) ;
#   - main local diffère de origin/main (commit non poussé ou retard) ;
#   - .env.local est absent (le build lit VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY).
# Puis : npm run check (types, tests, build) et envoi de dist/. Voir docs/squad/06-ops.md §B.
set -eu

PROJECT="xam-xam-bey"
BRANCH="main"

stop() {
  echo "deploy:pages refusé : $1" >&2
  exit 1
}

cd "$(git rev-parse --show-toplevel)" || stop "lancer depuis le dépôt git"

current=$(git rev-parse --abbrev-ref HEAD)
[ "$current" = "$BRANCH" ] || stop "branche « $current », passer sur $BRANCH (git switch $BRANCH)"

[ -z "$(git status --porcelain)" ] || {
  git status --short >&2
  stop "modifications non commitées (ci-dessus) : commiter ou mettre de côté (git stash -u)"
}

git fetch --quiet origin "$BRANCH" || stop "impossible de joindre origin pour vérifier $BRANCH"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ] ||
  stop "$BRANCH local diffère de origin/$BRANCH (git pull, ou git push si la CI est verte)"

[ -f .env.local ] || stop ".env.local absent (cp .env.example .env.local puis le remplir)"

echo "Envoi de $(git rev-parse --short HEAD) vers Cloudflare Pages ($PROJECT, branche $BRANCH)"
npm run check
npx wrangler@4 pages deploy dist --project-name "$PROJECT" --branch "$BRANCH"
