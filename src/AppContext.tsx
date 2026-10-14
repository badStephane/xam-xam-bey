import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ASK_COUNTS } from './lib/constants'
import { demoProgress, demoSession } from './lib/demo'
import { currentZone, dayNum } from './lib/format'
import { isRevScreen, PARAMS, type Screen } from './lib/params'
import { checkIsAdmin } from './lib/adminApi'
import { confirmLeaveDraft } from './lib/draftGuard'
import { gradeOf, isSelfCheck, withChoices } from './lib/qcm'
import { advance, answerCard, isLogged, isScored, mkSession, scoreCurrent } from './lib/session'
import { clearSessionSnapshot, hasAnySessionSnapshot, readSessionSnapshot, saveSessionSnapshot } from './lib/sessionStore'
import { screenTitle } from './lib/screenTitle'
import { allCards } from './lib/srs'
import { CACHE_KEYS, LEGACY_KEYS, parseSeen, parseTheme } from './lib/cache'
import { initialEntry, normalizeTarget, parseHash, type NavEntry } from './lib/navHistory'
import { loadPref, savePref } from './lib/storage'
import type { Scope } from './lib/practice'
import type { Card, Doc, Grade, Progress, QuizMode, Session, TypeFilter } from './lib/types'
import { useCatalog, type CatalogStatus } from './hooks/useCatalog'
import { useNavHistory } from './hooks/useNavHistory'
import { useNow } from './hooks/useNow'
import { useRevision, type Revision } from './hooks/useRevision'
import { useScreenA11y } from './hooks/useScreenA11y'
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
  /** Confirmation « Quitter ? » affichée en séance (UX-14). */
  quitAsk: boolean
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
  /** Progression au début de la séance en cours ou terminée (badges gagnés pendant la séance, lot 5). */
  sessionStartProg: Progress | null
  mobile: boolean
  offline: boolean
  patch(p: Partial<Ui>): void
  go(screen: Screen, p?: Partial<Ui>): void
  openDoc(id: number): void
  /** Marque une pièce comme consultée (ouverture dans un nouvel onglet sur mobile). */
  markSeen(id: number): void
  toggleTheme(): void
  /** Ouvre l'aperçu du document relié à une carte (séance, bilan, fiches) ; RETOUR y ramène. */
  openCardDoc(id: number): void
  /** `name` : personne interrogée (mode « J’interroge ») ; par défaut, le prénom saisi. */
  startSession(mode: QuizMode, kind: string, label: string, cards: readonly Card[], name?: string): void
  reveal(): void
  answer(g: Grade): void
  pick(i: number): void
  validate(): void
  next(): void
  /** QUITTER ou Échap : ouvre la confirmation, ou la referme si elle est ouverte (UX-14). */
  quitSession(): void
  /** « Continuer » : referme la confirmation. */
  cancelQuit(): void
  /** « Quitter » confirmé : la séance se termine, réponses déjà données gardées. */
  confirmQuit(): void
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

/** Planches et aperçus : aucune séance gardée ni relue. */
const CAN_KEEP_SESSION = !PARAMS.frame && !PARAMS.demo

function tabStore(): Storage | null {
  try { return window.sessionStorage } catch { return null }
}

