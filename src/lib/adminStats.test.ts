import { describe, expect, it } from 'vitest'
import { parseAdminStats, successRate, weekLabel } from './adminStats'

const RAW = {
  accounts: 12,
  weeks: [
    { week: '2026-10-12', scouts: 0, answers: 0, correct: 0 },
    { week: '2026-10-19', scouts: 3, answers: 12, correct: 7 },
  ],
  zones: [{ zone: 1, scouts: 2, seen: 3, acquired: 2 }],
  hardest: [{ id: 't1-04', zone: 1, q: 'Question ?', answers: 6, correct: 1 }],
}

describe('parseAdminStats', () => {
  it('lit une réponse complète du serveur', () => {
    expect(parseAdminStats(RAW)).toEqual(RAW)
  })

  it('refuse une réponse qui n’est pas un objet ou sans nombre de comptes', () => {
    expect(parseAdminStats(null)).toBeNull()
    expect(parseAdminStats([])).toBeNull()
    expect(parseAdminStats({ ...RAW, accounts: '12' })).toBeNull()
    expect(parseAdminStats({ ...RAW, accounts: -1 })).toBeNull()
  })

  it('refuse une réponse dont une liste manque', () => {
    expect(parseAdminStats({ ...RAW, weeks: null })).toBeNull()
    expect(parseAdminStats({ accounts: 1, weeks: [], zones: [] })).toBeNull()
  })

  it('écarte les lignes mal formées sans rejeter le reste', () => {
    const parsed = parseAdminStats({
      ...RAW,
      weeks: [...RAW.weeks, { week: 'hier', scouts: 1, answers: 1, correct: 1 }, { week: '2026-10-26', scouts: 1, answers: 1, correct: 2 }],
      zones: [...RAW.zones, { zone: 2, scouts: 1, seen: 1 }],
      hardest: [...RAW.hardest, { id: 't1-05', zone: 1, q: 'Q', answers: 0, correct: 0 }],
    })
    expect(parsed).toEqual(RAW)
  })
})

describe('successRate', () => {
  it('arrondit le pourcentage de réussite', () => {
    expect(successRate(1, 6)).toBe(17)
    expect(successRate(7, 12)).toBe(58)
  })

  it('ne donne pas de taux sans réponse', () => {
    expect(successRate(0, 0)).toBeNull()
  })
})

describe('weekLabel', () => {
  it('affiche le lundi de la semaine comme les autres dates courtes', () => {
    expect(weekLabel('2026-10-19')).toBe('19 octo.')
    expect(weekLabel('2026-09-07')).toBe('7 sept.')
  })
})
