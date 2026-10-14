import { describe, expect, test } from 'vitest'
import { LIST_PAGE_SIZE, moreLabel, nextLimit } from './listPage'

describe('pagination « Afficher plus » (Admin > Questions)', () => {
  test('ajoute une page sans dépasser le total', () => {
    expect(nextLimit(LIST_PAGE_SIZE, 665)).toBe(100)
    expect(nextLimit(50, 60)).toBe(60)
    expect(nextLimit(60, 60)).toBe(60)
  })
  test('libellé : une page entière, ou le reste quand il en manque moins', () => {
    expect(moreLabel(50, 665)).toBe('Afficher 50 de plus (615 restantes)')
    expect(moreLabel(50, 60)).toBe('Afficher les 10 dernières')
    expect(moreLabel(50, 51)).toBe('Afficher la dernière')
  })
  test('rien à afficher en plus : libellé vide', () => {
    expect(moreLabel(60, 60)).toBe('')
    expect(moreLabel(80, 60)).toBe('')
  })
})
