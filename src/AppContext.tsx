import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ASK_COUNTS } from './lib/constants'
import { demoProgress, demoSession } from './lib/demo'
import { currentZone, dayNum } from './lib/format'
import { isRevScreen, PARAMS, type Screen } from './lib/params'
import { checkIsAdmin } from './lib/adminApi'
import { confirmLeaveDraft } from './lib/draftGuard'
import { gradeOf, withChoices } from './lib/qcm'
import { answerCard, isLogged, mkSession } from './lib/session'
import { allCards } from './lib/srs'
import { CACHE_KEYS, LEGACY_KEYS, parseSeen, parseTheme } from './lib/cache'
import { initialEntry, normalizeTarget, type NavEntry } from './lib/navHistory'
import { loadPref, savePref } from './lib/storage'
import type { Scope } from './lib/practice'
import type { Card, Doc, Grade, QuizMode, Session, TypeFilter } from './lib/types'
import { useCatalog, type CatalogStatus } from './hooks/useCatalog'
import { useNavHistory } from './hooks/useNavHistory'
import { useNow } from './hooks/useNow'
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
  isAdmin: boolean
  /** Vrai tant que les droits admin de la personne connectée ne sont pas connus (UX-9). */
  adminChecking: boolean
  docs: Doc[]
  catalogStatus: CatalogStatus
  reloadCatalog(): Promise<void>
  docById(id: number | null): Doc | null
  today: number
  cur: number
  now: Date
  mobile: boolean
  offline: boolean
  patch(p: Partial<Ui>): void
  go(screen: Screen, p?: Partial<Ui>): void
  openDoc(id: number): void
  /** Marque une pièce comme consultée (ouverture dans un nouvel onglet sur mobile). */
  markSeen(id: number): void
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
  const t = PARAMS.theme || (PARAMS.frame ? null : loadPref(CACHE_KEYS.theme, parseTheme, null, LEGACY_KEYS.theme))
  if (t === 'dark' || t === 'light') return t === 'dark'
  return !window.matchMedia?.('(prefers-color-scheme: light)').matches
}

const entryOf = (u: Pick<Ui, 'screen' | 'sel'>): NavEntry => ({ screen: u.screen, sel: u.screen === 'apercu' ? u.sel : null })

/** Droits admin vérifiés pour une adresse donnée : tant que l'adresse change, la vérification est en cours. */
function useAdminCheck(email: string | null): { isAdmin: boolean; adminChecking: boolean } {
  const [checked, setChecked] = useState<{ email: string; ok: boolean } | null>(null)
  useEffect(() => {
    if (!email || PARAMS.frame) return
    let alive = true
    checkIsAdmin().catch(() => false).then(ok => { if (alive) setChecked({ email, ok }) })
    return () => { alive = false }
  }, [email])
  const known = !!email && checked?.email === email
  return { isAdmin: known && !!checked?.ok, adminChecking: !!email && !PARAMS.frame && !known }
}

export function AppProvider({ children }: { children: ReactNode }) {
  // Jour recalculé au passage de minuit et au retour au premier plan (QA-1).
  const now = useNow()
  const today = dayNum(now)
  const cur = currentZone(now)
  const [start] = useState(() => initialEntry(PARAMS.frame ? '' : location.hash, PARAMS.screen, PARAMS.sel))
  const [ui, setUi] = useState<Ui>(() => ({
    screen: start.screen,
    dark: initialDark(), q: PARAMS.q, type: 'all', ess: false, month: null, sel: start.screen === 'apercu' ? start.sel : PARAMS.sel,
    fiche: cur, practice: cur, scope: 'all', mode: PARAMS.mode, askName: '', askCount: ASK_COUNTS[0],
    session: null, checks: {}, hideAns: false, shared: false, seen: loadPref(CACHE_KEYS.seen, parseSeen, [], LEGACY_KEYS.seen),
  }))
  const rev = useRevision(PARAMS.demo)
  const catalog = useCatalog()
  const { isAdmin, adminChecking } = useAdminCheck(rev.email)
  const mobile = useIsMobile()
  const online = useOnline()
  const uiRef = useRef(ui)
  uiRef.current = ui

  // Historique : le retour Android ramène à l'écran précédent du site, jamais hors du site en pleine séance (point 7).
  const onPopRef = useRef<(t: NavEntry) => void>(() => undefined)
  const navHist = useNavHistory(!PARAMS.frame, () => entryOf(uiRef.current), t => onPopRef.current(t))
  /** Vrai pendant l'application d'un popstate : go() ne touche pas à l'historique. */
  const syncing = useRef(false)

  const patch = useCallback((p: Partial<Ui>) => setUi(u => ({ ...u, ...p })), [])
  const go = useCallback((screen: Screen, p: Partial<Ui> = {}) => {
    const from = entryOf(uiRef.current)
    // Brouillon de question non enregistré (UX-5) : quitter l'admin demande confirmation. Le popstate a déjà demandé.
    if (!syncing.current && from.screen === 'admin' && screen !== 'admin' && !confirmLeaveDraft()) return
    const next = { ...uiRef.current, screen, shared: false, ...p }
    uiRef.current = next
    setUi(u => ({ ...u, screen, shared: false, ...p }))
    window.scrollTo(0, 0)
    if (isRevScreen(screen)) rev.init()
    if (!syncing.current) navHist.record(from, entryOf(next))
  }, [rev, navHist])

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

  onPopRef.current = target => {
    const u = uiRef.current
    const t = normalizeTarget(target, !!u.session)
    const s = u.session
    if (u.screen === 'admin' && t.screen !== 'admin' && !confirmLeaveDraft()) { navHist.restore(entryOf(u)); return }
    syncing.current = true
    try {
      if (u.screen === 'session' && s && !s.done && t.screen !== 'session') {
        // Retour en pleine séance : la séance se termine comme avec QUITTER (réponses gardées), on reste sur le site.
        if (s.mode === 'ask') { endSession(s); navHist.replace({ screen: 'fin', sel: null }); return }
        logSession(s)
        go(t.screen, { session: null, ...(t.screen === 'apercu' ? { sel: t.sel } : {}) })
        return
      }
      go(t.screen, t.screen === 'apercu' ? { sel: t.sel } : {})
    } finally {
      syncing.current = false
    }
  }

  const value: AppValue = {
    ui, rev, isAdmin, adminChecking, today, cur, now, mobile,
    docs: catalog.docs, catalogStatus: catalog.status, reloadCatalog: catalog.reload,
    docById: id => (id === null ? null : catalog.docs.find(d => d.id === id) || null), offline: PARAMS.lib === 'offline' || !online, patch, go,
    openDoc: id => {
      const seen = ui.seen.includes(id) ? ui.seen : [...ui.seen, id]
      if (!PARAMS.frame) savePref(CACHE_KEYS.seen, seen)
      if (mobile) go('apercu', { sel: id, seen })
      else patch({ sel: id, seen })
    },
    markSeen: id => {
      if (ui.seen.includes(id)) return
      const seen = [...ui.seen, id]
      if (!PARAMS.frame) savePref(CACHE_KEYS.seen, seen)
      patch({ seen })
    },
    toggleTheme: () => { if (!PARAMS.frame) savePref(CACHE_KEYS.theme, ui.dark ? 'light' : 'dark'); patch({ dark: !ui.dark }) },
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
