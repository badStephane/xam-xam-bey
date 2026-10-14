import type { ReactNode } from 'react'
import { useApp } from '../../AppContext'
import { EmptyGate, LoadingGate, SignInGate, UnavailableGate } from './Gate'
import { OfflineNotice, useRevisionOffline } from './OfflineNotice'

/** Affiche l'écran de révision demandé, ou l'état d'accès (chargement, connexion, indisponible, vide). */
export function RevisionArea({ children }: { children: ReactNode }) {
  const { ui, rev } = useApp()
  const netDown = useRevisionOffline()
  if (ui.screen === 'acces') return <SignInGate />
  if (ui.screen === 'horsligne') return <UnavailableGate />
  switch (rev.status) {
    case 'idle':
    case 'loading':
      return <LoadingGate />
    case 'signedout': return <SignInGate />
    case 'unavailable': return <UnavailableGate />
    case 'empty': return <EmptyGate />
    default: break
  }
  // Hors réseau (F1) : aucune erreur d'enregistrement, le bandeau dit que les réponses partiront au retour du réseau.
  // Un refus du serveur (« rejected ») reste affiché : il ne vient pas du réseau.
  const showSaveErr = !!rev.saveErr && (rev.saveErr === 'rejected' || !netDown)
  return (
    <>
      <OfflineNotice />
      {showSaveErr && (
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
