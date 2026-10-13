import type { ReactNode } from 'react'
import { useApp } from '../../AppContext'
import { EmptyGate, SignInGate, UnavailableGate } from './Gate'

/** Affiche l'écran de révision demandé, ou l'état d'accès (chargement, connexion, indisponible, vide). */
export function RevisionArea({ children }: { children: ReactNode }) {
  const { ui, rev } = useApp()
  if (ui.screen === 'acces') return <SignInGate />
  if (ui.screen === 'horsligne') return <UnavailableGate />
  switch (rev.status) {
    case 'idle':
    case 'loading':
      return <p className="mono" role="status" style={{ color: 'var(--acc)', animation: 'xxbPulse 1.2s ease-in-out infinite' }}>CHARGEMENT DE L’ESPACE DE RÉVISION…</p>
    case 'signedout': return <SignInGate />
    case 'unavailable': return <UnavailableGate />
    case 'empty': return <EmptyGate />
    default: break
  }
  return (
    <>
      {rev.saveErr && (
        <div className="warn-inline" role="alert">
          <span>{rev.saveErr === 'rejected'
            ? 'Votre progression n’a pas pu être enregistrée en ligne. Elle reste gardée sur cet appareil.'
            : 'Votre dernière progression n’a pas pu être enregistrée. Nouvel essai automatique dans quelques secondes.'}</span>
          <button className="btn-mono" onClick={rev.retrySave}>RÉESSAYER</button>
        </div>
      )}
      {children}
    </>
  )
}
