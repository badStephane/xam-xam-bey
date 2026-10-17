import { describe, expect, test } from 'vitest'
import { finShareText } from './finShare'

const URL = 'https://xam-xam-bey.pages.dev/'

describe('texte de partage du bilan de séance', () => {
  test('score, série et lien d’invitation', () => {
    expect(finShareText({ juste: 12, n: 15, streak: 7, url: URL })).toBe(
      'J’ai répondu juste à 12 questions sur 15 sur Xam Xam Bëy 🔥 7 jours de suite.\nRévise avec moi : https://xam-xam-bey.pages.dev/')
  })
  test('série d’un jour : pas de mention de série', () => {
    expect(finShareText({ juste: 1, n: 1, streak: 1, url: URL })).toBe(
      'J’ai répondu juste à 1 question sur 1 sur Xam Xam Bëy.\nRévise avec moi : https://xam-xam-bey.pages.dev/')
  })
  test('ne contient ni e-mail ni pseudo', () => {
    expect(finShareText({ juste: 3, n: 5, streak: 2, url: URL })).not.toMatch(/@/)
  })
})
