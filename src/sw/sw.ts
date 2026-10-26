/**
 * Service worker du site (lot 3, E3), écrit à la main. Compilé au build en dist/sw.js (src/sw/buildSw.ts),
 * avec la version, le manifeste de la coquille et l'origine du stockage injectés.
 *  - Pages : réseau d'abord (3,5 s), puis index.html gardé. Retour du lien magique : jamais intercepté.
 *  - Mise à jour : nouvelle version active dès son installation (skipWaiting), caches des versions précédentes purgés.
 *  - Coquille (index.html, script principal, styles, polices) : préchargée à l'installation.
 *  - Fichiers hachés chargés à la demande (pdf.js, écrans secondaires) : gardés au premier usage, d'une version à l'autre ;
 *    les écrans Ligue et Badges du lot 5 sont préchargés à l'installation (__XXB_SW_PRECACHE__) ;
 *    le lecteur PDF est préchargé à chaque version si l'appareil garde des PDF (sinon un PDF gardé deviendrait illisible).
 *  - PDF du bucket public : cache d'abord, plafond de 150 Mo, plus anciens évincés. Un PDF ouvert dans le lecteur du
 *    téléphone est gardé sur demande de la page (message « xxb-keep-pdf »). PDF déjà gardé et ouvert en ligne : revalidé
 *    en arrière-plan (HEAD, puis nouveau téléchargement s'il a changé), jamais en 2G ni avec l'économie de données (L3-6).
 *  - Fichiers du site : gardés seulement si la réponse a le type attendu (jamais une page HTML de repli, L3-3).
 *  - API REST, Auth, Realtime de Supabase : jamais mis en cache (routeRequest).
 */
import { isCostlyNetwork, type ConnectionHint } from '../lib/openMode'
import {
  CACHED_AT_HEADER, NAV_TIMEOUT_MS, PDF_CACHE, PDF_CACHED_MESSAGE, RUNTIME_CACHE, SIZE_HEADER, cachedPdfOf, declaredSize, evictionsFor, isHashedAsset,
  isKeepableFile, isShellQuery, keepRequestUrl, pageUrl, pdfChanged, pdfValidators, readerAssets, routeRequest, shellCacheName, sitePath,
  staleAssets, staleCaches, type CachedPdf, type Scope,
} from './rules'

declare const __XXB_SW_VERSION__: string
declare const __XXB_SW_SHELL__: string[]
/** Tous les fichiers hachés du build (assets/), pour purger ceux qui ont disparu et précharger le lecteur PDF. */
declare const __XXB_SW_ASSETS__: string[]
declare const __XXB_SW_STORAGE__: string | null
/** Écrans chargés à la demande gardés dès l'installation (lot 5 : Ligue, Badges), dans le cache d'exécution. */
declare const __XXB_SW_PRECACHE__: string[]

/** Types minimaux du contexte de service worker (la configuration TypeScript du projet charge la bibliothèque DOM). */
interface ExtendableEvent extends Event { waitUntil(p: Promise<unknown>): void }
interface FetchEvent extends ExtendableEvent { request: Request; respondWith(r: Promise<Response> | Response): void }
interface SwClient { postMessage(message: unknown): void }
interface ExtendableMessageEvent extends ExtendableEvent { data: unknown; ports: readonly MessagePort[] }
interface SwScope {
  location: Location
  navigator: { onLine: boolean; connection?: ConnectionHint }
  registration: { scope: string }
  clients: { claim(): Promise<void>; matchAll(o?: { type?: string }): Promise<SwClient[]> }
  skipWaiting(): Promise<void>
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void
  addEventListener(type: 'message', fn: (e: ExtendableMessageEvent) => void): void
}

const sw = self as unknown as SwScope
const VERSION = __XXB_SW_VERSION__
const SHELL = shellCacheName(VERSION)
const scopeUrl = new URL(sw.registration.scope)
const SCOPE: Scope = { origin: scopeUrl.origin, path: scopeUrl.pathname }
const urlOf = (path: string): string => new URL(path, sw.registration.scope).href

/**
 * Garde un fichier du site dans `cache`. Fichier haché déjà gardé par une version précédente : copie locale, aucun
 * téléchargement (données mobiles payées au Mo). Sinon, réseau sans cache HTTP.
 */
async function keep(cache: Cache, path: string): Promise<void> {
  const url = urlOf(path)
  if (isHashedAsset(path) && await cache.match(url)) return
  const previous = isHashedAsset(path) ? await caches.match(url) : undefined
  if (previous) return cache.put(url, previous)
  const res = await fetch(new Request(url, { cache: 'reload' }))
  if (!isKeepableFile(path, fileResponse(res))) throw new Error(`${path} : ${res.status} ${res.headers.get('content-type') ?? ''}`)
  return cache.put(url, res)
}

