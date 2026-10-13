/**
 * QA lot 1, L1-4 (documenté, non bloquant) : deux onglets du même compte, hors réseau.
 * useRevision.adopt() écrit l'état en mémoire de l'onglet dans la copie locale, sans relire ni fusionner
 * ce qu'un autre onglet y a mis. Le dernier onglet qui note écrase la copie de l'autre ; si le premier onglet
 * est fermé avant d'avoir pu enregistrer, ses notes sont perdues.
 * Retirer `.fails` quand l'écriture locale fusionne avec la copie existante.
 */
import { describe, expect, it } from 'vitest'
import { mergeProgress } from './progressMerge'
import { readLocalProgress, writeLocalProgress } from './progressSync'
import type { Progress } from './types'

function memoryStore(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>()
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) } }
}

describe('copie locale partagée entre deux onglets (même compte, hors réseau)', () => {
  it('L1-4 : la note de l’onglet 1 survit à une note de l’onglet 2', () => {
    // Arrange : les deux onglets partent du même état serveur.
    const store = memoryStore()
    const start: Progress = { cards: {}, sessions: [], xp: 0 }
    const tab1 = mergeProgress(start, { cards: { c1: [1, 20741, 1, 1, 20740] }, sessions: [], xp: 15 })
    const tab2 = mergeProgress(start, { cards: { c2: [1, 20741, 1, 1, 20740] }, sessions: [], xp: 15 })

    // Act : chaque onglet écrit son état en mémoire (comportement de adopt()), l'onglet 1 est ensuite fermé.
    writeLocalProgress(store, 'u1', tab1)
    writeLocalProgress(store, 'u1', tab2)
    const reopened = readLocalProgress(store, 'u1')

    // Assert : au rechargement, la note c1 devrait être retrouvée pour être renvoyée au serveur.
    expect(Object.keys(reopened.cards).sort()).toEqual(['c1', 'c2'])
  })
})
