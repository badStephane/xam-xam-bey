import { describe, expect, test } from 'vitest'
import {
  buildVersion, cachedPdfOf, isPageCurrent, isShellQuery, evictionsFor, KEEP_PDF_MESSAGE, keepRequestUrl, cssAssetUrls, declaredSize, htmlAssetUrls, isHashedAsset, isKeepableFile, pageUrl,
  PDF_CACHE, PDF_CACHE_LIMIT, pdfChanged, pdfValidators, pickEvictions, SIZE_HEADER, type PdfValidators,
  readerAssets, resolveRelative, routeRequest, RUNTIME_CACHE, shellCacheName, shellManifest, sitePath, staleAssets, staleCaches,
  type RouteInput, type Scope,
} from './rules'

const SITE: Scope = { origin: 'https://xxb.example', path: '/' }
const STORAGE = 'https://abc.supabase.co'
const get = (url: string, extra: Partial<RouteInput> = {}): RouteInput => ({ url, method: 'GET', mode: 'cors', hasRange: false, ...extra })
const nav = (url: string): RouteInput => get(url, { mode: 'navigate' })
const PDF = `${STORAGE}/storage/v1/object/public/documents/zone-1%2Fbases.pdf`

describe('routeRequest : pages', () => {
  test('la page d’accueil et index.html passent par le cache de secours', () => {
    expect(routeRequest(nav('https://xxb.example/'), SITE, STORAGE)).toBe('page')
    expect(routeRequest(nav('https://xxb.example/index.html'), SITE, STORAGE)).toBe('page')
  })
  test('les paramètres de l’application restent servis hors ligne', () => {
    expect(routeRequest(nav('https://xxb.example/?screen=revision'), SITE, STORAGE)).toBe('page')
    expect(routeRequest(nav('https://xxb.example/?screen=apercu&sel=12&q=camp'), SITE, STORAGE)).toBe('page')
  })
  test('le retour du lien magique passe directement au réseau, jetons compris', () => {
    expect(routeRequest(nav('https://xxb.example/?screen=revision&code=abc123'), SITE, STORAGE)).toBe('network')
    expect(routeRequest(nav('https://xxb.example/?token_hash=t&type=magiclink'), SITE, STORAGE)).toBe('network')
    expect(routeRequest(nav('https://xxb.example/?error=access_denied&error_description=x'), SITE, STORAGE)).toBe('network')
  })
  test('L3-4 : un lien partagé avec des paramètres de suivi reste servi hors ligne', () => {
    expect(routeRequest(nav('https://xxb.example/?fbclid=IwAR0abc'), SITE, STORAGE)).toBe('page')
    expect(routeRequest(nav('https://xxb.example/?screen=revision&gclid=Cj0K'), SITE, STORAGE)).toBe('page')
    expect(routeRequest(nav('https://xxb.example/?utm_source=whatsapp&utm_medium=social&utm_campaign=camp_2026'), SITE, STORAGE)).toBe('page')
    expect(routeRequest(nav('https://xxb.example/index.html?UTM_Source=x&fbclid=y'), SITE, STORAGE)).toBe('page')
  })
  test('L3-4 : paramètres de suivi et retour du lien magique ensemble : toujours le réseau', () => {
    for (const auth of ['code=abc', 'token_hash=t&type=magiclink', 'error=access_denied', 'access_token=x', 'refresh_token=y', 'type=recovery']) {
      expect(routeRequest(nav(`https://xxb.example/?utm_source=whatsapp&${auth}`), SITE, STORAGE)).toBe('network')
      expect(routeRequest(nav(`https://xxb.example/?${auth}&fbclid=z`), SITE, STORAGE)).toBe('network')
    }
  })
  test('L3-4 : un faux paramètre de suivi n’ouvre rien d’autre', () => {
    expect(routeRequest(nav('https://xxb.example/?utm_=x'), SITE, STORAGE)).toBe('network')
    expect(routeRequest(nav('https://xxb.example/?xfbclid=x'), SITE, STORAGE)).toBe('network')
    expect(routeRequest(nav('https://xxb.example/?gclid_code=x'), SITE, STORAGE)).toBe('network')
  })
  test('les autres pages du site (planches) ne sont pas interceptées', () => {
    expect(routeRequest(nav('https://xxb.example/planches.html'), SITE, STORAGE)).toBe('network')
  })
  test('un site publié dans un sous-dossier garde ses règles', () => {
    const sub: Scope = { origin: 'https://xxb.example', path: '/app/' }
    expect(routeRequest(nav('https://xxb.example/app/'), sub, STORAGE)).toBe('page')
    expect(routeRequest(get('https://xxb.example/app/assets/index-1.js'), sub, STORAGE)).toBe('asset')
    expect(routeRequest(nav('https://xxb.example/'), sub, STORAGE)).toBe('network')
    expect(pageUrl(sub)).toBe('https://xxb.example/app/index.html')
  })
})

