import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useApp } from '../../AppContext'
import { readAuthLog } from '../../lib/authLog'
import { formatAuthLog } from '../../lib/authLogFormat'
import { PARAMS } from '../../lib/params'
import { share } from '../../lib/share'
import { formatPhone } from '../../lib/phone'
import { CODE_LENGTH, normalizeCode, resendRemaining, type SignInVia } from '../../lib/signin'
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

/** Écran du code (e-mail ou SMS) : 6 chiffres, envoyés tout seuls au 6ᵉ chiffre ; renvoi après 60 s, changement d'adresse ou de numéro (D4, UX-1). */
function SentGate() {
  const { rev } = useApp()
  const { email, phone, via, sentAt, resending, notice, code } = rev.signIn
  const sms = via === 'phone'
  const [value, setValue] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  const left = useResendCountdown(sentAt)
  const verifying = code?.status === 'verifying'
  useEffect(() => { title.current?.focus() }, [])
  const verify = (v: string) => { if (!PARAMS.frame) rev.verifyCode(v) }
  const change = (raw: string) => {
    const v = normalizeCode(raw)
    // Le code part dès qu'il est complet (saisi, ou collé par-dessus un code faux) : pas de bouton à chercher.
    if (v.length === CODE_LENGTH && v !== value) verify(v)
    setValue(v)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    verify(value)
  }
  return (
    <GateCard tag="CODE ENVOYÉ" stamp={sms ? 'PAR SMS' : 'BOÎTE MAIL'} title="Entre ton code" titleRef={title}>
      {sms
        ? <p>On vient d’envoyer un SMS au <b style={{ whiteSpace: 'nowrap' }}>{phone ? formatPhone(phone) : ''}</b>. Il contient un code à 6 chiffres : tape-le ici.</p>
        : <p>On vient d’envoyer un e-mail à <b style={{ overflowWrap: 'anywhere' }}>{email}</b>. Il contient un code à 6 chiffres : tape-le ici. Tu peux aussi toucher le bouton dans l’e-mail.</p>}
      <form className="col g8" style={{ width: '100%' }} onSubmit={submit} noValidate>
        <label htmlFor="signin-code" className="f-lbl">CODE À 6 CHIFFRES</label>
        <input id="signin-code" className="field mono" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={CODE_LENGTH + 4}
          value={value} onChange={e => change(e.target.value)} placeholder="123456" style={{ letterSpacing: '.3em', fontSize: '1.25rem' }}
          aria-invalid={code?.status === 'error'} aria-describedby={code?.status === 'error' ? 'signin-code-error' : undefined} />
        {code?.status === 'error' && <p id="signin-code-error" role="alert" style={{ margin: 0, fontSize: '0.875rem', color: 'var(--stamp)' }}>{code.message}</p>}
        <button type="submit" className="ink-btn big" style={{ minHeight: 50 }} disabled={verifying}>{verifying ? 'Vérification…' : 'Valider le code'}</button>
      </form>
      <p style={{ fontSize: '0.875rem' }}>{sms ? 'Rien reçu au bout d’une minute ? Vérifie le numéro, puis renvoie le code.' : 'Rien reçu ? Regarde dans les spams (courrier indésirable), puis renvoie l’e-mail.'}</p>
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} style={{ margin: 0, fontSize: '0.875rem', color: notice.kind === 'error' ? 'var(--stamp)' : 'var(--green)' }}>{notice.text}</p>}
      <div className="row" style={{ width: '100%' }}>
        <button type="button" className="ink-line" style={{ flex: 1 }} disabled={left > 0 || resending} onClick={() => { if (!PARAMS.frame) rev.resendLink() }}>
          {resending ? 'Envoi…' : left > 0 ? `Renvoyer dans ${left} s` : sms ? 'Renvoyer le code' : 'Renvoyer l’e-mail'}
        </button>
        <button type="button" className="ink-line" style={{ flex: 1 }} onClick={() => rev.changeEmail()}>{sms ? 'Changer de numéro' : 'Changer d’adresse'}</button>
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
      <p style={{ fontSize: '0.875rem' }}>Déconnecté sans l’avoir choisi ? Copie ce journal et envoie-le à l’équipe. Il ne contient ni e-mail ni nom.</p>
      <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', margin: '8px 0' }}>{text}</pre>
      <button type="button" className="ink-line" onClick={() => share({ title: 'Journal de connexion Xam Xam Bëy', text }, text, () => setCopied(true))}>{copied ? 'Copié' : 'Copier le journal'}</button>
    </details>
  )
}

const VIAS: ReadonlyArray<[SignInVia, string]> = [['email', 'E-MAIL'], ['phone', 'NUMÉRO']]

/**
 * Porte d'entrée du site pour qui n'est pas connecté (parcours jeunes) : ce que l'on gagne à réviser, l'e-mail ou le numéro
 * pour recevoir un code, et la bibliothèque à un geste pour qui cherche seulement un document. Aucun mot de passe.
 */
