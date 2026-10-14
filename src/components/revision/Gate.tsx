import { lazy, Suspense, useEffect, useState, type ReactNode, type RefObject } from 'react'
import { useApp } from '../../AppContext'

/** Après ce délai de chargement, on propose de réessayer sans attendre l'expiration (15 s). */
const SLOW_LOADING_MS = 6_000
export const BIG_BTN = { marginTop: 4, minHeight: 50, padding: '0 20px' }

interface GateCardProps { tag: string; stamp: string; title: string; titleRef?: RefObject<HTMLHeadingElement>; children: ReactNode }

export function GateCard({ tag, stamp, title, titleRef, children }: GateCardProps) {
  return (
    <div className="gate">
      <div className="stack">
        <div className="gate-card">
          <div className="band" style={{ background: 'var(--stamp)' }}>{tag}</div>
          <div className="gate-body">
            <span className="stamp" style={{ fontSize: '0.6875rem', padding: '5px 7px', borderWidth: 2, transform: 'rotate(-4deg)' }}>{stamp}</span>
            <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</h1>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Hors réseau, personne jamais connectée sur cet appareil (F1) : la connexion demande le réseau. */
function OfflineSignInGate() {
  const { go } = useApp()
  return (
    <GateCard tag="HORS RÉSEAU" stamp="CONNEXION" title="Connectez-vous une première fois avec du réseau">
      <p>La connexion demande du réseau. Ensuite, la révision reste disponible sur cet appareil, même sans réseau.</p>
      <button className="ink-btn big" style={BIG_BTN} onClick={() => go('bibliotheque')}>Aller à la bibliothèque</button>
    </GateCard>
  )
}

// Formulaires introuvables (réseau coupé entre-temps, nouvelle version déployée) : message hors réseau, jamais la page d'erreur.
const Forms = lazy(() => import('./SignInForms').then(m => ({ default: m.SignInForms }), () => ({ default: OfflineSignInGate })))

/** Connexion par lien magique ou code : un e-mail, aucun mot de passe. Hors réseau : la connexion attend le réseau (F1). */
export function SignInGate() {
  const { rev, offline } = useApp()
  if (offline && rev.signIn.step !== 'sent') return <OfflineSignInGate />
  return <Suspense fallback={<p className="mono" role="status" style={{ margin: 0, color: 'var(--acc)' }}>CHARGEMENT…</p>}><Forms /></Suspense>
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
          <p className="muted" role="status" style={{ margin: 0, fontSize: '0.9375rem' }}>Le chargement est long : le réseau est peut-être lent.</p>
          <button className="btn" onClick={() => { rev.retry(); setAttempt(a => a + 1) }}>RÉESSAYER</button>
        </>
      )}
    </div>
  )
}

export function UnavailableGate() {
  const { rev, go, offline } = useApp()
  if (offline) {
    // F1 : compte connu, mais aucune copie valide de la révision sur l'appareil.
    return (
      <GateCard tag="RÉVISION HORS RÉSEAU" stamp="HORS RÉSEAU" title="Révision pas encore gardée sur cet appareil">
        <p>Ouvrez la révision une fois avec du réseau : vos cartes seront ensuite gardées ici pour réviser sans réseau.</p>
        <button className="ink-btn big" style={BIG_BTN} onClick={() => { rev.retry(); go('revision') }}>Réessayer</button>
      </GateCard>
    )
  }
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