/**
 * L'appareil garde des PDF : le lecteur (pdf.js) doit être là hors ligne, même s'il a changé avec ce déploiement,
 * et même si les PDF ont été ouverts dans le lecteur du téléphone (le site n'a alors jamais chargé pdf.js).
 * Fichiers déjà gardés : rien n'est téléchargé.
 */
async function keepReader(): Promise<void> {
  if (!(await caches.has(PDF_CACHE)) || !(await (await caches.open(PDF_CACHE)).keys()).length) return
  const rt = await caches.open(RUNTIME_CACHE)
  await Promise.all(readerAssets(__XXB_SW_ASSETS__).map(p => keep(rt, p).catch(() => undefined)))
}

/** Ligue et Badges hors ligne sans visite préalable (lot 5). Un échec n'empêche pas l'installation : repli à l'écran. */
async function keepOfflineScreens(): Promise<void> {
  const rt = await caches.open(RUNTIME_CACHE)
  await Promise.all(__XXB_SW_PRECACHE__.map(p => keep(rt, p).catch(() => undefined)))
}

sw.addEventListener('install', event => {
  // Tout ou rien pour la coquille : si un fichier manque, la nouvelle version ne s'installe pas et l'ancienne reste.
  event.waitUntil(caches.open(SHELL)
    .then(cache => Promise.all(__XXB_SW_SHELL__.map(p => keep(cache, p))))
    .then(() => keepReader())
    .then(() => keepOfflineScreens())
    .then(() => sw.skipWaiting()))
})

/** Retire du cache d'exécution les fichiers hachés qui ne font plus partie du build. */
async function pruneRuntime(): Promise<void> {
  const rt = await caches.open(RUNTIME_CACHE)
  const byPath = new Map((await rt.keys()).flatMap(k => { const p = sitePath(k.url, SCOPE); return p === null ? [] : [[p, k] as const] }))
  await Promise.all(staleAssets([...byPath.keys()], __XXB_SW_ASSETS__).map(p => rt.delete(byPath.get(p)!)))
}

sw.addEventListener('activate', event => {
  // Nouvelle version active tout de suite ; coquilles des versions précédentes et fichiers disparus purgés (PDF gardés).
  event.waitUntil(caches.keys()
    .then(names => Promise.all(staleCaches(names, VERSION).map(n => caches.delete(n))))
    .then(() => pruneRuntime())
    .then(() => sw.clients.claim()))
})

sw.addEventListener('fetch', event => {
  const req = event.request
  const route = routeRequest({ url: req.url, method: req.method, mode: req.mode, hasRange: req.headers.has('range') }, SCOPE, __XXB_SW_STORAGE__)
  if (route === 'network') return
  if (route === 'page') event.respondWith(page(req))
  else if (route === 'asset') event.respondWith(asset(req))
  else event.respondWith(pdf(event))
})

/**
 * Page : réseau d'abord, pour ne jamais rester sur une vieille version. Réseau coupé ou plus lent que 3,5 s (« lie-fi ») :
 * index.html gardé. Sans copie gardée, on attend le réseau jusqu'au bout.
 */
async function page(req: Request): Promise<Response> {
  const network = fetch(req)
  network.catch(() => undefined)
  const late = new Promise<null>(resolve => setTimeout(() => resolve(null), NAV_TIMEOUT_MS))
  try {
    const first = await Promise.race([network, late])
    if (first) return first
  } catch {
    // Réseau coupé : on tente la copie gardée.
  }
  const cached = await caches.match(pageUrl(SCOPE), { cacheName: SHELL })
  return cached ?? network
}

const fileResponse = (res: Response) => ({ ok: res.ok, type: res.type, contentType: res.headers.get('content-type') })

/**
 * Fichiers hachés (immuables) : cache d'abord ; un fichier absent est gardé au premier usage réussi, s'il a le type
 * attendu (L3-3 : la page HTML de repli de Pages pour un fichier disparu est servie, jamais gardée).
 * `ignoreVary` (lot 4) : la copie préchargée par le worker (requête sans en-tête Origin) doit servir la requête de la page
 * (script module `crossorigin`, avec Origin) même si le serveur répond `Vary: Origin` (vite 6 preview le fait). Sans risque :
 * fichiers de même origine, au nom haché, donc immuables.
 */
async function asset(req: Request): Promise<Response> {
  const cached = await caches.match(req, { ignoreVary: true })
  if (cached) return cached
  const res = await fetch(req)
  const path = sitePath(req.url, SCOPE)
  if (path !== null && isKeepableFile(path, fileResponse(res))) {
    const copy = res.clone()
    void caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(() => undefined)
  }
  return res
}