/** Écrans d'où un document relié à une carte s'ouvre, et où RETOUR ramène (F2 : fiches). */
const DOC_RETURN_SCREENS: readonly Screen[] = ['session', 'fin', 'fiches']

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
    session: null, checks: {}, hideAns: false, quitAsk: false, shared: false, seen: loadPref(CACHE_KEYS.seen, parseSeen, [], LEGACY_KEYS.seen),
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
  /** Changement d'écran brut (historique compris), sans le retour d'un document ouvert depuis une carte. */
  const goRaw = useCallback((screen: Screen, p: Partial<Ui> = {}) => {
    const from = entryOf(uiRef.current)
    // Brouillon de question non enregistré (UX-5) : quitter l'admin demande confirmation. Le popstate a déjà demandé.
    if (!syncing.current && from.screen === 'admin' && screen !== 'admin' && !confirmLeaveDraft()) return
    const next = { ...uiRef.current, screen, shared: false, quitAsk: false, ...p }
    uiRef.current = next
    setUi(u => ({ ...u, screen, shared: false, quitAsk: false, ...p }))
    window.scrollTo(0, 0)
    if (isRevScreen(screen)) rev.init()
    if (!syncing.current) navHist.record(from, entryOf(next))
  }, [rev, navHist])

  useEffect(() => { rev.init() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Séance gardée pour l'onglet (E2) : propriétaire et jour fixés au démarrage ; jamais écrite pour un autre compte.
  const sessionOwner = useRef<string | null>(null)
  const sessionStartProg = useRef<Progress | null>(null)
  const sessionDay = useRef(today)
  const keepSession = useCallback((s: Session | null) => {
    const owner = sessionOwner.current
    if (!CAN_KEEP_SESSION || !owner) return
    if (s) saveSessionSnapshot(tabStore(), owner, sessionDay.current, s)
    else clearSessionSnapshot(tabStore(), owner)
  }, [])
  useEffect(() => { keepSession(ui.session) }, [ui.session, keepSession])

  /** Nouvel état de séance : appliqué tout de suite et gardé dans le même geste que la note (E1 + E2). */
  const setSession = useCallback((s: Session, extra: Partial<Ui> = {}) => {
    const next = { ...uiRef.current, session: s, quitAsk: false, ...extra }
    uiRef.current = next
    setUi(u => ({ ...u, session: s, quitAsk: false, ...extra }))
    keepSession(s)
  }, [keepSession])

  // Rechargement en pleine séance (E2) : reprise une fois la progression et les cartes chargées, si l'état relu est valide.
  const resumePending = useRef(CAN_KEEP_SESSION && parseHash(location.hash)?.screen === 'session')
  useEffect(() => {
    if (!resumePending.current || rev.status !== 'ready' || !rev.userId) return
    resumePending.current = false
    const u = uiRef.current
    const s = readSessionSnapshot(tabStore(), rev.userId, today, allCards(rev.content))
    if (!s || u.screen !== 'revision' || u.session) {
      if (u.screen === 'revision') navHist.replace(entryOf(u))
      return
    }
    sessionOwner.current = rev.userId
    sessionDay.current = today
    goRaw('session', { session: s, checks: {}, hideAns: false })
  }, [rev.status, rev.userId, rev.content, today, goRaw, navHist])

  /** Séance gardée pour l'onglet, relue et adoptée (retour d'un document après un rechargement). */
  const adoptTabSession = (): Session | null => {
    if (!CAN_KEEP_SESSION || !rev.userId || rev.status !== 'ready') return null
    const saved = readSessionSnapshot(tabStore(), rev.userId, today, allCards(rev.content))
    if (saved) { sessionOwner.current = rev.userId; sessionDay.current = today }
    return saved
  }

  // Document ouvert depuis une carte : RETOUR (ou Échap) ramène à la séance ou au bilan, jamais à la bibliothèque.
  const docReturn = useRef<Screen | null>(null)
  const returnFromDoc = (): { screen: Screen; p: Partial<Ui> } | null => {
    const u = uiRef.current
    const from = docReturn.current
    if (from === 'fiches') return { screen: 'fiches', p: {} }
    if (from === 'fin' && u.session) return { screen: 'fin', p: {} }
    if (u.session && !u.session.done) return from === 'session' ? { screen: 'session', p: {} } : null
    const saved = adoptTabSession()
    if (saved) return { screen: 'session', p: { session: saved, checks: {}, hideAns: false } }
    // Rechargé sur le document, progression encore en chargement : l'écran du jour reprendra la séance une fois prêt.
    const loading = rev.status === 'idle' || rev.status === 'loading'
    if (CAN_KEEP_SESSION && loading && hasAnySessionSnapshot(tabStore())) {
      resumePending.current = true
      return { screen: 'revision', p: {} }
    }
    return null
  }
  const returnRef = useRef(returnFromDoc)
  returnRef.current = returnFromDoc

  const go = useCallback((screen: Screen, p: Partial<Ui> = {}) => {
    const fromDoc = uiRef.current.screen === 'apercu'
    const back = fromDoc && screen === 'bibliotheque' ? returnRef.current() : null
    if (fromDoc) docReturn.current = null
    if (back) goRaw(back.screen, back.p)
    else goRaw(screen, p)
  }, [goRaw])

  /** Ouvre l'aperçu du document d'une carte sans perdre la séance : nouvelle entrée d'historique, la séance reste derrière. */
  const openCardDoc = (id: number) => {
    const u = uiRef.current
    if (!catalog.docs.some(d => d.id === id) || !DOC_RETURN_SCREENS.includes(u.screen)) return
    const target: NavEntry = { screen: 'apercu', sel: id }
    if (u.screen === 'session') {
      // Une sortie de séance remplacerait son entrée (lot 2) : ici on empile, pour que le retour Android y ramène.
      syncing.current = true
      try { goRaw('apercu', { sel: id }) } finally { syncing.current = false }
      navHist.restore(target)
    } else {
      goRaw('apercu', { sel: id })
    }
    docReturn.current = u.screen
  }

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
    if (target.screen === 'session' && !u.session) {
      // Retour vers une séance après un rechargement (document ouvert depuis une carte) : reprise si elle est gardée.
      const saved = adoptTabSession()
      if (saved) {
        syncing.current = true
        try { docReturn.current = null; goRaw('session', { session: saved, checks: {}, hideAns: false }) } finally { syncing.current = false }
        return
      }
    }
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
    ui, rev, isAdmin, adminChecking, today, cur, now, mobile, sessionStartProg: sessionStartProg.current,
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
    openCardDoc,
    toggleTheme: () => { if (!PARAMS.frame) savePref(CACHE_KEYS.theme, ui.dark ? 'light' : 'dark'); patch({ dark: !ui.dark }) },
    startSession: (mode, kind, label, cards, name) => {
      if (!cards.length) return
      const s = mkSession(mode, kind, label, cards, mode === 'ask' ? (name ?? ui.askName).trim() : '')
      sessionOwner.current = rev.userId
      sessionDay.current = today
      sessionStartProg.current = rev.prog
      go('session', { session: mode === 'self' ? withChoices(s, allCards(rev.content)) : s, checks: {}, hideAns: false })
    },
    reveal: () => { const s = uiRef.current.session; if (s && !s.rev && !s.done) setSession({ ...s, rev: true }) },
    pick: i => {
      const s = uiRef.current.session
      if (s && !s.rev && !s.done && s.queue[s.i]?.ch && i >= 0 && i < s.queue[s.i].ch!.options.length) setSession({ ...s, picked: i })
    },
    // E1 : la réponse au QCM compte dès que la correction s'affiche ; « Suivant » ne fait que changer de carte.
    validate: () => {
      const s = uiRef.current.session
      if (!s || s.rev || s.done || s.picked === null) return
      const shown: Session = { ...s, rev: true }
      const g = gradeOf(shown)
      const r = g === null ? null : scoreCurrent(shown, g)
      // A11 : texte exact de la proposition choisie, comparé par le serveur à la bonne réponse (XP de ligue).
      const ch = shown.queue[shown.i]?.ch
      const choice = ch && !isSelfCheck(ch) && shown.picked !== null ? ch.options[shown.picked] : undefined
      if (r?.graded) rev.grade(r.graded.card.id, r.graded.grade, today, choice)
      setSession(r ? r.session : shown)
    },
    next: () => {
      const s = uiRef.current.session
      if (!s || !s.rev || s.done) return
      if (!isScored(s)) {
        const g = gradeOf(s)
        if (g !== null) value.answer(g)
        return
      }
      const r = advance(s)
      if (!r) return
      if (r.finished) endSession(r.session)
      else setSession(r.session, { checks: {}, hideAns: false })
    },
    answer: g => {
      const s = uiRef.current.session
      const r = s && answerCard(s, g)
      if (!r) return
      if (r.graded) rev.grade(r.graded.card.id, r.graded.grade, today)
      // Note gardée avant le changement de carte : un rechargement ne la rejoue pas.
      keepSession(r.session)
      if (r.finished) endSession(r.session)
      else setSession(r.session, { checks: {}, hideAns: false })
    },
    quitSession: () => {
      const u = uiRef.current
      if (u.screen !== 'session' || !u.session || u.session.done) return
      uiRef.current = { ...u, quitAsk: !u.quitAsk }
      patch({ quitAsk: !u.quitAsk })
    },
    cancelQuit: () => {
      uiRef.current = { ...uiRef.current, quitAsk: false }
      patch({ quitAsk: false })
    },
    confirmQuit: () => {
      const s = uiRef.current.session
      if (s && s.mode === 'ask') { endSession(s); return }
      if (s) logSession(s)
      go('revision', { session: null })
    },
  }
  const doc = ui.screen === 'apercu' ? value.docById(ui.sel) : null
  useScreenA11y(!PARAMS.frame, ui.screen, screenTitle(ui.screen, doc?.title))
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
