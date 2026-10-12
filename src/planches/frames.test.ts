import { describe, expect, test } from 'vitest'
import { frameSrc, SECTIONS } from './frames'

describe('planches', () => {
  test('chaque cadre charge l’application en mode démonstration', () => {
    const all = SECTIONS.flatMap(s => s.frames)
    expect(all.length).toBe(47)
    expect(all.every(f => frameSrc(f).startsWith('index.html?frame=1&demo=1&layout='))).toBe(true)
  })
  test('les paramètres supplémentaires sont transmis', () => {
    expect(frameSrc({ label: '', mobile: false, screen: 'session', theme: 'dark', extra: { phase: 'answer' } }))
      .toBe('index.html?frame=1&demo=1&layout=desktop&screen=session&theme=dark&phase=answer')
  })
})