describe('routeRequest : fichiers et API', () => {
  test('fichiers hachés et données de pdf.js : cache d’abord', () => {
    expect(routeRequest(get('https://xxb.example/assets/index-DknuMg_5.js'), SITE, STORAGE)).toBe('asset')
    expect(routeRequest(get('https://xxb.example/pdfjs/cmaps/UniJIS-UCS2-H.bcmap'), SITE, STORAGE)).toBe('asset')
  })
  test('autres fichiers du site (modèle Excel, sw.js) : réseau', () => {
    expect(routeRequest(get('https://xxb.example/modele-questions.xlsx'), SITE, STORAGE)).toBe('network')
    expect(routeRequest(get('https://xxb.example/sw.js'), SITE, STORAGE)).toBe('network')
  })
  test('PDF du bucket public : gardé', () => expect(routeRequest(get(PDF), SITE, STORAGE)).toBe('pdf'))
  test('jamais l’API REST, l’Auth, le Realtime ni les fonctions de Supabase', () => {
    for (const p of ['/rest/v1/documents?select=*', '/auth/v1/token?grant_type=refresh_token', '/auth/v1/user', '/realtime/v1/websocket', '/functions/v1/x']) {
      expect(routeRequest(get(`${STORAGE}${p}`), SITE, STORAGE)).toBe('network')
    }
  })
  test('ni les autres buckets, ni le lien Télécharger, ni les lectures partielles', () => {
    expect(routeRequest(get(`${STORAGE}/storage/v1/object/public/avatars/a.png`), SITE, STORAGE)).toBe('network')
    expect(routeRequest(get(`${PDF}?download=Bases.pdf`), SITE, STORAGE)).toBe('network')
    expect(routeRequest(get(PDF, { hasRange: true }), SITE, STORAGE)).toBe('network')
    expect(routeRequest(nav(PDF), SITE, STORAGE)).toBe('network')
  })
  test('autre origine, méthode d’écriture ou adresse invalide : réseau', () => {
    expect(routeRequest(get('https://evil.supabase.co/storage/v1/object/public/documents/a.pdf'), SITE, STORAGE)).toBe('network')
    expect(routeRequest(get(PDF, { method: 'POST' }), SITE, STORAGE)).toBe('network')
    expect(routeRequest(get('https://xxb.example/assets/a.js', { method: 'HEAD' }), SITE, STORAGE)).toBe('network')
    expect(routeRequest(get('pas une adresse'), SITE, STORAGE)).toBe('network')
  })
  test('sans stockage configuré, aucun PDF n’est gardé', () => expect(routeRequest(get(PDF), SITE, null)).toBe('network'))
})

describe('pickEvictions', () => {
  const MB = 1024 * 1024
  const entries = [
    { url: 'b', size: 60 * MB, cachedAt: 2 },
    { url: 'a', size: 50 * MB, cachedAt: 1 },
    { url: 'c', size: 30 * MB, cachedAt: 3 },
  ]
  test('rien à retirer sous le plafond', () => expect(pickEvictions(entries, 10 * MB)).toEqual([]))
  test('retire les plus anciens jusqu’à faire de la place', () => {
    expect(pickEvictions(entries, 20 * MB)).toEqual(['a'])
    expect(pickEvictions(entries, 100 * MB)).toEqual(['a', 'b'])
  })
  test('juste au plafond : rien à retirer', () => expect(pickEvictions(entries, PDF_CACHE_LIMIT - 140 * MB)).toEqual([]))
  test('un fichier plus gros que le plafond n’est jamais gardé', () => expect(pickEvictions([], PDF_CACHE_LIMIT + 1)).toBeNull())
  test('n’altère pas la liste reçue', () => {
    const copy = entries.map(e => ({ ...e }))
    pickEvictions(entries, 100 * MB)
    expect(entries).toEqual(copy)
  })
})

