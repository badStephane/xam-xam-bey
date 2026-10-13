/**
 * Test croisé (QA, lot 1) : la RPC save_progress et mergeProgress appliquent-elles les mêmes règles ?
 * Mêmes entrées des deux côtés (ligne existante A, appel B), mêmes sorties attendues (cartes, séances, xp).
 *
 * Nécessite une base locale migrée (`supabase start` puis `supabase db reset --local`) et `psql` :
 *   XXB_PARITY_DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres npx vitest run src/lib/progressParity.test.ts
 * Sans cette variable, le fichier est ignoré (la CI `app` n'a pas de base).
 */
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { mergeProgress } from './progressMerge'
import type { CardProgress, Progress, SessionLog } from './types'

const DB_URL = process.env.XXB_PARITY_DB_URL
const USER_ID = '00000000-0000-0000-0000-0000000000f1'

interface Case { name: string; a: Progress; b: Progress }

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** L1-13 : hors BMP (4 octets UTF-8, paire UTF-16) contre U+FF01 (3 octets UTF-8). */
const EMOJI = '\u{1F600}'
const FULLWIDTH = '\uFF01'

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
const int = (r: () => number, max: number): number => Math.floor(r() * (max + 1))

/** Petits domaines pour provoquer des égalités (vues, échéance, jour, libellés). */
function randomProgress(r: () => number, maxSessions: number): Progress {
  const cards = Array.from({ length: int(r, 6) }).reduce<Record<string, CardProgress>>((acc) => {
    const id = pick(r, ['c1', 'c2', 'c3', 'c4', 'z1-001'])
    return { ...acc, [id]: [int(r, 3), 20700 + int(r, 3), int(r, 3), int(r, 3), 20700 + int(r, 2)] }
  }, {})
  const sessions = Array.from({ length: int(r, maxSessions) }, (): SessionLog => ({
    d: 20700 + int(r, 4), n: pick(r, [9, 10, 12]), ok: int(r, 3), k: pick(r, ['daily', 'theme', 'Zone', 'éval', EMOJI, FULLWIDTH]), l: pick(r, ['x', 'X', 'é', 'Z', EMOJI, FULLWIDTH]),
  }))
  return { cards, sessions, xp: int(r, 50) }
}

function sameDaySessions(n: number, day: number, offset: number): SessionLog[] {
  return Array.from({ length: n }, (_, i) => ({ d: day + Math.floor(i / 3), n: 9 + (i % 3) + offset, ok: i % 2, k: 'daily', l: 'x' }))
}

function buildCases(): Case[] {
  const r = rng(20261013)
  const fixed: Case[] = [
    { name: 'égalité vues et échéance, départage [0]', a: { cards: { c: [1, 5, 2, 0, 0] }, sessions: [], xp: 0 }, b: { cards: { c: [2, 5, 2, 0, 0] }, sessions: [], xp: 0 } },
    { name: 'égalité vues, échéance et [0], départage [3] puis [4]', a: { cards: { c: [1, 5, 2, 1, 9] }, sessions: [], xp: 3 }, b: { cards: { c: [1, 5, 2, 1, 10] }, sessions: [], xp: 2 } },
    { name: 'même jour, n = 9 et n = 10 (ordre numérique vs texte)', a: { cards: {}, sessions: [{ d: 1, n: 10, ok: 1, k: 'daily', l: 'x' }], xp: 0 }, b: { cards: {}, sessions: [{ d: 1, n: 9, ok: 1, k: 'daily', l: 'x' }], xp: 0 } },
    { name: 'même jour, libellés Zone / daily / éval (collation)', a: { cards: {}, sessions: [{ d: 1, n: 9, ok: 1, k: 'Zone', l: 'x' }, { d: 1, n: 9, ok: 1, k: 'éval', l: 'x' }], xp: 0 }, b: { cards: {}, sessions: [{ d: 1, n: 9, ok: 1, k: 'daily', l: 'x' }], xp: 0 } },
    { name: 'même jour, emoji contre U+FF01 dans k et l (octets UTF-8, L1-13)', a: { cards: {}, sessions: [{ d: 1, n: 9, ok: 1, k: EMOJI, l: 'x' }, { d: 1, n: 9, ok: 1, k: 'x', l: EMOJI }], xp: 0 }, b: { cards: {}, sessions: [{ d: 1, n: 9, ok: 1, k: FULLWIDTH, l: 'x' }, { d: 1, n: 9, ok: 1, k: 'x', l: FULLWIDTH }], xp: 0 } },
    { name: 'plus de 200 séances, chevauchement partiel', a: { cards: {}, sessions: sameDaySessions(150, 1000, 0), xp: 0 }, b: { cards: {}, sessions: sameDaySessions(150, 1030, 0), xp: 0 } },
    { name: 'plus de 200 séances, coupure au milieu d’un jour à n = 9/10/11', a: { cards: {}, sessions: sameDaySessions(150, 1000, 0), xp: 0 }, b: { cards: {}, sessions: sameDaySessions(151, 1000, 1), xp: 0 } },
  ]
  const random = Array.from({ length: 300 }, (_, i): Case => ({ name: `aléatoire ${i}`, a: randomProgress(r, i % 10 === 0 ? 200 : 8), b: randomProgress(r, i % 10 === 0 ? 200 : 8) }))
  return [...fixed, ...random]
}

