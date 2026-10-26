/**
 * Application installable (UX-37) : que proposer pour ajouter le site à l'écran d'accueil. Logique pure, testée dans Vitest.
 *  - « prompt » : le navigateur (Chrome, Edge, Samsung Internet) a émis `beforeinstallprompt` : bouton « Installer ».
 *  - « ios » : iPhone ou iPad, qui n'offre aucune installation par script : marche à suivre (Partager, Sur l'écran d'accueil).
 *  - null : déjà ouverte depuis l'écran d'accueil, ou navigateur qui ne sait pas installer (navigateur intégré d'une appli).
 */
export type InstallOffer = 'prompt' | 'ios' | null

/** Ce que la page sait de l'appareil (navigator et display-mode), injecté pour les tests. */
export interface Device {
  userAgent: string
  platform: string
  maxTouchPoints: number
  /** Ouverte depuis l'écran d'accueil (`display-mode: standalone`, ou `navigator.standalone` sur iOS). */
  standalone: boolean
}

const IOS_UA = /\b(?:iPhone|iPad|iPod)\b/
/** iPad en mode bureau (iPadOS 13 et suivants) : se présente comme un Mac, mais avec un écran tactile. */
const isIos = (d: Device): boolean => IOS_UA.test(d.userAgent) || (d.platform === 'MacIntel' && d.maxTouchPoints > 1)

export function installOffer(device: Device, hasPrompt: boolean): InstallOffer {
  if (device.standalone) return null
  if (hasPrompt) return 'prompt'
  return isIos(device) ? 'ios' : null
}
