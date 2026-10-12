import { useState, type FormEvent, type ReactNode } from 'react'
import { useApp } from '../../AppContext'
import { PARAMS } from '../../lib/params'

function GateCard({ tag, stamp, title, children }: { tag: string; stamp: string; title: string; children: ReactNode }) {
  return (
    <div className="gate">
      <div className="stack">
        <div className="gate-card">
          <div className="band" style={{ background: 'var(--stamp)' }}>{tag}</div>
          <div className="gate-body">
            <span className="stamp" style={{ fontSize: 11, padding: '5px 7px', borderWidth: 2, transform: 'rotate(-4deg)' }}>{stamp}</span>
            <h1>{title}</h1>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Connexion par lien magique : un e-mail, un lien, aucun mot de passe. */
export function SignInGate() {
  const { rev } = useApp()
  const [email, setEmail] = useState('')
  const { step, message } = rev.signIn
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!PARAMS.frame) rev.requestLink(email)
  }
  if (step === 'sent') {
    return (
      <GateCard tag="LIEN ENVOYÉ" stamp="BOÎTE MAIL" title="Ouvrez le lien reçu">
        <p>Un lien de connexion vient d’être envoyé à <b>{message}</b>. Ouvrez-le sur cet appareil : vous arriverez directement sur la révision.</p>
        <p style={{ fontSize: 14 }}>Rien reçu ? Regardez dans les indésirables, ou recommencez dans une minute.</p>
      </GateCard>
    )
  }
  return (
    <GateCard tag="CONNEXION NÉCESSAIRE" stamp="RESPONSABLES" title="Connectez-vous pour réviser">
      <p>La révision enregistre vos progrès avec votre compte. Saisissez votre e-mail : vous recevrez un lien de connexion, sans mot de passe. La bibliothèque reste ouverte à tous.</p>
      <form className="col g8" style={{ width: '100%' }} onSubmit={submit} noValidate>
        <label htmlFor="signin-email" className="f-lbl">ADRESSE E-MAIL</label>
        <input id="signin-email" className="field" type="email" inputMode="email" autoComplete="email" required value={email}
          onChange={e => setEmail(e.target.value)} placeholder="prenom@exemple.sn" aria-invalid={step === 'error'} aria-describedby={step === 'error' ? 'signin-error' : undefined} />
        {step === 'error' && <p id="signin-error" role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--stamp)' }}>{message}</p>}
        <button type="submit" className="ink-btn big" style={{ marginTop: 4, minHeight: 50 }} disabled={step === 'sending'}>{step === 'sending' ? 'Envoi…' : 'Recevoir le lien de connexion'}</button>
      </form>
    </GateCard>
  )
}

export function UnavailableGate() {
  const { rev, go } = useApp()
  return (
    <GateCard tag="RÉVISION INDISPONIBLE" stamp="HORS RÉSEAU" title="Révision indisponible pour le moment">
      <p>La révision a besoin d’une connexion pour charger vos progrès. Vérifiez le réseau puis réessayez. Les pièces de la bibliothèque restent lisibles.</p>
      <button className="ink-btn big" style={{ marginTop: 4, minHeight: 50, padding: '0 20px' }} onClick={() => { rev.retry(); go('revision') }}>Réessayer</button>
    </GateCard>
  )
}

export function EmptyGate() {
  const { go } = useApp()
  return (
    <GateCard tag="RÉVISION" stamp="À PARAÎTRE" title="Les cartes arrivent">
      <p>Aucune fiche ni carte n’est encore publiée. Elles sont ajoutées chaque mois avec la fiche de la zone. Les documents sont déjà dans la bibliothèque.</p>
      <button className="ink-btn big" style={{ marginTop: 4, minHeight: 50, padding: '0 20px' }} onClick={() => go('bibliotheque')}>Aller à la bibliothèque</button>
    </GateCard>
  )
}
