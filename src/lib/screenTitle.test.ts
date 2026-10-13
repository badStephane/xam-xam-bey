import { describe, expect, test } from 'vitest'
import { SCREENS } from './params'
import { screenTitle } from './screenTitle'

describe('titre du document par écran (UX-13)', () => {
  test('chaque écran a son propre titre suivi du nom du site', () => {
    const titles = SCREENS.map(s => screenTitle(s))
    expect(new Set(titles).size).toBe(SCREENS.length)
    titles.forEach(t => expect(t).toMatch(/^.+ · Xam Xam Bëy$/))
    expect(screenTitle('plan')).toBe('Plan annuel · Xam Xam Bëy')
  })

  test('l’aperçu prend le titre du document ouvert', () => {
    expect(screenTitle('apercu', ' Statuts du district ')).toBe('Statuts du district · Xam Xam Bëy')
    expect(screenTitle('apercu', null)).toBe('Aperçu · Xam Xam Bëy')
    expect(screenTitle('apercu', '  ')).toBe('Aperçu · Xam Xam Bëy')
    expect(screenTitle('plan', 'Ignoré')).toBe('Plan annuel · Xam Xam Bëy')
  })
})
