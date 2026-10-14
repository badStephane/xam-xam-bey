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
