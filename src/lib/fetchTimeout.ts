/** Délai maximal d'une requête Supabase (base, authentification) avant de passer à l'état « indisponible ». */
export const SUPABASE_TIMEOUT_MS = 15_000

type FetchFn = typeof fetch

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

/** Les envois et lectures de fichiers (jusqu'à 50 Mo en 3G pour l'admin) ne sont pas limités. */
export const isTimed = (url: string): boolean => !url.includes('/storage/v1/')

/** Signal qui expire après `ms`. Repli pour les vieux Chrome sans AbortSignal.timeout (avant 103). */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(new DOMException('Délai dépassé', 'TimeoutError')), ms)
  return ctrl.signal
}

/** Combine le signal de l'appelant et le délai ; sans AbortSignal.any, le signal de l'appelant prime. */
function combine(own: AbortSignal | null | undefined, timeout: AbortSignal): AbortSignal {
  if (!own) return timeout
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([own, timeout]) : own
}

/** Enveloppe de fetch pour le client Supabase : toute requête hors stockage échoue après `ms` au lieu de pendre sans fin. */
export function withTimeout(base: FetchFn, ms: number = SUPABASE_TIMEOUT_MS): FetchFn {
  return (input, init) => {
    if (!isTimed(urlOf(input))) return base(input, init)
    return base(input, { ...init, signal: combine(init?.signal, timeoutSignal(ms)) })
  }
}
