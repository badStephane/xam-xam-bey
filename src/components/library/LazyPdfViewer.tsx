import { lazy, Suspense } from 'react'
import type { PdfViewerProps } from './PdfViewer'

const LOADING = 'Chargement de l’aperçu…'

/** Repli si le lecteur ne peut pas être chargé (hors réseau, nouvelle version déployée) : jamais la page d'erreur globale. */
function ViewerUnavailable({ file }: PdfViewerProps) {
  const offline = navigator.onLine === false
  return (
    <div className="pdf-msg col g10" role="alert" style={{ alignItems: 'center' }}>
      <span>{offline
        ? 'Le lecteur intégré n’est pas encore sur cet appareil. Il s’ouvrira au retour de la connexion.'
        : 'Le lecteur intégré n’a pas pu se charger. Rechargez la page, ou ouvrez le PDF dans le lecteur de l’appareil.'}</span>
      {!offline && <a className="pdf-open" href={file} target="_blank" rel="noopener">Ouvrir le PDF ↗</a>}
    </div>
  )
}

/** Lecteur chargé à la demande : son code ne pèse pas sur le premier affichage de la bibliothèque (budget du lot). */
const Viewer = lazy(() => import('./PdfViewer').then(m => ({ default: m.PdfViewer }), () => ({ default: ViewerUnavailable })))

export function LazyPdfViewer(props: PdfViewerProps) {
  return <Suspense fallback={<div className="pdf-msg" role="status">{LOADING}</div>}><Viewer {...props} /></Suspense>
}
