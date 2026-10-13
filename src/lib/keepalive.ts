/** Les navigateurs refusent une requête keepalive si les corps en vol dépassent 64 Kio : marge de sécurité. */
export const KEEPALIVE_MAX_BYTES = 60_000
const SAVE_PATH = '/rest/v1/rpc/save_progress'

type FetchFn = typeof fetch

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

/**
 * Enveloppe de fetch pour le client Supabase : l'enregistrement de la progression part avec `keepalive`,
 * pour survivre à la fermeture de l'onglet (pagehide). Les autres requêtes ne sont pas modifiées.
 */
export function withKeepalive(base: FetchFn): FetchFn {
  return (input, init) => {
    const body = init?.body
    const eligible = init?.method === 'POST' && typeof body === 'string' && urlOf(input).includes(SAVE_PATH)
      && new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES
    return eligible ? base(input, { ...init, keepalive: true }) : base(input, init)
  }
}
