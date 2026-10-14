import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import type { Plugin, ResolvedConfig, Rollup } from 'vite'
import { buildVersion, CACHE_PREFIX, offlineScreenAssets, shellManifest, type BuiltChunk } from './rules'

/**
 * Plugin Vite (lot 3, E3) : après l'écriture du build, génère dist/sw.js.
 *  - lit dist/index.html et ses feuilles de style pour dresser le manifeste de la coquille ;
 *  - liste les fichiers hachés du build (assets/), pour purger les disparus et précharger le lecteur PDF ;
 *  - calcule la version (empreinte de index.html, du manifeste et de la liste) qui nomme la coquille ;
 *  - compile src/sw/sw.ts avec esbuild (déjà livré avec Vite) en un script classique, sans import.
 * Avec VITE_SW=off, sw.js devient un worker de secours qui purge les caches du site et se désinscrit (05-build, lot 3).
 */
export function serviceWorker(env: Record<string, string>): Plugin {
  let config: ResolvedConfig
  return {
    name: 'xxb-service-worker',
    apply: 'build',
    configResolved(c) { config = c },
    async writeBundle(_options, bundle: Rollup.OutputBundle) {
      const outDir = resolve(config.root, config.build.outDir)
      const target = resolve(outDir, 'sw.js')
      if (env.VITE_SW === 'off') {
        writeFileSync(target, killSwitch())
        return
      }
      const html = readFileSync(resolve(outDir, 'index.html'), 'utf8')
      const shell = shellManifest(html, path => readFileSync(resolve(outDir, path), 'utf8'))
      const assets = readdirSync(resolve(outDir, 'assets')).filter(n => !n.endsWith('.map')).map(n => `assets/${n}`).sort()
      const chunks: BuiltChunk[] = Object.values(bundle).flatMap(o => (o.type === 'chunk' ? [{ fileName: o.fileName, facadeModuleId: o.facadeModuleId, imports: o.imports }] : []))
      // Lot 5 : Ligue et Badges disponibles hors ligne sans visite préalable (préchargés, tolérés s'ils échouent).
      const precache = offlineScreenAssets(chunks, shell)
      const version = buildVersion([html, ...shell, ...assets])
      const storage = storageOrigin(env.VITE_SUPABASE_URL)
      await build({
        entryPoints: [resolve(config.root, 'src/sw/sw.ts')],
        outfile: target,
        bundle: true,
        format: 'iife',
        target: 'es2020',
        minify: true,
        legalComments: 'none',
        define: {
          __XXB_SW_VERSION__: JSON.stringify(version),
          __XXB_SW_SHELL__: JSON.stringify(shell),
          __XXB_SW_ASSETS__: JSON.stringify(assets),
          __XXB_SW_PRECACHE__: JSON.stringify(precache),
          __XXB_SW_STORAGE__: JSON.stringify(storage),
        },
        logLevel: 'warning',
      })
      config.logger.info(`[xxb] sw.js : version ${version}, coquille de ${shell.length} fichiers, ${precache.length} écran(s) préchargé(s), PDF de ${storage ?? '(aucun stockage)'}`)
    },
  }
}

/** Origine du projet Supabase (là où vivent les PDF), ou null sans configuration valide. */
export function storageOrigin(url: string | undefined): string | null {
  try {
    return url ? new URL(url.trim()).origin : null
  } catch {
    return null
  }
}

/** Worker de secours : purge les caches du site, se désinscrit et recharge les onglets ouverts sans lui. */
export function killSwitch(): string {
  return `// Worker de secours (VITE_SW=off) : purge les caches ${CACHE_PREFIX}*, se désinscrit, recharge les onglets.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ns => Promise.all(ns.filter(n => n.startsWith('${CACHE_PREFIX}')).map(n => caches.delete(n))))
  .then(() => self.registration.unregister())
  .then(() => self.clients.matchAll({ type: 'window' }))
  .then(cs => cs.forEach(c => c.navigate(c.url)))));
`
}
