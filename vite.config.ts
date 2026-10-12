/// <reference types="vitest" />
import { cpSync, createReadStream, existsSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const OUT_DIR = resolve(__dirname, 'site')
const DOCS_DIR = resolve(OUT_DIR, 'f')
const PDFJS_DIR = resolve(__dirname, 'node_modules/pdfjs-dist')
/** Données de pdf.js servies sous /pdfjs/ : polices standard (évite les polices manquantes) et tables CMap. */
const PDFJS_ASSETS = ['standard_fonts', 'cmaps']

/** Les PDF vivent dans site/f (hors bundle) : servis tels quels en dev, conservés au build. */
function siteDocs(): Plugin {
  return {
    name: 'xxb-site-docs',
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
      rmSync(resolve(OUT_DIR, 'assets'), { recursive: true, force: true })
    },
    writeBundle() {
      PDFJS_ASSETS.forEach(dir => cpSync(resolve(PDFJS_DIR, dir), resolve(OUT_DIR, 'pdfjs', dir), { recursive: true }))
    },
  }
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), siteDocs()],
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
    coverage: { include: ['src/lib/**/*.ts'], exclude: ['src/lib/**/*.test.ts', 'src/lib/types.ts', 'src/lib/docs.ts', 'src/lib/storage.ts', 'src/lib/share.ts', 'src/lib/params.ts'] },
  },
})
