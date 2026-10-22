import { describe, expect, it } from 'vitest'
import { parseAdminViews, parseScoutHits, parseScoutProgress } from './adminScout'

const PROGRESS = {
  email: 'amadou@test.sn',
  pseudo: 'LionRapide',
  createdAt: '2026-09-20T10:00:00+00:00',
  lastActive: '2026-10-22T08:00:00+00:00',
  xp: 120,
  weeks: [{ week: '2026-10-19', answers: 3, correct: 2, days: 2 }],
  zones: [{ zone: 1, total: 60, seen: 2, acquired: 1 }],
  sessions: [{ d: 20748, n: 5, ok: 5, l: 'Jour' }],
}

describe('parseScoutHits', () => {
  it('lit les comptes trouvés, avec ou sans pseudo et activité', () => {
    expect(parseScoutHits([
      { user_id: 'u1', email: 'a@test.sn', pseudo: 'Lion', last_active: '2026-10-22T08:00:00+00:00' },
      { user_id: 'u2', email: 'b@test.sn', pseudo: null, last_active: null },
    ])).toEqual([
      { userId: 'u1', email: 'a@test.sn', pseudo: 'Lion', lastActive: '2026-10-22T08:00:00+00:00' },
      { userId: 'u2', email: 'b@test.sn', pseudo: null, lastActive: null },
    ])
  })

  it('écarte une ligne sans identifiant ni e-mail, refuse ce qui n’est pas une liste', () => {
    expect(parseScoutHits([{ email: 'a@test.sn' }, { user_id: 'u3' }])).toEqual([])
    expect(parseScoutHits({})).toBeNull()
  })
})

describe('parseScoutProgress', () => {
  it('lit une fiche complète', () => {
    expect(parseScoutProgress(PROGRESS)).toEqual(PROGRESS)
  })

  it('accepte un compte sans pseudo ni progression', () => {
    expect(parseScoutProgress({ ...PROGRESS, pseudo: null, lastActive: null, xp: 0, zones: [], sessions: [] }))
      .toEqual({ ...PROGRESS, pseudo: null, lastActive: null, xp: 0, zones: [], sessions: [] })
  })

  it('refuse une fiche sans e-mail ou sans ses listes', () => {
    expect(parseScoutProgress({ ...PROGRESS, email: null })).toBeNull()
    expect(parseScoutProgress({ ...PROGRESS, weeks: undefined })).toBeNull()
    expect(parseScoutProgress('fiche')).toBeNull()
  })

  it('écarte les lignes mal formées', () => {
    expect(parseScoutProgress({
      ...PROGRESS,
      weeks: [...PROGRESS.weeks, { week: '2026-10-12', answers: 1, correct: 2, days: 1 }],
      zones: [...PROGRESS.zones, { zone: 2, total: 5, seen: 1, acquired: 3 }],
      sessions: [...PROGRESS.sessions, { d: 'hier', n: 1, ok: 1 }, { d: 20747, n: 4, ok: 9, l: 'Jour' }],
    })).toEqual(PROGRESS)
  })

  it('coupe un libellé de séance trop long', () => {
    expect(parseScoutProgress({ ...PROGRESS, sessions: [{ d: 20748, n: 5, ok: 4, l: 'x'.repeat(200) }] })?.sessions[0].l).toHaveLength(60)
  })

  it('garde une séance sans libellé', () => {
    expect(parseScoutProgress({ ...PROGRESS, sessions: [{ d: 20748, n: 5, ok: 4 }] })?.sessions).toEqual([{ d: 20748, n: 5, ok: 4, l: '' }])
  })
})

describe('parseAdminViews', () => {
  it('lit les fiches ouvertes et les recherches du journal', () => {
    expect(parseAdminViews([
      { viewed_at: '2026-10-22T08:00:00+00:00', admin_email: 'chef@test.sn', target_email: 'a@test.sn', search: null },
      { viewed_at: '2026-10-21T08:00:00+00:00', admin_email: 'chef@test.sn', target_email: null, search: 'gma' },
    ])).toEqual([
      { viewedAt: '2026-10-22T08:00:00+00:00', adminEmail: 'chef@test.sn', targetEmail: 'a@test.sn', search: null },
      { viewedAt: '2026-10-21T08:00:00+00:00', adminEmail: 'chef@test.sn', targetEmail: null, search: 'gma' },
    ])
  })

  it('écarte une entrée sans date, sans admin, ou à la fois fiche et recherche', () => {
    expect(parseAdminViews([
      { viewed_at: null, admin_email: 'chef@test.sn', target_email: 'c@test.sn', search: null },
      { viewed_at: '2026-10-21T08:00:00+00:00', admin_email: null, target_email: 'c@test.sn', search: null },
      { viewed_at: '2026-10-21T08:00:00+00:00', admin_email: 'chef@test.sn', target_email: 'c@test.sn', search: 'gma' },
    ])).toEqual([])
    expect(parseAdminViews(null)).toBeNull()
  })
})
