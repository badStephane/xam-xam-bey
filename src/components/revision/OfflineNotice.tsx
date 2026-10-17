import { useApp } from '../../AppContext'

export const OFFLINE_NOTICE = 'Hors réseau : vos réponses seront envoyées au retour du réseau.'

/** Vrai si la révision tourne sans réseau : navigateur hors ligne, ou révision lue depuis l'appareil (F1). */
export function useRevisionOffline(): boolean {
  const { offline, rev } = useApp()
  return offline || rev.localOnly
}

/** Bandeau hors réseau de la révision (F1) : les notes restent sur l'appareil et partent au retour du réseau. */
export function OfflineNotice() {
  if (!useRevisionOffline()) return null
  return <div className="banner" role="status"><b>HORS RÉSEAU</b><span style={{ fontSize: '0.875rem' }}>{OFFLINE_NOTICE}</span></div>
}

export const FORCED_OUT_NOTICE = 'Vous avez été déconnecté. Vos réponses restent sur ce téléphone : reconnectez-vous à la fin de la séance pour les envoyer.'

/** Bandeau de séance après une déconnexion imposée (jeton refusé) : les notes vont dans la copie locale du compte. */
export function ForcedOutNotice() {
  const { rev } = useApp()
  if (!rev.forcedOut) return null
  return <div className="banner" role="status"><b>DÉCONNECTÉ</b><span style={{ fontSize: '0.875rem' }}>{FORCED_OUT_NOTICE}</span></div>
}
