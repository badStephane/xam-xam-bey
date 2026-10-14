/**
 * Règles pures du service worker (lot 3, E3), partagées par le worker (src/sw/sw.ts), la page et le build.
 * Aucune API du navigateur ici : tout est testable dans Vitest.
 */

/** Préfixe commun : toute purge ou désinscription vise uniquement les caches du site. */
export const CACHE_PREFIX = 'xxb-'
/** Coquille de l'application, liée à une version du build (purgée au déploiement suivant). */
export const shellCacheName = (version: string): string => `${CACHE_PREFIX}shell-${version}`
/**
 * Fichiers hachés chargés à la demande (pdf.js, lecteur, écrans secondaires). Gardé d'une version à l'autre :
 * un fichier inchangé (même nom haché) n'est pas retéléchargé ; ceux qui ne font plus partie du build sont purgés.
 */
export const RUNTIME_CACHE = `${CACHE_PREFIX}rt-v1`
/** PDF ouverts : gardés d'un déploiement à l'autre (contenu indépendant du code). */
export const PDF_CACHE = `${CACHE_PREFIX}pdf-v1`
/** Plafond du cache des PDF (décision E3) : au-delà, les plus anciens sont évincés. */
export const PDF_CACHE_LIMIT = 150 * 1024 * 1024
/** En-têtes ajoutés aux PDF gardés : date d'entrée et taille réelle, pour l'éviction. */
export const CACHED_AT_HEADER = 'x-xxb-cached-at'
export const SIZE_HEADER = 'x-xxb-size'
/** Délai au-delà duquel une page demandée en 3G est servie depuis le cache plutôt que d'attendre le réseau. */
export const NAV_TIMEOUT_MS = 3500
/** Message envoyé aux pages quand un PDF vient d'être gardé. */
export const PDF_CACHED_MESSAGE = 'xxb-pdf-cached'
/** Message d'une page au worker : garder ce PDF (ouvert dans le lecteur du téléphone, hors de portée du worker). */
export const KEEP_PDF_MESSAGE = 'xxb-keep-pdf'

