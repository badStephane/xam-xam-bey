import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { useApp } from '../../AppContext'
import { PARAMS } from '../../lib/params'
import { CODE_LENGTH, normalizeCode, resendRemaining } from '../../lib/signin'

/** Après ce délai de chargement, on propose de réessayer sans attendre l'expiration (15 s). */
const SLOW_LOADING_MS = 6_000
const TICK_MS = 1_000
const BIG_BTN = { marginTop: 4, minHeight: 50, padding: '0 20px' }

interface GateCardProps { tag: string; stamp: string; title: string; titleRef?: RefObject<HTMLHeadingElement>; children: ReactNode }

function GateCard({ tag, stamp, title, titleRef, children }: GateCardProps) {
  return (
    <div className="gate">
      <div className="stack">
        <div className="gate-card">
          <div className="band" style={{ background: 'var(--stamp)' }}>{tag}</div>
          <div className="gate-body">
            <span className="stamp" style={{ fontSize: 11, padding: '5px 7px', borderWidth: 2, transform: 'rotate(-4deg)' }}>{stamp}</span>
            <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</h1>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

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
          value={value} onChange={e => setValue(normalizeCode(e.target.value))} placeholder="123456" style={{ letterSpacing: '.3em', fontSize: 20 }}
          aria-invalid={code?.status === 'error'} aria-describedby={code?.status === 'error' ? 'signin-code-error' : undefined} />
        {code?.status === 'error' && <p id="signin-code-error" role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--stamp)' }}>{code.message}</p>}
        <button type="submit" className="ink-btn big" style={{ minHeight: 50 }} disabled={verifying}>{verifying ? 'Vérification…' : 'Valider le code'}</button>
      </form>
      <p style={{ fontSize: 14 }}>Rien reçu ? Regardez dans les indésirables, puis renvoyez le lien.</p>
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} style={{ margin: 0, fontSize: 14, color: notice.kind === 'error' ? 'var(--stamp)' : 'var(--green)' }}>{notice.text}</p>}
      <div className="row" style={{ width: '100%' }}>
        <button type="button" className="ink-line" style={{ flex: 1 }} disabled={left > 0 || resending} onClick={() => { if (!PARAMS.frame) rev.resendLink() }}>
          {resending ? 'Envoi…' : left > 0 ? `Renvoyer dans ${left} s` : 'Renvoyer le lien'}
        </button>
        <button type="button" className="ink-line" style={{ flex: 1 }} onClick={rev.changeEmail}>Modifier l’adresse</button>
      </div>
    </GateCard>
  )
}

/** Connexion par lien magique ou code : un e-mail, aucun mot de passe. */
export function SignInGate() {
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
    <GateCard tag="CONNEXION NÉCESSAIRE" stamp="RESPONSABLES" title="Connectez-vous pour réviser">
      <p>La révision enregistre vos progrès avec votre compte. Saisissez votre e-mail : vous recevrez un lien et un code de connexion, sans mot de passe. La bibliothèque reste ouverte à tous.</p>
      <form className="col g8" style={{ width: '100%' }} onSubmit={submit} noValidate>
        <label htmlFor="signin-email" className="f-lbl">ADRESSE E-MAIL</label>
        <input ref={input} id="signin-email" className="field" type="email" inputMode="email" autoComplete="email" required value={email}
          onChange={e => setEmail(e.target.value)} placeholder="prenom@exemple.sn" aria-invalid={step === 'error'} aria-describedby={step === 'error' ? 'signin-error' : undefined} />
        {step === 'error' && <p id="signin-error" role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--stamp)' }}>{message}</p>}
        <button type="submit" className="ink-btn big" style={{ marginTop: 4, minHeight: 50 }} disabled={step === 'sending'}>{step === 'sending' ? 'Envoi…' : 'Recevoir le lien de connexion'}</button>
      </form>
    </GateCard>
  )
}

/** Chargement de la révision ; au-delà de 6 s, « Réessayer » sans attendre l'expiration (FE-5). */
export function LoadingGate() {
  const { rev } = useApp()
  const [attempt, setAttempt] = useState(0)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    const t = setTimeout(() => setSlow(true), SLOW_LOADING_MS)
    return () => clearTimeout(t)
  }, [attempt])
  return (
    <div className="col g12" style={{ alignItems: 'flex-start' }}>
      <p className="mono" role="status" style={{ margin: 0, color: 'var(--acc)', animation: 'xxbPulse 1.2s ease-in-out infinite' }}>CHARGEMENT DE L’ESPACE DE RÉVISION…</p>
      {slow && (
        <>
          <p className="muted" role="status" style={{ margin: 0, fontSize: 15 }}>Le chargement est long : le réseau est peut-être lent.</p>
          <button className="btn" onClick={() => { rev.retry(); setAttempt(a => a + 1) }}>RÉESSAYER</button>
        </>
      )}
    </div>
  )
}

export function UnavailableGate() {
  const { rev, go } = useApp()
  return (
    <GateCard tag="RÉVISION INDISPONIBLE" stamp="HORS RÉSEAU" title="Révision indisponible pour le moment">
      <p>La révision a besoin d’une connexion pour charger vos progrès. Vérifiez le réseau puis réessayez. La liste de la bibliothèque reste consultable.</p>
      <button className="ink-btn big" style={BIG_BTN} onClick={() => { rev.retry(); go('revision') }}>Réessayer</button>
    </GateCard>
  )
}

export function EmptyGate() {
  const { go } = useApp()
  return (
    <GateCard tag="RÉVISION" stamp="À PARAÎTRE" title="Les cartes arrivent">
      <p>Aucune fiche ni carte n’est encore publiée. Elles sont ajoutées chaque mois avec la fiche de la zone. Les documents sont déjà dans la bibliothèque.</p>
      <button className="ink-btn big" style={BIG_BTN} onClick={() => go('bibliotheque')}>Aller à la bibliothèque</button>
    </GateCard>
  )
}