describe('tailles et entrées gardées', () => {
  test('declaredSize', () => {
    expect(declaredSize('1234')).toBe(1234)
    expect(declaredSize(' 99 ')).toBe(99)
    expect(declaredSize(null)).toBeNull()
    expect(declaredSize('-1')).toBeNull()
    expect(declaredSize('12abc')).toBeNull()
  })
  test('cachedPdfOf lit les en-têtes du worker et ignore le reste', () => {
    expect(cachedPdfOf('u', '1700', '42')).toEqual({ url: 'u', size: 42, cachedAt: 1700 })
    expect(cachedPdfOf('u', null, '42')).toBeNull()
    expect(cachedPdfOf('u', '1700', 'x')).toBeNull()
    expect(cachedPdfOf('u', '1700', '-3')).toBeNull()
  })
})

describe('mise à jour des caches', () => {
  test('staleCaches purge les coquilles des autres versions et les caches xxb-* inconnus ; garde PDF, exécution et caches étrangers', () => {
    const names = [shellCacheName('v1'), shellCacheName('v2'), RUNTIME_CACHE, PDF_CACHE, 'xxb-rt-ancien', 'autre-site']
    expect(staleCaches(names, 'v2')).toEqual([shellCacheName('v1'), 'xxb-rt-ancien'])
  })
  test('staleAssets : retire les fichiers hachés disparus du build, garde ceux qui n’ont pas changé et pdfjs/', () => {
    const cached = ['assets/pdf.min-A.js', 'assets/PdfViewer-old.js', 'pdfjs/cmaps/x.bcmap']
    expect(staleAssets(cached, ['assets/pdf.min-A.js', 'assets/PdfViewer-new.js'])).toEqual(['assets/PdfViewer-old.js'])
  })
  test('readerAssets : pdf.js, son worker et le lecteur, rien d’autre', () => {
    const all = ['assets/pdf.min-VbSDxkHg.js', 'assets/pdf.worker.min-rsCePomN.mjs', 'assets/pdf.worker.min-7WEkucD6.js', 'assets/PdfViewer-D2NrPHCY.js',
      'assets/CardsImport-x.js', 'assets/index-a.js', 'assets/pdf.min-a.js.map']
    expect(readerAssets(all)).toEqual(all.slice(0, 4))
  })
  test('isHashedAsset et sitePath', () => {
    expect(isHashedAsset('assets/a-1.js')).toBe(true)
    expect(isHashedAsset('index.html')).toBe(false)
    expect(sitePath('https://xxb.example/assets/a.js', SITE)).toBe('assets/a.js')
    expect(sitePath('https://autre.example/assets/a.js', SITE)).toBeNull()
    expect(sitePath('n’importe quoi', SITE)).toBeNull()
  })
})

const HTML = `<!DOCTYPE html><html><head>
<link rel="preload" href="./assets/chakra-petch-latin-700-normal-AbC.woff2" as="font" type="font/woff2" crossorigin>
  <script type="module" crossorigin src="./assets/index-DknuMg_5.js"></script>
  <link rel="modulepreload" crossorigin href="./assets/client-C9yhCDaK.js">
  <link rel="stylesheet" crossorigin href="./assets/index-BbDwp0dL.css">
  <link rel="icon" href="data:,">
  <script src="https://cdn.example/x.js"></script>
</head><body><div id="root"></div></body></html>`
const CSS = '@font-face{src:url(./chakra-petch-latin-700-normal-AbC.woff2) format("woff2")}' +
  '@font-face{src:url("./jetbrains-mono-latin-wght-normal-Xy.woff2")}.a{background:url(data:image/png;base64,AAAA)}'