/** Paramètres d'URL propres à l'application (src/lib/params.ts) : toute autre clé passe directement au réseau. */
export const APP_PARAMS: readonly string[] = ['frame', 'demo', 'layout', 'lib', 'screen', 'theme', 'mode', 'sel', 'q', 'phase']
/** Chemin public des fichiers du bucket « documents » de Supabase Storage. */
const PDF_PATH = /^\/storage\/v1\/object\/public\/documents\/[^?#]+$/

export type Route =
  /** Le service worker ne répond pas : la requête part au réseau comme sans lui. */
  | 'network'
  /** Page de l'application : réseau d'abord (délai court), puis index.html gardé. */
  | 'page'
  /** Fichier de la coquille ou chargé à la demande sur le site : cache d'abord. */
  | 'asset'
  /** PDF du bucket public : cache d'abord, gardé avec un plafond. */
  | 'pdf'

export interface RouteInput {
  url: string
  method: string
  /** `request.mode` : « navigate » pour une page. */
  mode: string
  /** Vrai si la requête porte un en-tête Range (lecture partielle d'un PDF). */
  hasRange: boolean
}

/** Origine et chemin de base du site (dossier qui contient sw.js), ex. https://site.tld/ */
export interface Scope { origin: string; path: string }

/** Adresse de la page servie hors réseau : index.html du dossier du site. */
export const pageUrl = (scope: Scope): string => `${scope.origin}${scope.path}index.html`

/**
 * Paramètres de suivi ajoutés aux liens partagés (réseaux sociaux, régies) : sans effet sur la page, ils ne doivent pas
 * empêcher de la servir hors ligne (L3-4). Le retour du lien magique (code, token_hash, error…) n'en fait pas partie.
 */
const TRACKING_PARAM = /^(?:utm_[a-z0-9_]+|fbclid|gclid)$/i
const isPageParam = (key: string): boolean => APP_PARAMS.includes(key) || TRACKING_PARAM.test(key)

function sameOriginRoute(url: URL, input: RouteInput, scope: Scope): Route {
  if (!url.pathname.startsWith(scope.path)) return 'network'
  const rel = url.pathname.slice(scope.path.length)
  if (input.mode === 'navigate') {
    if (rel !== '' && rel !== 'index.html') return 'network'
    // Retour du lien magique (code, jetons, erreur d'Auth) : jamais intercepté, l'adresse passe telle quelle au réseau.
    // Seuls les paramètres de l'application et de suivi sont admis ; une seule autre clé suffit à passer au réseau.
    return [...url.searchParams.keys()].every(isPageParam) ? 'page' : 'network'
  }
  return rel.startsWith('assets/') || rel.startsWith('pdfjs/') ? 'asset' : 'network'
}

/** Aiguillage d'une requête. API REST, Auth, Realtime de Supabase et toute autre origine : jamais mis en cache. */
export function routeRequest(input: RouteInput, scope: Scope, storageOrigin: string | null): Route {
  if (input.method !== 'GET') return 'network'
  let url: URL
  try { url = new URL(input.url) } catch { return 'network' }
  if (url.origin === scope.origin) return sameOriginRoute(url, input, scope)
  if (!storageOrigin || url.origin !== storageOrigin || input.mode === 'navigate' || input.hasRange) return 'network'
  // « ?download= » sert le bouton Télécharger (navigation du navigateur) : pas un aperçu à garder.
  return PDF_PATH.test(url.pathname) && !url.search ? 'pdf' : 'network'
}

export interface CachedPdf { url: string; size: number; cachedAt: number }

/**
 * PDF à retirer pour faire entrer `incoming` octets sous `limit` : les plus anciens d'abord.
 * Renvoie null si le fichier ne tiendra jamais (plus gros que le plafond) : on ne le garde pas.
 */
export function pickEvictions(entries: readonly CachedPdf[], incoming: number, limit: number = PDF_CACHE_LIMIT): string[] | null {
  if (incoming > limit) return null
  const byAge = [...entries].sort((a, b) => a.cachedAt - b.cachedAt)
  let total = entries.reduce((sum, e) => sum + e.size, 0) + incoming
  const out: string[] = []
  for (const e of byAge) {
    if (total <= limit) break
    out.push(e.url)
    total -= e.size
  }
  return out
}

/**
 * Évictions pour garder `incoming` octets sous l'adresse `url`. Une copie plus ancienne de cette même adresse (PDF remplacé,
 * L3-6) n'est pas comptée : elle sera écrasée, et jamais évincée à la place d'un autre.
 */
export const evictionsFor = (entries: readonly CachedPdf[], url: string, incoming: number, limit: number = PDF_CACHE_LIMIT): string[] | null =>
  pickEvictions(entries.filter(e => e.url !== url), incoming, limit)

/** Taille annoncée par les en-têtes (Content-Length), ou null si absente ou invalide. */
export function declaredSize(contentLength: string | null): number | null {
  if (!contentLength || !/^\d+$/.test(contentLength.trim())) return null
  return Number(contentLength.trim())
}

/** Lecture d'une entrée gardée depuis ses en-têtes ; null si l'entrée n'a pas été écrite par le worker. */
export function cachedPdfOf(url: string, cachedAt: string | null, size: string | null): CachedPdf | null {
  const at = Number(cachedAt)
  const sz = Number(size)
  if (!cachedAt || !size || !Number.isFinite(at) || !Number.isFinite(sz) || sz < 0) return null
  return { url, size: sz, cachedAt: at }
}

/** Caches du site à supprimer à l'activation d'une version : les coquilles des autres versions (et tout cache xxb-* inconnu). */
export function staleCaches(names: readonly string[], version: string): string[] {
  const keep = new Set([shellCacheName(version), RUNTIME_CACHE, PDF_CACHE])
  return names.filter(n => n.startsWith(CACHE_PREFIX) && !keep.has(n))
}

/** Fichiers hachés gardés à l'exécution qui ne font plus partie du build courant (chemins relatifs au site). */
export function staleAssets(cached: readonly string[], current: readonly string[]): string[] {
  const now = new Set(current)
  return cached.filter(p => p.startsWith('assets/') && !now.has(p))
}

/** Lecteur PDF : pdf.js, son worker et le composant du lecteur, nécessaires pour relire hors ligne un PDF gardé. */
const READER = /^assets\/(?:pdf(?:\.worker)?\.min|PdfViewer)-[\w-]+\.m?js$/
export const readerAssets = (assets: readonly string[]): string[] => assets.filter(p => READER.test(p))

/** Réponse du site candidate au cache : ce qu'il faut en savoir pour décider (L3-3). */
export interface FileResponse { ok: boolean; type: string; contentType: string | null }

const SCRIPT_TYPE = /^(?:text|application)\/(?:x-)?javascript$/
/** Type attendu par extension pour les fichiers de la coquille et chargés à la demande. */
const EXPECTED_TYPES: Readonly<Record<string, RegExp>> = {
  js: SCRIPT_TYPE,
  mjs: SCRIPT_TYPE,
  css: /^text\/css$/,
  woff2: /^(?:font\/woff2|application\/font-woff2)$/,
  html: /^text\/html$/,
}

const mimeOf = (contentType: string | null): string => (contentType ?? '').split(';')[0].trim().toLowerCase()
const extensionOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
}

