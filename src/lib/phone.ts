/**
 * Numéros de téléphone pour la connexion par SMS : Sénégal seulement (indicatif 221), le seul pays couvert par le forfait
 * SMS d'Orange et la seule destination autorisée par la fonction d'envoi (supabase/functions/send-sms).
 */
export const SN_CODE = '221'

/** Mobiles sénégalais : 9 chiffres commençant par 7 (70, 71, 72, 75, 76, 77, 78…). */
const SN_MOBILE = /^7\d{8}$/

/**
 * Numéro saisi (« 77 123 45 67 », « +221 77… », « 00221 77… », « 221 77… ») au format international « +221771234567 »,
 * ou null si ce n'est pas un mobile sénégalais.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 12 && digits.startsWith(SN_CODE)) digits = digits.slice(SN_CODE.length)
  return SN_MOBILE.test(digits) ? `+${SN_CODE}${digits}` : null
}

/**
 * Affichage lisible : « +221 77 123 45 67 ». Accepte aussi le format de Supabase Auth (`user.phone`, sans « + »).
 * Un numéro d'un autre format est rendu tel quel, précédé de « + » s'il n'est fait que de chiffres.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const m = /^221(7\d)(\d{3})(\d{2})(\d{2})$/.exec(digits)
  if (m) return `+221 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`
  return /^\d+$/.test(phone) ? `+${phone}` : phone
}

/** Identifiant du compte à afficher : l'e-mail s'il existe, sinon le numéro mis en forme. */
export function accountLabel(user: { email?: string | null; phone?: string | null }): string | null {
  if (user.email) return user.email
  return user.phone ? formatPhone(user.phone) : null
}
