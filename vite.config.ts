/// <reference types="vitest/config" />
import { cpSync, createReadStream, existsSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { assertBuildEnv } from './src/lib/buildEnv'
import { serviceWorker } from './src/sw/buildSw'

const OUT_DIR = resolve(__dirname, 'dist')
const DOCS_DIR = resolve(__dirname, 'site', 'f')
const PDFJS_DIR = resolve(__dirname, 'node_modules/pdfjs-dist')
/** Données de pdf.js servies sous /pdfjs/ : polices standard (évite les polices manquantes) et tables CMap. */
const PDFJS_ASSETS = ['standard_fonts', 'cmaps']

/** Les PDF vivent dans site/f (hors bundle) : servis tels quels en dev, conservés au build. */
function siteDocs(): Plugin {
  // Dossier de sortie effectif (--outDir de l'E2E hors ligne) : jamais dist/ par défaut si un autre est demandé.
  let outDir = OUT_DIR
  return {
    name: 'xxb-site-docs',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir) },
    configureServer(server) {
      server.middlewares.use('/f', (req, res, next) => {
        const name = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '')
        if (!/^[\w.-]+\.pdf$/.test(name)) return next()
        const file = resolve(DOCS_DIR, name)
        if (!existsSync(file)) return next()
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Length', String(statSync(file).size))
        createReadStream(file).pipe(res)
      })
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '')
        const [dir, name] = rel.split('/')
        if (!PDFJS_ASSETS.includes(dir) || !name || !/^[\w.-]+$/.test(name)) return next()
        const file = resolve(PDFJS_DIR, dir, name)
        if (!existsSync(file)) return next()
        createReadStream(file).pipe(res)
      })
    },
    buildStart() {
      rmSync(resolve(outDir, 'assets'), { recursive: true, force: true })
    },
    writeBundle() {
      PDFJS_ASSETS.forEach(dir => cpSync(resolve(PDFJS_DIR, dir), resolve(outDir, 'pdfjs', dir), { recursive: true }))
    },
  }
}

export default defineConfig(({ mode }) => {
  // Build de production sans Supabase : échec explicite plutôt qu'un site aux PDF introuvables (contrat §4).
  const env = loadEnv(mode, __dirname, 'VITE_')
  assertBuildEnv(mode, env)
  return {
    base: './',
    publicDir: 'public',
    plugins: [react(), siteDocs(), serviceWorker(env)],
    // Vite 6 passe json.stringify à 'auto' (JSON.parse des gros JSON, clés entre guillemets) : +0,3 Ko gzip sur index.
    // Sortie de Vite 5 gardée pour tenir le budget index ≤ 110 Ko gzip (05-build, « Lot 4 > SRE »).
    json: { stringify: false },
    build: {
      outDir: OUT_DIR,
      emptyOutDir: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
          planches: resolve(__dirname, 'planches.html'),
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      coverage: { include: ['src/lib/**/*.ts', 'src/hooks/**/*.ts'], exclude: ['src/lib/**/*.test.ts', 'src/hooks/**/*.test.ts', 'src/lib/types.ts', 'src/lib/docs.ts', 'src/lib/storage.ts', 'src/lib/share.ts', 'src/lib/params.ts'] },
    },
  }
})
