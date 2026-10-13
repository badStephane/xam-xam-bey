/** Délai avant de pouvoir renvoyer un lien (aligné sur la limite d'un envoi par minute de Supabase Auth). */
export const RESEND_DELAY_MS = 60_000
export const CODE_LENGTH = 6

/** Secondes restantes avant « Renvoyer » (0 : bouton actif). */
export function resendRemaining(sentAt: number | undefined, now: number, delay: number = RESEND_DELAY_MS): number {
  if (sentAt === undefined) return 0
  return Math.max(0, Math.ceil((sentAt + delay - now) / 1000))
}

/** Garde les chiffres seulement (code collé avec espaces ou tirets), au plus 6. */
export const normalizeCode = (input: string): string => input.replace(/\D/g, '').slice(0, CODE_LENGTH)

export const isValidCode = (code: string): boolean => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)

interface AuthErrorLike { status?: number; code?: string; message?: string; name?: string }

const asAuthError = (e: unknown): AuthErrorLike => (e && typeof e === 'object' ? e as AuthErrorLike : {})

const isRateLimited = (e: AuthErrorLike): boolean =>
  e.status === 429 || e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit' || /rate limit/i.test(e.message || '')

const isNetwork = (e: AuthErrorLike): boolean =>
  e.name === 'AuthRetryableFetchError' || e.name === 'TimeoutError' || e.name === 'AbortError' || /fetch|network|timeout|abort/i.test(e.message || '')

export const TOO_MANY = 'Trop de demandes. Réessayez dans quelques minutes.'
const NETWORK = 'Le réseau ne répond pas. Vérifiez la connexion puis réessayez.'

/** Message d'échec de l'envoi du lien (premier envoi ou renvoi). */
export function sendErrorMessage(error: unknown): string {
  const e = asAuthError(error)
  if (isRateLimited(e)) return TOO_MANY
  if (isNetwork(e)) return NETWORK
  return 'Le lien n’a pas pu être envoyé. Réessayez.'
}

/** Message d'échec de la vérification du code. */
export function codeErrorMessage(error: unknown): string {
  const e = asAuthError(error)
  if (isRateLimited(e)) return TOO_MANY
  if (isNetwork(e)) return NETWORK
  return 'Code incorrect ou expiré. Vérifiez les 6 chiffres. Ce code a peut-être déjà servi par le lien : demandez-en un nouveau.'
}
