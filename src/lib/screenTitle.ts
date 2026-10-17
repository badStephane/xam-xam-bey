import type { Screen } from './params'

export const SITE_NAME = 'Xam Xam Bëy'

const SCREEN_TITLES: Record<Screen, string> = {
  bibliotheque: 'Bibliothèque',
  apercu: 'Aperçu',
  revision: 'Aujourd’hui',
  session: 'Session en cours',
  fin: 'Bilan de la session',
  plan: 'Plan annuel',
  fiches: 'Fiches',
  progression: 'Progression',
  acces: 'Connexion',
  horsligne: 'Révision indisponible',
  admin: 'Administration',
  ligue: 'Ligue',
  badges: 'Badges',
  page: 'Page de révision',
}

/** Titre du document de chaque écran (UX-13, WCAG 2.4.2) : « Plan annuel · Xam Xam Bëy ». L'aperçu prend le titre du document ouvert. */
export function screenTitle(screen: Screen, docTitle?: string | null): string {
  const label = (screen === 'apercu' || screen === 'page') && docTitle?.trim() ? docTitle.trim() : SCREEN_TITLES[screen]
  return `${label} · ${SITE_NAME}`
}