/**
 * Peut-on garder cette réponse du site (L3-3) ? Elle doit être réussie, de même origine (`basic`) et d'un type cohérent
 * avec l'extension (js, mjs, css, woff2, html). Une page HTML n'est jamais gardée sous un autre nom : sans 404.html,
 * Cloudflare Pages répond index.html en 200 à un ancien fichier haché disparu, qui serait sinon servi comme script.
 */
export function isKeepableFile(path: string, res: FileResponse): boolean {
  if (!res.ok || res.type !== 'basic') return false
  const mime = mimeOf(res.contentType)
  const ext = extensionOf(path)
  if (mime === 'text/html' && ext !== 'html') return false
  const expected = EXPECTED_TYPES[ext]
  return expected ? expected.test(mime) : true
}

/** Repères de version d'un PDF, lus dans les en-têtes (ceux qu'une réponse `cors` laisse lire). */
export interface PdfValidators { etag: string | null; lastModified: string | null; size: number | null }

export function pdfValidators(get: (name: string) => string | null): PdfValidators {
  return {
    etag: get('etag')?.trim().replace(/^W\//, '') || null,
    lastModified: get('last-modified')?.trim() || null,
    size: declaredSize(get(SIZE_HEADER)) ?? declaredSize(get('content-length')),
  }
}

/**
 * Le PDF en ligne diffère-t-il de la copie gardée (L3-6) ? ETag si les deux en ont, sinon Last-Modified, sinon la taille.
 * Sans repère comparable : on le tient pour inchangé (jamais de téléchargement à l'aveugle à chaque ouverture).
 */
export function pdfChanged(kept: PdfValidators, online: PdfValidators): boolean {
  if (kept.etag && online.etag) return kept.etag !== online.etag
  if (kept.lastModified && online.lastModified) return kept.lastModified !== online.lastModified
  if (kept.size !== null && online.size !== null) return kept.size !== online.size
  return false
}

/** Fichier haché (nom immuable) : une copie déjà gardée par une version précédente peut être reprise telle quelle. */
export const isHashedAsset = (path: string): boolean => path.startsWith('assets/')

/** Chemin relatif au site d'une adresse du site, ou null hors du site. */
export function sitePath(url: string, scope: Scope): string | null {
  try {
    const u = new URL(url)
    return u.origin === scope.origin && u.pathname.startsWith(scope.path) ? u.pathname.slice(scope.path.length) : null
  } catch {
    return null
  }
}

const ATTR_URL = /<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"[^>]*>/g
const CSS_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g
const isLocalAsset = (u: string): boolean => !/^(?:[a-z]+:)?\/\//i.test(u) && !u.startsWith('data:') && !u.startsWith('#')

/** Fichiers du site cités par une page HTML construite (scripts, modulepreload, styles, préchargements). */
export function htmlAssetUrls(html: string): string[] {
  return [...html.matchAll(ATTR_URL)].map(m => m[1]).filter(isLocalAsset)
}

/** Fichiers cités par une feuille de style (polices, images), relatifs à la feuille. */
export function cssAssetUrls(css: string): string[] {
  return [...css.matchAll(CSS_URL)].map(m => m[1].trim()).filter(isLocalAsset)
}

/** Chemin relatif au dossier du site, à partir d'une adresse relative à `fromDir` (ex. « assets/ »). */
export function resolveRelative(fromDir: string, ref: string): string {
  const parts = (ref.startsWith('/') ? ref.slice(1) : `${fromDir}${ref}`).split('/')
  const out = parts.reduce<string[]>((acc, p) => (p === '..' ? acc.slice(0, -1) : p === '.' || p === '' ? acc : [...acc, p]), [])
  return out.join('/')
}

/**
 * Manifeste de la coquille : index.html, puis les fichiers qu'il cite et ceux que citent ses feuilles de style.
 * `readCss(path)` renvoie le texte d'une feuille du build. Chemins relatifs au dossier du site, triés, sans doublon.
 */
export function shellManifest(html: string, readCss: (path: string) => string | null): string[] {
  const direct = htmlAssetUrls(html).map(u => resolveRelative('', u))
  const fromCss = direct.filter(p => p.endsWith('.css')).flatMap(p => {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : ''
    return cssAssetUrls(readCss(p) ?? '').map(u => resolveRelative(dir, u))
  })
  return ['index.html', ...[...new Set([...direct, ...fromCss])].sort()]
}

/** Empreinte courte et stable (FNV-1a 32 bits) : identifie une version du build pour nommer ses caches. */
export function buildVersion(parts: readonly string[]): string {
  let h = 0x811c9dc5
  for (const ch of parts.join('\n')) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/**
 * Adresse d'un PDF à garder, lue dans un message de page ; null si le message n'est pas une demande valide
 * ou vise autre chose qu'un PDF du bucket public (le worker ne télécharge rien d'autre sur demande).
 */
export function keepRequestUrl(data: unknown, scope: Scope, storageOrigin: string | null): string | null {
  if (!data || typeof data !== 'object') return null
  const { type, url } = data as { type?: unknown; url?: unknown }
  if (type !== KEEP_PDF_MESSAGE || typeof url !== 'string') return null
  return routeRequest({ url, method: 'GET', mode: 'cors', hasRange: false }, scope, storageOrigin) === 'pdf' ? url : null
}

/** Morceau du build (vue réduite du bundle Rollup) : nom de fichier, module d'entrée, imports statiques. */
export interface BuiltChunk { fileName: string; facadeModuleId: string | null; imports: readonly string[] }

/** Écrans chargés à la demande à garder hors ligne dès l'installation du worker (lot 5 : Ligue, Badges, blocs du bilan). */
export const OFFLINE_SCREENS = /[\\/]components[\\/]league[\\/]Gamification\.tsx$/

/**
 * Fichiers à précharger à l'installation : les morceaux dont le module d'entrée correspond à `entry`, et leurs imports
 * statiques (dépendances partagées), sauf ceux déjà dans la coquille. Chemins relatifs au site, triés.
 */
export function offlineScreenAssets(chunks: readonly BuiltChunk[], shell: readonly string[], entry: RegExp = OFFLINE_SCREENS): string[] {
  const byName = new Map(chunks.map(c => [c.fileName, c]))
  const out = new Set<string>()
  const visit = (name: string): void => {
    if (out.has(name)) return
    out.add(name)
    byName.get(name)?.imports.forEach(visit)
  }
  chunks.filter(c => c.facadeModuleId && entry.test(c.facadeModuleId)).forEach(c => visit(c.fileName))
  const inShell = new Set(shell)
  return [...out].filter(p => !inShell.has(p)).sort()
}
