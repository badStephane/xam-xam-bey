// Icônes de l'application installée (PWA) : le logo « XXB » de l'en-tête (cadre et lettres lime sur fond carte sombre),
// rendu par le Chromium de Playwright (déjà en devDependency) avec la police du site. Aucune dépendance ajoutée.
// Lancement : `node scripts/make-icons.mjs` ; les PNG écrits dans public/icons/ sont commités (jamais régénérés au build).
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT_DIR = resolve(ROOT, 'public/icons')
const FONT = readFileSync(resolve(ROOT, 'src/assets/fonts/chakra-petch-latin-700-normal.woff2')).toString('base64')
/** Couleurs du mode sombre (src/styles/app.css, [data-xt=dark]) : --bg et --acc. */
const BG = '#0D1512'
const ACC = '#C8F169'

/**
 * `inset` : part du côté laissée libre autour du cadre. Icône « any » : cadre presque bord à bord ;
 * « maskable » : contenu dans la zone sûre (cercle de 80 % du côté), le fond déborde jusqu'au bord.
 */
const ICONS = [
  { file: 'icon-192.png', size: 192, inset: 0.12 },
  { file: 'icon-512.png', size: 512, inset: 0.12 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.24 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.16 },
  { file: 'favicon-32.png', size: 32, inset: 0.04 },
]

function svg({ size, inset }) {
  const pad = size * inset
  const side = size - 2 * pad
  const stroke = Math.max(2, side * 0.045)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <rect x="${pad + stroke / 2}" y="${pad + stroke / 2}" width="${side - stroke}" height="${side - stroke}" fill="none" stroke="${ACC}" stroke-width="${stroke}"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="${ACC}" font-family="Chakra Petch" font-weight="700"
    font-size="${side * 0.36}" letter-spacing="${side * 0.01}">XXB</text>
</svg>`
}

const page = (icon) => `<!DOCTYPE html><html><head><style>
@font-face{font-family:'Chakra Petch';font-weight:700;src:url(data:font/woff2;base64,${FONT}) format('woff2')}
html,body{margin:0;background:${BG}}svg{display:block}
</style></head><body>${svg(icon)}</body></html>`

mkdirSync(OUT_DIR, { recursive: true })
const browser = await chromium.launch()
try {
  for (const icon of ICONS) {
    const tab = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
    await tab.setContent(page(icon))
    await tab.evaluate(() => document.fonts.ready)
    await tab.locator('svg').screenshot({ path: resolve(OUT_DIR, icon.file) })
    await tab.close()
    console.log(`public/icons/${icon.file} (${icon.size} px)`)
  }
} finally {
  await browser.close()
}
