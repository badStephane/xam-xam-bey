import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useApp } from '../../AppContext'
import { readAuthLog } from '../../lib/authLog'
import { formatAuthLog } from '../../lib/authLogFormat'
import { PARAMS } from '../../lib/params'
import { share } from '../../lib/share'
import { CODE_LENGTH, normalizeCode, resendRemaining } from '../../lib/signin'
import { GateCard } from './Gate'

/**
 * Formulaires de connexion (adresse, puis code), chargés à la demande (lot 4) : inutiles hors réseau et pour une personne
 * déjà connectée, ils ne pèsent plus sur le premier affichage (budget du bundle initial).
 */
const TICK_MS = 1_000

/** Secondes avant « Renvoyer », rafraîchies chaque seconde tant qu'il en reste. */
function useResendCountdown(sentAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  const left = resendRemaining(sentAt, now)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setNow(Date.now()), TICK_MS)
    return () => clearTimeout(t)
  }, [left, now])
  return left
}

/** Écran « Lien envoyé » : code à 6 chiffres, renvoi après 60 s, changement d'adresse (D4, UX-1). */
function SentGate() {
  const { rev } = useApp()
  const { email, sentAt, resending, notice, code } = rev.signIn
  const [value, setValue] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  const left = useResendCountdown(sentAt)
  const verifying = code?.status === 'verifying'
  useEffect(() => { title.current?.focus() }, [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!PARAMS.frame) rev.verifyCode(value)
  }
  return (
    <GateCard tag="LIEN ENVOYÉ" stamp="BOÎTE MAIL" title="Ouvrez le lien reçu" titleRef={title}>
      <p>Un e-mail vient d’être envoyé à <b style={{ overflowWrap: 'anywhere' }}>{email}</b>. Saisissez ici le code à 6 chiffres qu’il affiche, ou touchez le lien. Si vous avez déjà touché le lien, il a utilisé le code : demandez-en un nouveau avec « Renvoyer ».</p>
      <form className="col g8" style={{ width: '100%' }} onSubmit={submit} noValidate>
        <label htmlFor="signin-code" className="f-lbl">CODE À 6 CHIFFRES</label>
        <input id="signin-code" className="field mono" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={CODE_LENGTH + 4}
          value={value} onChange={e => setValue(normalizeCode(e.target.value))} placeholder="123456" style={{ letterSpacing: '.3em', fontSize: '1.25rem' }}
          aria-invalid={code?.status === 'error'} aria-describedby={code?.status === 'error' ? 'signin-code-error' : undefined} />
        {code?.status === 'error' && <p id="signin-code-error" role="alert" style={{ margin: 0, fontSize: '0.875rem', color: 'var(--stamp)' }}>{code.message}</p>}
        <button type="submit" className="ink-btn big" style={{ minHeight: 50 }} disabled={verifying}>{verifying ? 'Vérification…' : 'Valider le code'}</button>
      </form>
      <p style={{ fontSize: '0.875rem' }}>Rien reçu ? Regardez dans les indésirables, puis renvoyez le lien.</p>
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} style={{ margin: 0, fontSize: '0.875rem', color: notice.kind === 'error' ? 'var(--stamp)' : 'var(--green)' }}>{notice.text}</p>}
      <div className="row" style={{ width: '100%' }}>
        <button type="button" className="ink-line" style={{ flex: 1 }} disabled={left > 0 || resending} onClick={() => { if (!PARAMS.frame) rev.resendLink() }}>
          {resending ? 'Envoi…' : left > 0 ? `Renvoyer dans ${left} s` : 'Renvoyer le lien'}
        </button>
        <button type="button" className="ink-line" style={{ flex: 1 }} onClick={rev.changeEmail}>Modifier l’adresse</button>
      </div>
    </GateCard>
  )
}

/**
 * Journal de connexion de l'appareil (diagnostic des déconnexions), à recopier pour l'aide. Masqué s'il est vide.
 * Sans e-mail ni identifiant : heure, type d'événement, onglet, réseau, mode d'ouverture, jeton présent.
 */
function AuthLogDetails() {
  const [copied, setCopied] = useState(false)
  const [text] = useState(() => {
    try { return formatAuthLog(readAuthLog(window.localStorage)) } catch { return '' }
  })
  if (!text) return null
  return (
    <details className="lg-rules" style={{ width: '100%' }}>
      <summary>JOURNAL DE CONNEXION</summary>
      <p style={{ fontSize: '0.875rem' }}>Déconnecté sans l’avoir choisi ? Copiez ce journal et envoyez-le à l’équipe. Il ne contient ni e-mail ni nom.</p>
      <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', margin: '8px 0' }}>{text}</pre>
      <button type="button" className="ink-line" onClick={() => share({ title: 'Journal de connexion Xam Xam Bëy', text }, text, () => setCopied(true))}>{copied ? 'Copié' : 'Copier le journal'}</button>
    </details>
  )
}

/** Connexion par lien magique ou code : un e-mail, aucun mot de passe. */
export function SignInForms() {
  const { rev } = useApp()
  const { step, message } = rev.signIn
  const [email, setEmail] = useState(rev.signIn.email ?? '')
  const input = useRef<HTMLInputElement>(null)
  // Retour depuis « Modifier l'adresse » : le focus revient sur l'adresse, déjà remplie.
  const back = step === 'idle' && !!rev.signIn.email
  useEffect(() => { if (back) input.current?.focus() }, [back])
  if (step === 'sent') return <SentGate />
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!PARAMS.frame) rev.requestLink(email)
  }
  return (
    <GateCard tag="CONNEXION NÉCESSAIRE" stamp="OUVERTE À TOUS" title="Connectez-vous pour réviser">
      <p>La révision enregistre vos progrès avec votre compte. Saisissez votre e-mail : vous recevrez un lien et un code de connexion, sans mot de passe. La bibliothèque reste ouverte à tous.</p>
      <form className="col g8" style={{ width: '100%' }} onSubmit={submit} noValidate>
        <label htmlFor="signin-email" className="f-lbl">ADRESSE E-MAIL</label>
        <input ref={input} id="signin-email" className="field" type="email" inputMode="email" autoComplete="email" required value={email}
          onChange={e => setEmail(e.target.value)} placeholder="prenom@exemple.sn" aria-invalid={step === 'error'} aria-describedby={step === 'error' ? 'signin-error' : undefined} />
        {step === 'error' && <p id="signin-error" role="alert" style={{ margin: 0, fontSize: '0.875rem', color: 'var(--stamp)' }}>{message}</p>}
        <button type="submit" className="ink-btn big" style={{ marginTop: 4, minHeight: 50 }} disabled={step === 'sending'}>{step === 'sending' ? 'Envoi…' : 'Recevoir le lien de connexion'}</button>
      </form>
      <AuthLogDetails />
    </GateCard>
  )
}
