import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ASK_COUNTS } from './lib/constants'
import { demoProgress, demoSession } from './lib/demo'
import { currentZone, dayNum } from './lib/format'
import { isRevScreen, PARAMS, type Screen } from './lib/params'
import { gradeOf, withChoices } from './lib/qcm'
import { answerCard, isLogged, mkSession } from './lib/session'
import { allCards } from './lib/srs'
import { loadPref, savePref } from './lib/storage'
import type { Scope } from './lib/practice'
import type { Card, Grade, QuizMode, Session, TypeFilter } from './lib/types'
import { useRevision, type Revision } from './hooks/useRevision'
import { useIsMobile, useOnline } from './hooks/useViewport'

export interface Ui {
  screen: Screen
  dark: boolean
  q: string
  type: TypeFilter
  ess: boolean
  month: number | null
  sel: number | null
  fiche: number
  /** Zone d'entraînement : 1 à 12, ou 0 pour toutes les zones. */
  practice: number
  scope: Scope
  mode: QuizMode
  askName: string
  askCount: number
  session: Session | null
  checks: Record<number, boolean>
  hideAns: boolean
  shared: boolean
  seen: number[]
}

interface AppValue {
  ui: Ui
  rev: Revision
  today: number
  cur: number
  now: Date
  mobile: boolean
  offline: boolean
  patch(p: Partial<Ui>): void
  go(screen: Screen, p?: Partial<Ui>): void
  openDoc(id: number): void
  toggleTheme(): void
  startSession(mode: QuizMode, kind: string, label: string, cards: readonly Card[]): void
  reveal(): void
  answer(g: Grade): void
  pick(i: number): void
  validate(): void
  next(): void
  quitSession(): void
}

const Ctx = createContext<AppValue | null>(null)
export function useApp(): AppValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp doit être utilisé dans <AppProvider>')
  return v
}

function initialDark(): boolean {
  const t = PARAMS.theme || (PARAMS.frame ? null : loadPref<string | null>('theme', null))
  if (t === 'dark' || t === 'light') return t === 'dark'
  return !window.matchMedia?.('(prefers-color-scheme: light)').matches
}

export function AppProvider({ children }: { children: ReactNode }) {
  const now = useMemo(() => new Date(), [])
  const today = dayNum(now)
  const cur = currentZone(now)
  const [ui, setUi] = useState<Ui>(() => ({
    screen: PARAMS.screen || (location.hash === '#revision' ? 'revision' : 'bibliotheque'),
    dark: initialDark(), q: PARAMS.q, type: 'all', ess: false, month: null, sel: PARAMS.sel,
    fiche: cur, practice: cur, scope: 'all', mode: PARAMS.mode, askName: '', askCount: ASK_COUNTS[0],
    session: null, checks: {}, hideAns: false, shared: false, seen: loadPref<number[]>('seen', []),
  }))
  const rev = useRevision(PARAMS.demo)
  const mobile = useIsMobile()
  const online = useOnline()
  const uiRef = useRef(ui)
  uiRef.current = ui

  const patch = useCallback((p: Partial<Ui>) => setUi(u => ({ ...u, ...p })), [])
  const go = useCallback((screen: Screen, p: Partial<Ui> = {}) => {
    setUi(u => ({ ...u, screen, shared: false, ...p }))
    window.scrollTo(0, 0)
    if (isRevScreen(screen)) rev.init()
  }, [rev])

  useEffect(() => { rev.init() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Planches : une fois les cartes d'exemple chargées, on installe la progression et la session de démonstration.
  const demoApplied = useRef(false)
  useEffect(() => {
    if (!PARAMS.demo || rev.status !== 'ready' || demoApplied.current) return
    demoApplied.current = true
    const cards = allCards(rev.content)
    rev.setDemoProgress(demoProgress(cards, today))
    const sc = uiRef.current.screen
    if (sc === 'session' || sc === 'fin') patch(demoSession(cards, uiRef.current.mode, PARAMS.phase, sc === 'fin'))
  }, [rev, today, patch])

  const logSession = useCallback((s: Session) => {
    if (!isLogged(s)) return
    const ids = Object.keys(s.res)
    rev.logSession({ d: today, n: ids.length, ok: ids.filter(id => s.res[id] === 2).length, k: s.kind, l: s.label })
  }, [rev, today])

  const endSession = useCallback((s: Session) => {
    logSession(s)
    go('fin', { session: { ...s, done: true } })
  }, [logSession, go])

  const value: AppValue = {
    ui, rev, today, cur, now, mobile, offline: PARAMS.lib === 'offline' || !online, patch, go,
    openDoc: id => {
      const seen = ui.seen.includes(id) ? ui.seen : [...ui.seen, id]
      if (!PARAMS.frame) savePref('seen', seen)
      if (mobile) go('apercu', { sel: id, seen })
      else patch({ sel: id, seen })
    },
    toggleTheme: () => { if (!PARAMS.frame) savePref('theme', ui.dark ? 'light' : 'dark'); patch({ dark: !ui.dark }) },
    startSession: (mode, kind, label, cards) => {
      if (!cards.length) return
      const s = mkSession(mode, kind, label, cards, mode === 'ask' ? ui.askName.trim() : '')
      go('session', { session: mode === 'self' ? withChoices(s, allCards(rev.content)) : s, checks: {}, hideAns: false })
    },
    reveal: () => { const s = ui.session; if (s && !s.rev && !s.done) patch({ session: { ...s, rev: true } }) },
    pick: i => {
      const s = ui.session
      if (s && !s.rev && !s.done && s.queue[s.i]?.ch && i >= 0 && i < s.queue[s.i].ch!.options.length) patch({ session: { ...s, picked: i } })
    },
    validate: () => {
      const s = ui.session
      if (s && !s.rev && !s.done && s.picked !== null) patch({ session: { ...s, rev: true } })
    },
    next: () => {
      const s = ui.session
      const g = s && s.rev ? gradeOf(s) : null
      if (g !== null) value.answer(g)
    },
    answer: g => {
      const r = ui.session && answerCard(ui.session, g)
      if (!r) return
      if (r.graded) rev.grade(r.graded.card.id, r.graded.grade, today)
      if (r.finished) endSession(r.session)
      else patch({ session: r.session, checks: {}, hideAns: false })
    },
    quitSession: () => {
      const s = ui.session
      if (s && s.mode === 'ask') { endSession(s); return }
      if (s) logSession(s)
      go('revision', { session: null })
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
