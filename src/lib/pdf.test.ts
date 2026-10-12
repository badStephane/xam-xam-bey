import { describe, expect, test } from 'vitest'
import { MAX_RENDER_SCALE, renderScale } from './pdf'

describe('renderScale', () => {
  test('ajuste la page à la largeur affichée', () => expect(renderScale(300, 600, 1)).toBe(0.5))
  test('tient compte de la densité de l’écran', () => expect(renderScale(300, 600, 2)).toBe(1))
  test('plafonne pour ménager la mémoire des téléphones', () => expect(renderScale(1200, 300, 3)).toBe(MAX_RENDER_SCALE))
  test('valeurs invalides : échelle 1', () => {
    expect(renderScale(0, 600, 2)).toBe(1)
    expect(renderScale(300, 0, 2)).toBe(1)
  })
})
