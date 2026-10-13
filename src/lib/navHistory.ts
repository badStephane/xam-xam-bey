import { SCREENS, type Screen } from './params'

/** Une entrée d'historique : l'écran, et la pièce ouverte pour l'aperçu. */
export interface NavEntry {
  screen: Screen
  sel: number | null
}

/** État posé dans history.state : l'entrée et sa position dans la pile propre au site. */
export interface NavState {
  xxb: NavEntry
  idx: number
}

export type NavAction = 'none' | 'push' | 'replace' | 'back'

const DEFAULT_ENTRY: NavEntry = { screen: 'bibliotheque', sel: null }
const SESSION_SCREENS: readonly Screen[] = ['session', 'fin']

const isScreen = (s: unknown): s is Screen => typeof s === 'string' && (SCREENS as readonly string[]).includes(s)
const isId = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0

export const sameEntry = (a: NavEntry, b: NavEntry): boolean =>
  a.screen === b.screen && (a.screen !== 'apercu' || a.sel === b.sel)

/** Hash d'une entrée : `#plan`, `#apercu/12`. */
export const hashFor = (e: NavEntry): string => (e.screen === 'apercu' && e.sel ? `#apercu/${e.sel}` : `#${e.screen}`)

/** Lit `#plan` ou `#apercu/12`. Tout autre hash (jetons du lien magique, ancres) renvoie null. */
export function parseHash(hash: string): NavEntry | null {
  const m = /^#([a-z]+)(?:\/(\d+))?$/.exec(hash)
  if (!m || !isScreen(m[1])) return null
  const sel = m[2] ? Number(m[2]) : null
  if (m[1] === 'apercu') return isId(sel) ? { screen: 'apercu', sel } : null
  return { screen: m[1], sel: null }
}

/** Fragment laissé par le lien magique de Supabase (jetons ou erreur) : ne doit jamais rester dans l'adresse. */
export const hasAuthFragment = (hash: string): boolean => /[#&](access_token|refresh_token|error_description)=/.test(hash)

/** Valide history.state : seul l'état posé par le site est reconnu. */
export function readState(state: unknown): NavState | null {
  const s = state as { xxb?: { screen?: unknown; sel?: unknown }; idx?: unknown } | null
  if (!s || typeof s !== 'object' || !s.xxb || !isScreen(s.xxb.screen)) return null
  if (typeof s.idx !== 'number' || !Number.isInteger(s.idx) || s.idx < 0) return null
  const sel = isId(s.xxb.sel) ? s.xxb.sel : null
  if (s.xxb.screen === 'apercu' && sel === null) return null
  return { xxb: { screen: s.xxb.screen, sel }, idx: s.idx }
}

/** Écran de départ : le hash d'abord (rechargement), puis ?screen= (lien magique, planches), puis la bibliothèque. */
export function initialEntry(hash: string, paramScreen: Screen | null, paramSel: number | null): NavEntry {
  const fromHash = parseHash(hash)
  const e = fromHash ?? (paramScreen ? { screen: paramScreen, sel: paramScreen === 'apercu' ? paramSel : null } : DEFAULT_ENTRY)
  // Une séance n'existe qu'en mémoire : au rechargement, retour à l'écran du jour.
  return SESSION_SCREENS.includes(e.screen) && fromHash ? { screen: 'revision', sel: null } : e
}

/** Cible d'un retour arrière : une séance ou un bilan disparus deviennent l'écran du jour. */
export const normalizeTarget = (e: NavEntry, hasSession: boolean): NavEntry =>
  (SESSION_SCREENS.includes(e.screen) && !hasSession ? { screen: 'revision', sel: null } : e)

/**
 * Effet d'un go() sur l'historique.
 * - même écran : rien ;
 * - retour vers l'entrée précédente connue : history.back() (pile propre, le bouton RETOUR et le geste Android s'accordent) ;
 * - sortie d'une séance (bilan, abandon) : on remplace l'entrée de la séance, qui ne doit pas revenir ;
 * - sinon : nouvelle entrée.
 */
export function navAction(from: NavEntry, to: NavEntry, prev: NavEntry | null): NavAction {
  if (sameEntry(from, to)) return 'none'
  if (prev && sameEntry(prev, to)) return 'back'
  if (from.screen === 'session') return 'replace'
  return 'push'
}