const lit = (v: unknown): string => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`

/** Un seul passage psql : chaque cas dans un point de sauvegarde annulé. */
function runSql(cases: readonly Case[]): Progress[] {
  const body = cases.map(c => [
    'savepoint s;',
    `insert into public.progress (user_id, cards, sessions, xp) values ('${USER_ID}', ${lit(c.a.cards)}, ${lit(c.a.sessions.slice(-200))}, ${c.a.xp});`,
    `select set_config('request.jwt.claims', '{"sub":"${USER_ID}","role":"authenticated"}', true);`,
    'set local role authenticated;',
    `select json_build_object('cards', r.cards, 'sessions', r.sessions, 'xp', r.xp) from public.save_progress(${lit(c.b.cards)}, ${lit(c.b.sessions)}, ${c.b.xp}) r;`,
    'rollback to savepoint s;',
  ].join('\n')).join('\n')
  const script = `begin;\ninsert into auth.users (id, email, email_confirmed_at, aud, role) values ('${USER_ID}', 'parity@test.sn', now(), 'authenticated', 'authenticated');\n${body}\nrollback;\n`
  const out = execFileSync('psql', [DB_URL as string, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: script, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return out.split('\n').filter(l => l.startsWith('{"cards"')).map(l => JSON.parse(l) as Progress)
}

describe.skipIf(!DB_URL)('parité save_progress (SQL) / mergeProgress (TS)', () => {
  const cases = buildCases()
  const sql = DB_URL ? runSql(cases) : []
  // A tient dans la table (≤ 200 séances) : on compare avec ce que le serveur avait réellement.
  const ts = cases.map(c => mergeProgress({ ...c.a, sessions: c.a.sessions.slice(-200) }, c.b))

  it('une réponse SQL par cas', () => expect(sql).toHaveLength(cases.length))

  it('cartes et xp identiques (tous les cas)', () => {
    cases.forEach((c, i) => {
      expect(sql[i].cards, c.name).toEqual(ts[i].cards)
      expect(sql[i].xp, c.name).toBe(ts[i].xp)
    })
  })

  const key = (s: SessionLog): string => JSON.stringify([s.d, s.n, s.ok, s.k, s.l])
  const unionSize = (c: Case): number => new Set([...c.a.sessions.slice(-200), ...c.b.sessions].map(key)).size

  it('séances : mêmes jours, dans le même ordre (contrat : tri par d), tous les cas', () => {
    cases.forEach((c, i) => expect(sql[i].sessions.map(s => s.d), c.name).toEqual(ts[i].sessions.map(s => s.d)))
  })

  it('séances : même ensemble quand l’union tient en 200', () => {
    cases.forEach((c, i) => {
      if (unionSize(c) <= 200) expect(sql[i].sessions.map(key).sort(), c.name).toEqual(ts[i].sessions.map(key).sort())
    })
  })

  // L1-1 et L1-13 : ordre canonique commun (d, n, ok en nombres, puis k, l en octets UTF-8 comme `collate "C"`).
  // Même ordre complet des séances et mêmes séances gardées après la coupure à 200, pour chaque cas.
  it('séances : ordre complet identique, tous les cas (L1-1, L1-13)', () => {
    cases.forEach((c, i) => expect(sql[i].sessions, c.name).toEqual(ts[i].sessions))
  })
})
