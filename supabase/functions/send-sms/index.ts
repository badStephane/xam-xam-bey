// Send SMS hook de Supabase Auth : envoie le code de connexion par l'API SMS d'Orange (Sénégal).
// Supabase Auth appelle cette fonction à chaque demande de code par SMS (signInWithOtp({ phone })), avec le numéro et le
// code ; la requête est signée (Standard Webhooks) avec le secret du hook. Mise en service : docs/sms-orange.md.
//
// Secrets de la fonction (supabase secrets set …), jamais dans le dépôt :
//   SEND_SMS_HOOK_SECRET  secret du hook, au format « v1,whsec_… » (tableau de bord : Authentication > Hooks)
//   ORANGE_CLIENT_ID      identifiant de l'app Orange Developer (section « MyApps »)
//   ORANGE_CLIENT_SECRET  secret de l'app Orange Developer
//   ORANGE_SENDER_NAME    facultatif : nom d'expéditeur approuvé par Orange (ex. « XamXamBey »)
import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { basicAuth, ORANGE_SEND_URL, ORANGE_TOKEN_URL, parseToken, sendBody, senegalRecipient, smsText, tokenValid, validSenderName, type CachedToken } from './orange.ts'

/** Délai maximal d'un appel à Orange : Supabase Auth abandonne le hook au bout de quelques secondes. */
const ORANGE_TIMEOUT_MS = 4_000

interface HookPayload { user?: { phone?: string }; sms?: { otp?: string } }

/** Jeton Orange gardé entre deux appels tant que l'instance de la fonction reste chaude. */
let token: CachedToken | null = null

/** Réponse d'erreur au format attendu par Supabase Auth (affichée côté app comme un échec d'envoi). */
function fail(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { 'Content-Type': 'application/json' } })
}

function env(name: string): string {
  const v = Deno.env.get(name)?.trim()
  if (!v) throw new Error(`Secret manquant : ${name}`)
  return v
}

async function orangeToken(): Promise<string> {
  if (tokenValid(token, Date.now())) return token.value
  const r = await fetch(ORANGE_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(env('ORANGE_CLIENT_ID'), env('ORANGE_CLIENT_SECRET')), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(ORANGE_TIMEOUT_MS),
  })
  const parsed = parseToken(await r.json().catch(() => null), Date.now())
  if (!r.ok || !parsed) throw new Error(`Jeton Orange refusé (HTTP ${r.status})`)
  token = parsed
  return parsed.value
}

async function sendOnce(recipient: string, otp: string): Promise<Response> {
  return fetch(ORANGE_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await orangeToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(sendBody(recipient, smsText(otp), validSenderName(Deno.env.get('ORANGE_SENDER_NAME')))),
    signal: AbortSignal.timeout(ORANGE_TIMEOUT_MS),
  })
}

Deno.serve(async req => {
  if (req.method !== 'POST') return fail(405, 'Méthode non autorisée')
  const raw = await req.text()
  let payload: HookPayload
  try {
    const secret = env('SEND_SMS_HOOK_SECRET').replace(/^v1,whsec_/, '')
    payload = new Webhook(secret).verify(raw, Object.fromEntries(req.headers)) as HookPayload
  } catch (err) {
    console.error('[send-sms] Signature du hook refusée', err instanceof Error ? err.message : err)
    return fail(401, 'Signature invalide')
  }

  const otp = payload.sms?.otp
  const recipient = senegalRecipient(payload.user?.phone ?? '')
  if (!otp || !/^\d{4,10}$/.test(otp)) return fail(400, 'Code absent')
  // Hors Sénégal : refusé (forfait limité au Sénégal, protection contre l'envoi vers des numéros surtaxés).
  if (!recipient) return fail(400, 'Seuls les numéros mobiles du Sénégal (+221) sont acceptés')

  try {
    let r = await sendOnce(recipient, otp)
    // Jeton révoqué avant son expiration annoncée : un seul nouvel essai avec un jeton neuf.
    if (r.status === 401) { token = null; r = await sendOnce(recipient, otp) }
    if (!r.ok) {
      // Corps d'erreur d'Orange (solde épuisé, contrat expiré, nom d'expéditeur non approuvé…), sans le numéro ni le code.
      console.error('[send-sms] Orange refuse l’envoi', r.status, await r.text().catch(() => ''))
      return fail(502, 'Le SMS n’a pas pu être envoyé')
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[send-sms] Envoi impossible', err instanceof Error ? err.message : err)
    return fail(502, 'Le SMS n’a pas pu être envoyé')
  }
})