async function pdf(event: FetchEvent): Promise<Response> {
  const req = event.request
  const cache = await caches.open(PDF_CACHE)
  const cached = await cache.match(req.url)
  if (cached) {
    event.waitUntil(refreshPdf(cache, req.url, cached))
    return cached
  }
  // Requête « cors » : la réponse est lisible et sa taille connue. Une réponse opaque n'est jamais gardée (quota inconnu).
  const res = await fetch(req.url, { mode: 'cors', credentials: 'omit', signal: req.signal })
  if (res.status === 200 && res.type === 'cors') event.waitUntil(keepPdf(cache, req.url, res.clone()))
  return res
}

/**
 * Demande d'une page : garder un PDF ouvert dans le lecteur du téléphone (que le worker ne voit pas passer).
 * Seuls les PDF du bucket public sont acceptés ; déjà gardé : rien n'est téléchargé.
 */
sw.addEventListener('message', event => {
  // Page ouverte avant ce worker : sa version est-elle la nôtre ? (bouton RECHARGER, src/hooks/useSwUpdate.ts)
  if (isShellQuery(event.data)) {
    event.ports[0]?.postMessage(__XXB_SW_SHELL__)
    return
  }
  const url = keepRequestUrl(event.data, SCOPE, __XXB_SW_STORAGE__)
  if (!url) return
  event.waitUntil((async () => {
    const cache = await caches.open(PDF_CACHE)
    const kept = await cache.match(url)
    if (kept) return refreshPdf(cache, url, kept)
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (res.status === 200 && res.type === 'cors') await keepPdf(cache, url, res)
  })().catch(err => console.warn('[xxb-sw] PDF non gardé', url, err)))
})

async function keepPdf(cache: Cache, url: string, res: Response): Promise<void> {
  try {
    const announced = declaredSize(res.headers.get('content-length'))
    const fits = await makeRoom(cache, url, announced ?? 0)
    if (!fits) return
    const body = await res.blob()
    if (!(await makeRoom(cache, url, body.size))) return
    const headers = new Headers(res.headers)
    headers.set(CACHED_AT_HEADER, String(Date.now()))
    headers.set(SIZE_HEADER, String(body.size))
    await cache.put(url, new Response(body, { status: 200, statusText: 'OK', headers }))
    const clients = await sw.clients.matchAll({ type: 'window' })
    await keepReader()
    clients.forEach(c => c.postMessage({ type: PDF_CACHED_MESSAGE, url }))
  } catch (err) {
    // Quota du navigateur atteint, téléchargement interrompu : le PDF reste simplement non gardé.
    console.warn('[xxb-sw] PDF non gardé', url, err)
  }
}

/**
 * Évince les plus anciens pour faire entrer `incoming` octets ; faux si le fichier dépasse le plafond à lui seul.
 * L'entrée `url` (remplacée par une version plus récente) n'est pas comptée : elle sera écrasée.
 */
async function makeRoom(cache: Cache, url: string, incoming: number): Promise<boolean> {
  const keys = await cache.keys()
  const entries = await Promise.all(keys.map(async k => {
    const r = await cache.match(k)
    return r ? cachedPdfOf(k.url, r.headers.get(CACHED_AT_HEADER), r.headers.get(SIZE_HEADER)) : null
  }))
  const known = entries.filter((e): e is CachedPdf => e !== null)
  const evict = evictionsFor(known, url, incoming)
  if (evict === null) return false
  await Promise.all(evict.map(u => cache.delete(u)))
  return true
}

/** PDF en cours de revalidation : une seule vérification à la fois par fichier (pdf.js et la page peuvent demander ensemble). */
const refreshing = new Set<string>()

/**
 * L3-6 : PDF gardé, ouvert en ligne. On sert la copie gardée tout de suite et on vérifie en arrière-plan qu'il n'a pas
 * changé (requête HEAD : quelques centaines d'octets, sans pré-vérification CORS). S'il a changé (ETag, Last-Modified ou
 * taille), il est retéléchargé et remplace la copie, dans le plafond. Jamais hors ligne, en 2G ni avec l'économie de données.
 */
async function refreshPdf(cache: Cache, url: string, kept: Response): Promise<void> {
  if (refreshing.has(url) || !sw.navigator.onLine || isCostlyNetwork(sw.navigator.connection)) return
  refreshing.add(url)
  try {
    const head = await fetch(url, { method: 'HEAD', mode: 'cors', credentials: 'omit', cache: 'no-store' })
    if (!head.ok || head.type !== 'cors') return
    if (!pdfChanged(pdfValidators(n => kept.headers.get(n)), pdfValidators(n => head.headers.get(n)))) return
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' })
    if (res.status === 200 && res.type === 'cors') await keepPdf(cache, url, res)
  } catch (err) {
    // Réseau tombé pendant la vérification : la copie gardée reste servie.
    console.warn('[xxb-sw] PDF non revalidé', url, err)
  } finally {
    refreshing.delete(url)
  }
}
