/**
 * API SMS Africa & Middle East 2.0 d'Orange (developer.orange.com), Sénégal seulement.
 * Logique pure (sans Deno ni réseau) : testée par Vitest (orange.test.ts), utilisée par index.ts.
 *
 * Rappels de la documentation Orange :
 * - jeton OAuth 2.0 « client credentials », valable une heure : https://api.orange.com/oauth/v3/token ;
 * - envoi : POST https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2210000/requests ;
 * - expéditeur du Sénégal : tel:+2210000 ; nom d'expéditeur (senderName) approuvé par Orange, 11 caractères au plus ;
 * - au plus 5 SMS par seconde.
 */
export const ORANGE_TOKEN_URL = 'https://api.orange.com/oauth/v3/token'
export const SN_SENDER = 'tel:+2210000'
export const ORANGE_SEND_URL = `https://api.orange.com/smsmessaging/v1/outbound/${encodeURIComponent(SN_SENDER)}/requests`

/** Marge avant l'expiration du jeton : renouvelé une minute avant. */
export const TOKEN_MARGIN_MS = 60_000

/**
 * Destinataire accepté : mobile sénégalais seulement (+221 7X XXX XX XX). Toute autre destination est refusée : le forfait
 * ne couvre que le Sénégal, et un robot ne peut pas faire envoyer de SMS vers des numéros surtaxés à l'étranger.
 * Supabase Auth transmet le numéro sans « + » (« 221771234567 ») ; renvoie le format international, ou null.
 */
export function senegalRecipient(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  return /^2217\d{8}$/.test(digits) ? `+${digits}` : null
}

/**
 * Texte du SMS : sans « ë » ni caractère hors de l'alphabet GSM, pour tenir en un seul SMS de 160 caractères
 * (un seul caractère hors alphabet fait passer la limite à 70 et peut doubler le prix).
 */
export function smsText(otp: string): string {
  return `Xam Xam Bey : votre code de connexion est ${otp}. Ne le donnez a personne.`
}

/** Nom d'expéditeur valide pour Orange : 11 caractères alphanumériques ou espaces au plus ; sinon null (nom par défaut). */
export function validSenderName(name: string | undefined): string | null {
  const n = (name ?? '').trim()
  return /^[A-Za-z0-9 ]{1,11}$/.test(n) ? n : null
}

/** Corps de la requête d'envoi. */
export function sendBody(recipient: string, message: string, senderName: string | null): unknown {
  return {
    outboundSMSMessageRequest: {
      address: `tel:${recipient}`,
      senderAddress: SN_SENDER,
      ...(senderName ? { senderName } : {}),
      outboundSMSTextMessage: { message },
    },
  }
}

/** En-tête Basic de la demande de jeton (identifiant et secret de l'app, section « MyApps » du portail Orange). */
export function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`
}

export interface CachedToken { value: string; expiresAt: number }

/** Lit la réponse du jeton Orange (`access_token`, `expires_in` en secondes) ; null si elle est inexploitable. */
export function parseToken(body: unknown, now: number): CachedToken | null {
  if (!body || typeof body !== 'object') return null
  const { access_token: value, expires_in: ttl } = body as { access_token?: unknown; expires_in?: unknown }
  if (typeof value !== 'string' || !value) return null
  const seconds = typeof ttl === 'number' && ttl > 0 ? ttl : Number(ttl) > 0 ? Number(ttl) : 3600
  return { value, expiresAt: now + seconds * 1000 - TOKEN_MARGIN_MS }
}

/** Jeton encore utilisable ? */
export const tokenValid = (t: CachedToken | null, now: number): t is CachedToken => !!t && t.expiresAt > now