describe('manifeste de la coquille', () => {
  test('htmlAssetUrls ne garde que les fichiers du site', () => {
    expect(htmlAssetUrls(HTML)).toEqual([
      './assets/chakra-petch-latin-700-normal-AbC.woff2', './assets/index-DknuMg_5.js', './assets/client-C9yhCDaK.js', './assets/index-BbDwp0dL.css',
    ])
  })
  test('htmlAssetUrls ignore le manifeste et les icônes de l’application installée (jamais servis hors ligne par le worker)', () => {
    const head = '<link rel="manifest" href="./manifest.webmanifest"><link rel="icon" type="image/png" href="./icons/favicon-32.png">' +
      '<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png"><link href="./assets/a-1.css" rel="stylesheet">'
    expect(htmlAssetUrls(head)).toEqual(['./assets/a-1.css'])
  })
  test('cssAssetUrls ignore les données intégrées', () => {
    expect(cssAssetUrls(CSS)).toEqual(['./chakra-petch-latin-700-normal-AbC.woff2', './jetbrains-mono-latin-wght-normal-Xy.woff2'])
  })
  test('resolveRelative', () => {
    expect(resolveRelative('', './assets/a.js')).toBe('assets/a.js')
    expect(resolveRelative('assets/', './f.woff2')).toBe('assets/f.woff2')
    expect(resolveRelative('assets/', '../fonts/f.woff2')).toBe('fonts/f.woff2')
    expect(resolveRelative('assets/', '/pdfjs/x')).toBe('pdfjs/x')
  })
  test('shellManifest : index.html, scripts, styles et polices, sans doublon, triés', () => {
    const read = (p: string): string | null => (p === 'assets/index-BbDwp0dL.css' ? CSS : null)
    expect(shellManifest(HTML, read)).toEqual([
      'index.html',
      'assets/chakra-petch-latin-700-normal-AbC.woff2',
      'assets/client-C9yhCDaK.js',
      'assets/index-BbDwp0dL.css',
      'assets/index-DknuMg_5.js',
      'assets/jetbrains-mono-latin-wght-normal-Xy.woff2',
    ])
  })
  test('pdf.js et les écrans chargés à la demande ne sont pas préchargés', () => {
    expect(shellManifest(HTML, () => CSS).some(p => p.includes('pdf'))).toBe(false)
  })
})

describe('buildVersion', () => {
  test('stable pour un même build, différente au moindre changement', () => {
    expect(buildVersion(['a', 'b'])).toBe(buildVersion(['a', 'b']))
    expect(buildVersion(['a', 'b'])).not.toBe(buildVersion(['a', 'c']))
    expect(buildVersion(['ab'])).not.toBe(buildVersion(['a', 'b']))
    expect(buildVersion(['x'])).toMatch(/^[0-9a-z]+$/)
  })
})

describe('keepRequestUrl', () => {
  test('demande valide pour un PDF du bucket public', () => {
    expect(keepRequestUrl({ type: KEEP_PDF_MESSAGE, url: PDF }, SITE, STORAGE)).toBe(PDF)
  })
  test('refuse tout le reste : autre type, API, autre origine, message mal formé', () => {
    expect(keepRequestUrl({ type: 'autre', url: PDF }, SITE, STORAGE)).toBeNull()
    expect(keepRequestUrl({ type: KEEP_PDF_MESSAGE, url: `${STORAGE}/rest/v1/documents` }, SITE, STORAGE)).toBeNull()
    expect(keepRequestUrl({ type: KEEP_PDF_MESSAGE, url: 'https://evil.example/a.pdf' }, SITE, STORAGE)).toBeNull()
    expect(keepRequestUrl({ type: KEEP_PDF_MESSAGE, url: 42 }, SITE, STORAGE)).toBeNull()
    expect(keepRequestUrl(null, SITE, STORAGE)).toBeNull()
    expect(keepRequestUrl('xxb-keep-pdf', SITE, STORAGE)).toBeNull()
  })
})

