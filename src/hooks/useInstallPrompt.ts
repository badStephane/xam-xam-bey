import { useSyncExternalStore } from 'react'
import { installOffer, type InstallOffer } from '../lib/install'
import { PARAMS } from '../lib/params'

/** `beforeinstallprompt` (navigateurs Chromium), absent des types DOM de TypeScript. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}

type State = 'none' | 'ready' | 'installed'

/**
 * L'événement peut partir avant le montage de l'en-tête (et l'en-tête est démonté pendant une session) : il est capté
 * une fois pour toutes au chargement du module. Pas de preventDefault : Chrome garde aussi sa propre proposition.
 */
let deferred: InstallPromptEvent | null = null
let state: State = 'none'
const listeners = new Set<() => void>()
const setState = (next: State): void => { state = next; listeners.forEach(l => l()) }

if (typeof window !== 'undefined' && !PARAMS.frame) {
  window.addEventListener('beforeinstallprompt', e => {
    if (state === 'installed') return
    deferred = e as InstallPromptEvent
    setState('ready')
  })
  window.addEventListener('appinstalled', () => { deferred = null; setState('installed') })
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
const snapshot = (): State => state

const isStandalone = (): boolean =>
  !!window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** La proposition ne sert qu'une fois : refusée, le navigateur en émettra une nouvelle plus tard s'il le juge utile. */
function install(): void {
  const e = deferred
  deferred = null
  setState('none')
  e?.prompt().catch(err => console.warn('[xxb] Installation non proposée par le navigateur', err))
}

export interface InstallPrompt { offer: InstallOffer; install(): void }

/** Ajout à l'écran d'accueil (UX-37) : bouton si le navigateur le permet, marche à suivre sur iPhone et iPad. */
export function useInstallPrompt(): InstallPrompt {
  const current = useSyncExternalStore(subscribe, snapshot)
  if (PARAMS.frame || current === 'installed') return { offer: null, install }
  const device = { userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints ?? 0, standalone: isStandalone() }
  return { offer: installOffer(device, current === 'ready'), install }
}
