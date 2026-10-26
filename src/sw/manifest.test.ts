import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Application installable (UX-37) : critères d'installation de Chrome et d'iOS, vérifiés sur les fichiers livrés
 * (public/ est copié tel quel dans dist/). Une icône manquante ou mal dimensionnée rendrait le site non installable.
 */
const ROOT = resolve(__dirname, '../..')
const PUBLIC = resolve(ROOT, 'public')
const INDEX = readFileSync(resolve(ROOT, 'index.html'), 'utf8')

interface Icon { src: string; sizes: string; type: string; purpose?: string }
interface Manifest {
  id: string; name: string; short_name: string; start_url: string; scope: string; display: string; lang: string
  background_color: string; theme_color: string; icons: Icon[]
}
const manifest = JSON.parse(readFileSync(resolve(PUBLIC, 'manifest.webmanifest'), 'utf8')) as Manifest

/** Largeur et hauteur d'un PNG, lues dans son en-tête IHDR (octets 16 à 23). */
function pngSize(path: string): string {
  const buf = readFileSync(path)
  expect(buf.subarray(1, 4).toString('latin1'), `${path} n'est pas un PNG`).toBe('PNG')
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`
}

const linkHref = (rel: string): string | undefined => new RegExp(`<link rel="${rel}"[^>]*href="([^"]+)"`).exec(INDEX)?.[1]
const publicFile = (href: string): string => resolve(PUBLIC, href.replace(/^\.?\//, ''))

describe('manifeste de l’application installable', () => {
  test('nom, ouverture en plein écran et adresse de départ dans le périmètre du site', () => {
    expect(manifest.name).toBe('Xam Xam Bëy')
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
    expect(manifest.lang).toBe('fr')
    expect(manifest.display).toBe('standalone')
    // Relatifs au manifeste (base './' du build) : le service worker sert « ./ » hors ligne (routeRequest, route « page »).
    expect([manifest.id, manifest.start_url, manifest.scope]).toEqual(['./', './', './'])
  })

  test('icônes 192 et 512 px, plus une icône « maskable », toutes présentes à la bonne taille', () => {
    const any = manifest.icons.filter(i => (i.purpose ?? 'any').split(' ').includes('any')).map(i => i.sizes)
    expect(any).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(manifest.icons.some(i => i.purpose === 'maskable')).toBe(true)
    manifest.icons.forEach(icon => {
      expect(icon.type).toBe('image/png')
      expect(pngSize(publicFile(icon.src)), icon.src).toBe(icon.sizes)
    })
  })

  test('couleurs du mode sombre par défaut, identiques à la balise theme-color de index.html', () => {
    expect(manifest.background_color).toBe('#0D1512')
    expect(manifest.theme_color).toBe(manifest.background_color)
    expect(/<meta name="theme-color" content="([^"]+)"/.exec(INDEX)?.[1]).toBe(manifest.theme_color)
  })

  test('index.html cite le manifeste, le favicon et l’icône iOS, tous livrés dans public/', () => {
    for (const rel of ['manifest', 'icon', 'apple-touch-icon']) {
      const href = linkHref(rel)
      expect(href, `<link rel="${rel}">`).toBeDefined()
      expect(existsSync(publicFile(href!)), href).toBe(true)
    }
    expect(pngSize(publicFile(linkHref('apple-touch-icon')!))).toBe('180x180')
  })
})