describe('isKeepableFile (L3-3)', () => {
  const ok = (contentType: string | null) => ({ ok: true, type: 'basic', contentType })
  test('scripts, styles, polices et page : gardés avec le type attendu', () => {
    expect(isKeepableFile('assets/index-a.js', ok('application/javascript; charset=utf-8'))).toBe(true)
    expect(isKeepableFile('assets/index-a.js', ok('text/javascript'))).toBe(true)
    expect(isKeepableFile('assets/pdf.worker.min-b.mjs', ok('text/javascript'))).toBe(true)
    expect(isKeepableFile('assets/index-c.css', ok('text/css; charset=utf-8'))).toBe(true)
    expect(isKeepableFile('assets/chakra-d.woff2', ok('font/woff2'))).toBe(true)
    expect(isKeepableFile('index.html', ok('text/html; charset=utf-8'))).toBe(true)
  })
  test('page HTML de repli de Pages pour un fichier haché disparu : jamais gardée', () => {
    for (const path of ['assets/PdfViewer-old.js', 'assets/x.mjs', 'assets/index-old.css', 'assets/f.woff2', 'pdfjs/cmaps/UniJIS-UCS2-H.bcmap', 'assets/sans-extension']) {
      expect(isKeepableFile(path, ok('text/html; charset=utf-8'))).toBe(false)
      expect(isKeepableFile(path, ok('TEXT/HTML'))).toBe(false)
    }
  })
  test('type incohérent ou absent pour un script, un style, une police : refusé', () => {
    expect(isKeepableFile('assets/a.js', ok('text/plain'))).toBe(false)
    expect(isKeepableFile('assets/a.js', ok(null))).toBe(false)
    expect(isKeepableFile('assets/a.css', ok('application/javascript'))).toBe(false)
    expect(isKeepableFile('assets/a.woff2', ok('text/css'))).toBe(false)
    expect(isKeepableFile('index.html', ok('application/javascript'))).toBe(false)
  })
  test('réponse en échec ou d’une autre origine : refusée', () => {
    expect(isKeepableFile('assets/a.js', { ok: false, type: 'basic', contentType: 'text/javascript' })).toBe(false)
    expect(isKeepableFile('assets/a.js', { ok: true, type: 'cors', contentType: 'text/javascript' })).toBe(false)
    expect(isKeepableFile('assets/a.js', { ok: true, type: 'opaque', contentType: null })).toBe(false)
  })
  test('données de pdf.js (extensions sans type imposé) : gardées si ce n’est pas du HTML', () => {
    expect(isKeepableFile('pdfjs/cmaps/UniJIS-UCS2-H.bcmap', ok('application/octet-stream'))).toBe(true)
    expect(isKeepableFile('pdfjs/standard_fonts/FoxitSans.pfb', ok(null))).toBe(true)
  })
})

