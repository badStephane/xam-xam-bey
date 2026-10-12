import { ACQUIRED_LV, XP_SU } from './constants'
import { seeded, withChoices } from './qcm'
import { mkSession } from './session'
import { xpFor } from './srs'
import type { Card, CardProgress, Grade, Progress, QuizMode, Session } from './types'

/** Jeu de démonstration pour les planches : progression fictive, jamais enregistrée. */
export const DEMO_DAILY = ['t1-06', 't1-18', 't1-01', 't1-24', 't1-09', 't1-30', 't1-02', 't1-12']
const DEMO_XP = 640
const ACTIVE_DAYS = [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1]
const EXAMS: Array<[number, number]> = [[3, 8], [7, 7], [10, 5]]

function demoLevel(i: number): number {
  if (i < 28) return i % 3 === 0 ? 5 : 4
  if (i < 34) return 3
  if (i < 40) return 2
  if (i < 46) return 1
  return -1
}

export function demoProgress(cards: readonly Card[], today: number): Progress {
  const entries = cards.flatMap((c, i): Array<[string, CardProgress]> => {
    const lv = demoLevel(i)
    if (lv < 0) return []
    const due = DEMO_DAILY.includes(c.id) ? today : today + (lv >= ACQUIRED_LV ? 7 : 1)
    return [[c.id, [lv, due, lv + 1, lv, today - 11 + (i % 12)]]]
  })
  const daily = ACTIVE_DAYS.flatMap((on, i) => (on ? [{ d: today - 11 + i, n: 8, ok: 6, k: 'daily', l: 'Session du jour' }] : []))
  const exams = EXAMS.map(([ago, ok]) => ({ d: today - ago, n: 10, ok, k: 'exam', l: 'Mini-examen · Zone 01' }))
  return { cards: Object.fromEntries(entries), sessions: [...daily, ...exams].sort((a, b) => a.d - b.d), xp: DEMO_XP }
}

const resOf = (cards: readonly Card[], g: readonly Grade[]): Record<string, Grade> =>
  Object.fromEntries(cards.map((c, i) => [c.id, g[i]]))
const xpOf = (h: readonly Grade[]): number => h.reduce<number>((a, g) => a + xpFor(g), 0)

const DEMO_SEED = 7

export function demoSession(cards: readonly Card[], mode: QuizMode, phase: string, finished: boolean): { session: Session; checks: Record<number, boolean> } {
  const r = buildDemoSession(cards, mode, phase, finished)
  if (mode === 'ask') return r
  const s = withChoices(r.session, cards, seeded(DEMO_SEED))
  // Phase « réponse » : la bonne proposition a été choisie et validée.
  const picked = s.rev ? s.queue[s.i]?.ch?.correct ?? null : null
  return { ...r, session: { ...s, picked } }
}

function buildDemoSession(cards: readonly Card[], mode: QuizMode, phase: string, finished: boolean): { session: Session; checks: Record<number, boolean> } {
  const byId = new Map(cards.map(c => [c.id, c]))
  const pick = (ids: string[]) => ids.map(id => byId.get(id)).filter((c): c is Card => !!c)
  const daily = pick(DEMO_DAILY)
  if (mode === 'ask') {
    const q = [...daily, ...pick(['t1-03', 't1-05'])]
    const g: Grade[] = [2, 2, 1, 2, 0, 2, 1, 2, 2, 0]
    const n = finished ? q.length : 2
    return { session: mkSession('ask', 'ask', 'Interrogation', q, 'Awa', { i: n, res: resOf(q.slice(0, n), g), hist: g.slice(0, n) }), checks: finished ? {} : { 0: true, 1: true } }
  }
  const g: Grade[] = [2, 2, 2, 0, 2, 2, 0, 2]
  const full = { i: daily.length, res: resOf(daily, g), hist: g, xp: xpOf(g) }
  if (finished) return { session: mkSession('self', 'daily', 'Session du jour', daily, '', full), checks: {} }
  if (phase === 'second') {
    const s = mkSession('self', 'daily', 'Session du jour', daily, '', full)
    return { session: { ...s, queue: [...s.queue, { c: daily[3], second: true }, { c: daily[6], second: true }] }, checks: {} }
  }
  if (phase === 'answer') return { session: mkSession('self', 'daily', 'Session du jour', daily, '', { i: 1, rev: true, res: resOf(daily.slice(0, 1), [2]), hist: [2], xp: XP_SU }), checks: {} }
  return { session: mkSession('self', 'daily', 'Session du jour', daily, '', { i: 3, res: resOf(daily.slice(0, 3), [2, 2, 2]), hist: [2, 2, 2], xp: 3 * XP_SU }), checks: {} }
}
