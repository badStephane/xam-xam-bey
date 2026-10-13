import { LOCAL_API, MAILPIT } from '../playwright.config'

/** Échec clair si la pile locale n'est pas démarrée (plutôt que 60 s d'attente par test). */
export default async function globalSetup(): Promise<void> {
  const checks: Array<[string, string]> = [[`${LOCAL_API}/auth/v1/health`, 'Supabase local (55321)'], [`${MAILPIT}/api/v1/info`, 'Mailpit (55324)']]
  for (const [url, name] of checks) {
    const ok = await fetch(url).then(r => r.ok || r.status === 401, () => false)
    if (!ok) throw new Error(`[e2e] ${name} injoignable : lancer \`supabase start\` dans le dépôt avant \`npm run e2e\`.`)
  }
}