describe('revalidation des PDF gardés (L3-6)', () => {
  const v = (o: Partial<PdfValidators>): PdfValidators => ({ etag: null, lastModified: null, size: null, ...o })
  const headers = (h: Record<string, string>) => (name: string): string | null => h[name] ?? null
  test('pdfValidators lit ETag (faible ou fort), Last-Modified, et la taille réelle avant Content-Length', () => {
    expect(pdfValidators(headers({ etag: 'W/"abc"', 'last-modified': 'Tue, 13 Oct 2026 10:00:00 GMT', [SIZE_HEADER]: '42', 'content-length': '40' })))
      .toEqual({ etag: '"abc"', lastModified: 'Tue, 13 Oct 2026 10:00:00 GMT', size: 42 })
    expect(pdfValidators(headers({ 'content-length': '40' }))).toEqual({ etag: null, lastModified: null, size: 40 })
    expect(pdfValidators(headers({}))).toEqual({ etag: null, lastModified: null, size: null })
  })
  test('ETag prioritaire quand les deux côtés en ont un', () => {
    expect(pdfChanged(v({ etag: '"a"', size: 1 }), v({ etag: '"a"', size: 2 }))).toBe(false)
    expect(pdfChanged(v({ etag: '"a"' }), v({ etag: '"b"' }))).toBe(true)
  })
  test('sinon Last-Modified (cas d’une réponse cors qui n’expose pas l’ETag)', () => {
    const t1 = 'Tue, 13 Oct 2026 10:00:00 GMT'
    expect(pdfChanged(v({ lastModified: t1, size: 10 }), v({ etag: '"x"', lastModified: t1, size: 10 }))).toBe(false)
    expect(pdfChanged(v({ lastModified: t1, size: 10 }), v({ lastModified: 'Wed, 14 Oct 2026 08:00:00 GMT', size: 10 }))).toBe(true)
  })
  test('sinon la taille ; sans repère comparable, inchangé (aucun téléchargement à l’aveugle)', () => {
    expect(pdfChanged(v({ size: 10 }), v({ size: 11 }))).toBe(true)
    expect(pdfChanged(v({ size: 10 }), v({ size: 10 }))).toBe(false)
    expect(pdfChanged(v({}), v({ size: 10 }))).toBe(false)
    expect(pdfChanged(v({ etag: '"a"' }), v({ lastModified: 'x' }))).toBe(false)
  })
  test('evictionsFor : remplacer une entrée ne la compte pas deux fois et ne l’évince jamais ; plafond tenu', () => {
    const MB = 1024 * 1024
    const entries = [{ url: 'a', size: 100 * MB, cachedAt: 1 }, { url: 'b', size: 40 * MB, cachedAt: 2 }]
    expect(pickEvictions(entries, 45 * MB)).toEqual(['a'])
    expect(evictionsFor(entries, 'b', 45 * MB)).toEqual([])
    expect(evictionsFor(entries, 'b', 60 * MB)).toEqual(['a'])
    expect(evictionsFor(entries, 'b', PDF_CACHE_LIMIT + 1)).toBeNull()
  })
})

describe('écrans préchargés hors ligne (lot 5)', () => {
  test('morceau Gamification et ses imports, hors coquille', async () => {
    const { offlineScreenAssets } = await import('./rules')
    const chunks = [
      { fileName: 'assets/index-a.js', facadeModuleId: '/r/index.html', imports: ['assets/client-b.js'] },
      { fileName: 'assets/client-b.js', facadeModuleId: null, imports: [] },
      { fileName: 'assets/Gamification-c.js', facadeModuleId: '/r/src/components/league/Gamification.tsx', imports: ['assets/index-a.js', 'assets/leagueApi-d.js'] },
      { fileName: 'assets/leagueApi-d.js', facadeModuleId: null, imports: ['assets/index-a.js'] },
      { fileName: 'assets/PseudosAdmin-e.js', facadeModuleId: '/r/src/components/admin/PseudosAdmin.tsx', imports: ['assets/leagueApi-d.js'] },
    ]
    expect(offlineScreenAssets(chunks, ['index.html', 'assets/index-a.js', 'assets/client-b.js'])).toEqual(['assets/Gamification-c.js', 'assets/leagueApi-d.js'])
  })
})

describe('version de la page affichée (bouton RECHARGER)', () => {
  const SHELL = ['index.html', 'assets/index-B2.css', 'assets/index-B2.js']
  test('scripts et styles de la page dans la coquille du worker : page à jour, rien à proposer', () => {
    expect(isPageCurrent(['assets/index-B2.js', 'assets/index-B2.css'], SHELL)).toBe(true)
  })
  test('un seul fichier d’une autre version (script ou style) : page périmée', () => {
    expect(isPageCurrent(['assets/index-A1.js', 'assets/index-B2.css'], SHELL)).toBe(false)
    expect(isPageCurrent(['assets/index-B2.js', 'assets/index-A1.css'], SHELL)).toBe(false)
  })
  test('page sans fichier reconnu : tenue pour périmée (mieux vaut proposer de recharger)', () => {
    expect(isPageCurrent([], SHELL)).toBe(false)
  })
  test('isShellQuery : seule la demande de la page, rien d’autre', () => {
    expect(isShellQuery({ type: 'xxb-shell?' })).toBe(true)
    expect(isShellQuery({ type: 'xxb-keep-pdf', url: 'x' })).toBe(false)
    expect(isShellQuery('xxb-shell?')).toBe(false)
    expect(isShellQuery(null)).toBe(false)
  })
})
