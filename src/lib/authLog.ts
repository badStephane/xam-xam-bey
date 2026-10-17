/**
 * Journal de connexion de l'appareil (diagnostic des déconnexions) : derniers événements d'authentification avec le contexte
 * du moment. Aucune donnée personnelle (ni e-mail, ni identifiant) ; lu par la personne sur l'écran de connexion.
 */
export const AUTH_LOG_KEY = 'xxb.authlog.v1'
export const AUTH_LOG_MAX = 20

/** forced : SIGNED_OUT non choisi ; chosen : « Se déconnecter » ; absent : aucune session à l'ouverture ; refreshed : jeton rafraîchi. */
export type AuthEventKind = 'forced' | 'chosen' | 'absent' | 'signed_in' | 'refreshed'
export type AppMode = 'appli' | 'navigateur' | 'webview'

export interface AuthLogEntry {
  /** Date de l'événement (ms). */
  t: number
  k: AuthEventKind
  vis: 'visible' | 'hidden'
  /** Réseau annoncé par le navigateur. */
  on: boolean
  /** Appli installée, navigateur, ou navigateur intégré d'une autre appli (Gmail…). */
  app: AppMode
  /** Jeton Supabase présent dans le stockage juste avant l'événement. */
  tok: boolean
}

const KINDS: readonly AuthEventKind[] = ['forced', 'chosen', 'absent', 'signed_in', 'refreshed']
const APPS: readonly AppMode[] = ['appli', 'navigateur', 'webview']
const TOKEN_KEY = /^sb-.+-auth-token$/

function isEntry(v: unknown): v is AuthLogEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return typeof e.t === 'number' && KINDS.includes(e.k as AuthEventKind) && (e.vis === 'visible' || e.vis === 'hidden')
    && typeof e.on === 'boolean' && APPS.includes(e.app as AppMode) && typeof e.tok === 'boolean'
}

export function readAuthLog(store: Storage | null): AuthLogEntry[] {
  try {
    const raw: unknown = JSON.parse(store?.getItem(AUTH_LOG_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter(isEntry) : []
  } catch {
    return []
  }
}

export function appendAuthLog(store: Storage | null, e: AuthLogEntry): void {
  try {
    const { t, k, vis, on, app, tok } = e
    store?.setItem(AUTH_LOG_KEY, JSON.stringify([...readAuthLog(store), { t, k, vis, on, app, tok }].slice(-AUTH_LOG_MAX)))
  } catch {
    // Quota dépassé ou stockage bloqué : le diagnostic est facultatif.
  }
}

export function hasStoredToken(store: Storage | null): boolean {
  try {
    if (!store) return false
    for (let i = 0; i < store.length; i++) if (TOKEN_KEY.test(store.key(i) || '')) return true
    return false
  } catch {
    return false
  }
}

function appMode(): AppMode {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return 'appli'
  // WebView Android (« wv ») : navigateur intégré d'une autre appli, au stockage séparé de Chrome.
  return /; wv\)/.test(navigator.userAgent) ? 'webview' : 'navigateur'
}

/** Événement avec le contexte courant de la page. */
export function authEvent(k: AuthEventKind, store: Storage | null): AuthLogEntry {
  return { t: Date.now(), k, vis: document.visibilityState === 'hidden' ? 'hidden' : 'visible', on: navigator.onLine !== false, app: appMode(), tok: hasStoredToken(store) }
}
