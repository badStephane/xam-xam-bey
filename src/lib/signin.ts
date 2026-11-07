/** Délai avant de pouvoir renvoyer un lien ou un SMS (aligné sur la limite d'un envoi par minute de Supabase Auth). */
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
  e.status === 429 || e.code === 'over_email_send_rate_limit' || e.code === 'over_sms_send_rate_limit' || e.code === 'over_request_rate_limit'
  || /rate limit/i.test(e.message || '')

const isNetwork = (e: AuthErrorLike): boolean =>
  e.name === 'AuthRetryableFetchError' || e.name === 'TimeoutError' || e.name === 'AbortError' || /fetch|network|timeout|abort/i.test(e.message || '')

export const TOO_MANY = 'Trop de demandes. Réessayez dans quelques minutes.'
const NETWORK = 'Le réseau ne répond pas. Vérifiez la connexion puis réessayez.'

/** Moyen de connexion : lien et code par e-mail, ou code par SMS. */
export type SignInVia = 'email' | 'phone'

/** Connexion par numéro pas encore ouverte côté Supabase (fournisseur SMS absent ou désactivé). */
export const PHONE_UNAVAILABLE = 'La connexion par numéro n’est pas encore disponible. Utilisez votre adresse e-mail.'

/** Message d'échec de l'envoi du lien ou du SMS (premier envoi ou renvoi). */
export function sendErrorMessage(error: unknown, via: SignInVia = 'email'): string {
  const e = asAuthError(error)
  if (isRateLimited(e)) return TOO_MANY
  if (isNetwork(e)) return NETWORK
  if (via === 'phone') {
    if (e.code === 'phone_provider_disabled' || e.code === 'sms_provider_disabled') return PHONE_UNAVAILABLE
    return 'Le SMS n’a pas pu être envoyé. Vérifiez le numéro puis réessayez.'
  }
  return 'Le lien n’a pas pu être envoyé. Réessayez.'
}

/** Message d'échec de la vérification du code. */
export function codeErrorMessage(error: unknown, via: SignInVia = 'email'): string {
  const e = asAuthError(error)
  if (isRateLimited(e)) return TOO_MANY
  if (isNetwork(e)) return NETWORK
  if (via === 'phone') return 'Code incorrect ou expiré. Vérifiez les 6 chiffres du SMS, ou demandez-en un nouveau.'
  return 'Code incorrect ou expiré. Vérifiez les 6 chiffres. Ce code a peut-être déjà servi par le lien : demandez-en un nouveau.'
}