export function SignInForms() {
  const { rev, go } = useApp()
  const { step, message } = rev.signIn
  const via: SignInVia = rev.signIn.via ?? 'email'
  const [email, setEmail] = useState(rev.signIn.email ?? '')
  const [phone, setPhone] = useState(rev.signIn.phone ? formatPhone(rev.signIn.phone).replace(/^\+221 /, '') : '')
  const input = useRef<HTMLInputElement>(null)
  // Retour depuis « Changer d'adresse » ou « Changer de numéro » : le focus revient sur le champ, déjà rempli.
  const back = step === 'idle' && !!(via === 'phone' ? rev.signIn.phone : rev.signIn.email)
  useEffect(() => { if (back) input.current?.focus() }, [back])
  if (step === 'sent') return <SentGate />
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (PARAMS.frame) return
    if (via === 'phone') rev.requestSms(phone)
    else rev.requestLink(email)
  }
  const pick = (v: SignInVia) => { if (v !== via && step !== 'sending') rev.changeEmail(v) }
  const error = step === 'error'
  const described = (help: string) => (error ? `signin-error ${help}` : help)
  return (
    <GateCard tag="BIENVENUE" stamp="GRATUIT" title="Révise le scoutisme en jouant">
      <ul className="welcome-list">
        <li><span aria-hidden="true">🎯</span>Des questions sur le scoutisme, 10 minutes par jour.</li>
        <li><span aria-hidden="true">🔥</span>Gagne des points et garde ta série de jours.</li>
        <li><span aria-hidden="true">🏆</span>Monte dans les ligues contre d’autres scouts.</li>
      </ul>
      <div className="col g6" style={{ width: '100%' }}>
        <span id="signin-via" className="f-lbl">RECEVOIR MON CODE PAR</span>
        <div className="seg3" role="radiogroup" aria-labelledby="signin-via" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {VIAS.map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={via === k} onClick={() => pick(k)}>{label}</button>)}
        </div>
      </div>
      <form className="col g8" style={{ width: '100%' }} onSubmit={submit} noValidate>
        {via === 'phone' ? (
          <>
            <label htmlFor="signin-phone" className="f-lbl">TON NUMÉRO (SÉNÉGAL)</label>
            <div className="row" style={{ width: '100%', alignItems: 'stretch', gap: 6, flexWrap: 'nowrap' }}>
              <span className="field mono" aria-hidden="true" style={{ flex: 'none', width: 'auto', display: 'flex', alignItems: 'center' }}>+221</span>
              <input ref={input} id="signin-phone" className="field mono" type="tel" inputMode="tel" autoComplete="tel-national" required value={phone}
                onChange={e => setPhone(e.target.value)} placeholder="77 123 45 67" style={{ flex: 1, minWidth: 0 }}
                aria-invalid={error} aria-describedby={described('signin-help')} />
            </div>
            <span id="signin-help" className="muted" style={{ fontSize: '0.8125rem' }}>Orange, Free ou Expresso : tu vas recevoir un SMS avec un code. Pas de téléphone à toi ? Utilise le numéro d’un parent, avec son accord.</span>
          </>
        ) : (
          <>
            <label htmlFor="signin-email" className="f-lbl">TON ADRESSE E-MAIL</label>
            <input ref={input} id="signin-email" className="field" type="email" inputMode="email" autoComplete="email" required value={email}
              onChange={e => setEmail(e.target.value)} placeholder="prenom@exemple.sn" aria-invalid={error} aria-describedby={described('signin-help')} />
            <span id="signin-help" className="muted" style={{ fontSize: '0.8125rem' }}>Tu vas recevoir un code. Pas de mot de passe à retenir. Pas d’e-mail ? Choisis « Numéro » juste au-dessus.</span>
          </>
        )}
        {error && <p id="signin-error" role="alert" style={{ margin: 0, fontSize: '0.875rem', color: 'var(--stamp)' }}>{message}</p>}
        <button type="submit" className="ink-btn big" style={{ marginTop: 4, minHeight: 50 }} disabled={step === 'sending'}>
          {step === 'sending' ? 'Envoi…' : via === 'phone' ? 'Recevoir mon code par SMS' : 'Recevoir mon code'}
        </button>
      </form>
      <button type="button" className="ink-line big" style={{ width: '100%', minHeight: 50 }} onClick={() => go('bibliotheque')}>Je cherche juste un document</button>
      <details className="lg-rules" style={{ width: '100%' }}>
        <summary>QUI VOIT MES PROGRÈS ?</summary>
        <p style={{ fontSize: '0.875rem' }}>Les autres scouts ne voient que ton pseudo, jamais ton e-mail ni ton numéro. Les responsables de la plateforme (administrateurs) peuvent consulter ta progression ; chaque consultation est notée.</p>
      </details>
      <AuthLogDetails />
    </GateCard>
  )
}
