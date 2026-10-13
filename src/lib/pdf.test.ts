import { describe, expect, test } from 'vitest'
import { LOW_MEMORY_RENDER_SCALE, MAX_RENDER_SCALE, maxRenderScale, renderScale, transferOptions } from './pdf'

describe('renderScale', () => {
  test('ajuste la page à la largeur affichée', () => expect(renderScale(300, 600, 1)).toBe(0.5))
  test('tient compte de la densité de l’écran', () => expect(renderScale(300, 600, 2)).toBe(1))
  test('plafonne pour ménager la mémoire des téléphones', () => expect(renderScale(1200, 300, 3)).toBe(MAX_RENDER_SCALE))
  test('plafond abaissé fourni par l’appelant', () => expect(renderScale(1200, 300, 3, LOW_MEMORY_RENDER_SCALE)).toBe(LOW_MEMORY_RENDER_SCALE))
  test('valeurs invalides : échelle 1', () => {
    expect(renderScale(0, 600, 2)).toBe(1)
    expect(renderScale(300, 0, 2)).toBe(1)
  })
})

describe('maxRenderScale', () => {
  test('téléphone de 2 Go ou moins : plafond abaissé', () => {
    expect(maxRenderScale(2)).toBe(LOW_MEMORY_RENDER_SCALE)
    expect(maxRenderScale(0.5)).toBe(LOW_MEMORY_RENDER_SCALE)
  })
  test('plus de mémoire, ou mémoire inconnue (hors Chrome) : plafond normal', () => {
    expect(maxRenderScale(4)).toBe(MAX_RENDER_SCALE)
    expect(maxRenderScale(undefined)).toBe(MAX_RENDER_SCALE)
    expect(maxRenderScale(0)).toBe(MAX_RENDER_SCALE)
  })
})

describe('transferOptions', () => {
  test('service worker actif : un seul téléchargement complet, que le cache peut garder', () => {
    expect(transferOptions({ keptOffline: true })).toEqual({ disableRange: true })
    expect(transferOptions({ keptOffline: true, thumbnail: true })).toEqual({ disableRange: true })
  })
  test('vignette sans service worker : seulement les parties utiles (FE-7)', () => {
    expect(transferOptions({ thumbnail: true })).toEqual({ disableAutoFetch: true, disableStream: true })
  })
  test('lecteur complet sans service worker : réglages par défaut de pdf.js', () => expect(transferOptions({})).toEqual({}))
})
