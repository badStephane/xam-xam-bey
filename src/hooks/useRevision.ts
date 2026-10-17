import { useCallback, useEffect, useRef, useState } from 'react'
import { SAVE_DELAY } from '../lib/constants'
import { PARAMS } from '../lib/params'
import { mergeProgress, parseStoredProgress } from '../lib/progressMerge'
import { canClearLocal, clearLocalProgress, fromSaveResult, isAccountSwitch, isGradesRejected, isGradesUnsupported, readLocalProgress, reconcileOnLoad, saveArgs, saveErrorKind, weekOfSaveResult, writeLocalProgress, type SaveErrorKind } from '../lib/progressSync'
import { clearGamification } from '../lib/gameKeys'
import { clearGradesQueue, enqueueGrade, gradesBatch, readGradesQueue, removeSentGrades, utcDay } from '../lib/gradeQueue'
import { applyGrade, cardsByZone, EMPTY_PROGRESS, validCards } from '../lib/srs'
import { clearCardsCache, readCardsCache, writeCardsCache } from '../lib/cardsCache'
import { forgetKnownUser, readKnownUser, writeKnownUser, type KnownUser } from '../lib/knownUser'
import { codeErrorMessage, isValidCode, sendErrorMessage } from '../lib/signin'
import { isValidEmail, magicLinkRedirect, supabase } from '../lib/supabase'
import type { CardRow, Fiche, Grade, Plan, Progress, RevisionContent, RevStatus, SessionLog } from '../lib/types'

const EMPTY_CONTENT: RevisionContent = { plan: null, fiches: {}, cards: {} }
const SEED_FILES = ['plan', 'fiche-1', 'cards-1']
const RETRY_DELAY = 10_000
/** Pas de session valide pour le propriétaire (jeton en cours de rafraîchissement) : traité comme une erreur réseau. */
const AUTH_PENDING = { code: 'auth_pending', message: 'Session en attente de rafraîchissement' }

/** Navigateur hors réseau (F1). `navigator.onLine` vrai ne garantit pas le réseau ; faux garantit son absence. */
const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * Vrai si le client a, pour ce compte, une session dont le jeton n'est pas expiré (F1). Évite d'envoyer avec la clé anon
 * quand le rafraîchissement du jeton n'a pas encore abouti après un retour du réseau (voir 05-build, Lot 4 > Front).
 */
async function hasLiveSession(userId: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data } = await supabase.auth.getSession()
    const s = data.session
    return !!s && s.user?.id === userId && (!s.expires_at || s.expires_at * 1000 > Date.now())
  } catch {
    return false
  }
}

function toContent(rows: Array<{ id: string; data: unknown }>): RevisionContent {
  return rows.reduce<RevisionContent>((acc, { id, data }) => {
    const fiche = /^fiche-(\d+)$/.exec(id)
    const cards = /^cards-(\d+)$/.exec(id)
    if (id === 'plan') return { ...acc, plan: data as Plan }
    if (fiche) return { ...acc, fiches: { ...acc.fiches, [+fiche[1]]: data as Fiche } }
    if (cards) return { ...acc, cards: { ...acc.cards, [+cards[1]]: validCards((data as { cards?: unknown })?.cards, +cards[1]) } }
    return acc
  }, EMPTY_CONTENT)
}

async function loadSeeds(): Promise<RevisionContent> {
  const docs = await Promise.all(SEED_FILES.map(async n => {
    const r = await fetch(`data/seed/${n}.json`)
    if (!r.ok) throw new Error(`${n} : ${r.status}`)
    return { id: n, data: await r.json() }
  }))
  return toContent(docs)
}

const CARD_COLUMNS = 'id, zone, document_id, position, q, a, src, note, qcm, status'

/** Plan et fiches (revision_content) et cartes publiées (table cards). */
async function loadContent(): Promise<RevisionContent> {
  if (!supabase) throw new Error('Supabase non configuré')
  const [content, cards] = await Promise.all([
    supabase.from('revision_content').select('id, data'),
    supabase.from('cards').select(CARD_COLUMNS).eq('status', 'published').order('zone').order('position'),
  ])
  if (content.error) throw content.error
  if (cards.error) throw cards.error
  const base = toContent(content.data || [])
  return { ...base, cards: cardsByZone((cards.data || []) as CardRow[]) }
}

/**
 * Connexion par lien magique ou code à 6 chiffres (D4).
 * - idle / sending / error : formulaire d'adresse (`message` : erreur du formulaire) ;
 * - sent : lien envoyé à `email` à `sentAt` ; `code` suit la saisie du code, `notice` le dernier renvoi.
 */
export interface SignInState {
  step: 'idle' | 'sending' | 'sent' | 'error'
  message?: string
  email?: string
  sentAt?: number
  resending?: boolean
  notice?: { kind: 'ok' | 'error'; text: string }
  code?: { status: 'verifying' | 'error'; message?: string }
}

/** Dernier envoi réussi (lot 5) : `seq` augmente à chaque envoi ; XP de ligue de la semaine si la base la renvoie. */
export interface WeekSync { seq: number; weekXp: number | null; counted: number }

export interface Revision {
  status: RevStatus
  weekSync: WeekSync
  /** Vrai si des notes attendent l'envoi ou si un envoi est en cours. */
  isSyncPending(): boolean
  content: RevisionContent
  prog: Progress
  /** null si tout est enregistré ; 'retry' : nouvel essai automatique ; 'rejected' : refus définitif du serveur. */
  saveErr: SaveErrorKind | null
  email: string | null
  /** Compte dont la progression est chargée (propriétaire des écritures), sinon null. */
  userId: string | null
  /** Vrai si cartes et progression viennent de l'appareil (hors réseau, F1) : les notes partiront au retour du réseau. */
  localOnly: boolean
  signIn: SignInState
  init(): void
  retry(): void
  requestLink(email: string): void
  /** Renvoie le lien (et le code) à la même adresse, depuis l'écran « Lien envoyé ». */
  resendLink(): void
  /** Vérifie le code à 6 chiffres reçu dans l'e-mail. */
  verifyCode(code: string): void
  /** Retour au formulaire d'adresse (« Modifier l'adresse »). */
  changeEmail(): void
  signOut(): void
  /** `choice` : texte de la proposition choisie pour un QCM (A11), absent en auto-évaluation. */
  grade(cardId: string, g: Grade, today: number, choice?: string): void
  logSession(log: SessionLog): void
  retrySave(): void
  setDemoProgress(p: Progress): void
}

/** Envoie le lien magique (et le code) ; renvoie l'erreur, ou null. */
async function sendLink(email: string): Promise<unknown> {
  if (!supabase) return new Error('Supabase non configuré')
  try {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: magicLinkRedirect(), shouldCreateUser: true } })
    if (error) console.error('[xxb] Envoi du lien impossible', error)
    return error
  } catch (err) {
    console.error('[xxb] Envoi du lien impossible', err)
    return err
  }
}

/** Planches et aperçus : aucune écriture, ni serveur ni locale. */
const canWrite = (): boolean => !PARAMS.frame && !PARAMS.demo

function localStore(): Storage | null {
  try { return window.localStorage } catch { return null }
}

/**
 * Oublie la révision gardée sur l'appareil (compte retenu et copie des cartes) pour `userId`, ou à défaut pour le compte
 * retenu (L4-1 : session disparue avant tout chargement). À n'appeler que si la session est réellement absente : jamais hors
 * réseau (getSession sauté) ni sur une erreur de rafraîchissement.
 */
function forgetDevice(userId: string | null): void {
  if (!canWrite()) return
  const store = localStore()
  const id = userId ?? readKnownUser(store)?.id
  if (!id) return
  forgetKnownUser(store, id)
  clearCardsCache(store, id)
  clearGamification(store, id)
}

/** Contenu de révision et progression personnelle (Supabase), enregistrée avec un léger délai et copiée en local. */
export function useRevision(demo: boolean): Revision {
  const [status, setStatus] = useState<RevStatus>('idle')
  const [content, setContent] = useState<RevisionContent>(EMPTY_CONTENT)
  const [prog, setProg] = useState<Progress>(EMPTY_PROGRESS)
  const [saveErr, setSaveErr] = useState<SaveErrorKind | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [localOnly, setLocalOnlyState] = useState(false)
  const localOnlyRef = useRef(false)
  const emailRef = useRef<string | null>(null)
  const resyncTimer = useRef<ReturnType<typeof setTimeout> | 0>(0)
  const resyncRef = useRef<() => void>(() => undefined)
  const [signIn, setSignIn] = useState<SignInState>({ step: 'idle' })
  const [weekSync, setWeekSync] = useState<WeekSync>({ seq: 0, weekXp: null, counted: 0 })
  /** Base sans le 4e paramètre de save_progress (avant la migration du lot 5) : envois à 3 clés pour cette page. */
  const gradesOff = useRef(false)
  const statusRef = useRef<RevStatus>('idle')
  const progRef = useRef<Progress>(EMPTY_PROGRESS)
  /** Identifiant de la personne dont la progression a été lue avec succès : condition pour écrire. */
  const ownerRef = useRef<string | null>(null)
  /**
   * Dernier propriétaire chargé, gardé après un SIGNED_OUT imposé (jeton refusé) : une séance encore ouverte continue
   * d'écrire ses notes dans la copie locale de ce compte, renvoyées à la reconnexion. Remis à null par « Se déconnecter ».
   */
  const lastOwnerRef = useRef<string | null>(null)
  /** Jeton de chargement : un chargement dépassé (autre loadFor, déconnexion) n'installe rien. */
  const loadSeq = useRef(0)
  const loadingFor = useRef<string | null>(null)
  const save = useRef({ dirty: false, saving: false, again: false, timer: 0 as ReturnType<typeof setTimeout> | 0 })

  /** Abandonne l'enregistrement en attente (changement de compte, déconnexion). Même objet : un appel en vol y remet `saving` à faux. */
  const dropPendingSave = useCallback(() => {
    if (save.current.timer) clearTimeout(save.current.timer)
    Object.assign(save.current, { dirty: false, again: false, timer: 0 })
  }, [])

  const setStat = useCallback((s: RevStatus) => { statusRef.current = s; setStatus(s) }, [])
  const setLocal = useCallback((v: boolean) => { localOnlyRef.current = v; setLocalOnlyState(v) }, [])
  const setMail = useCallback((e: string | null) => { emailRef.current = e; setEmail(e) }, [])
  const clearResync = useCallback(() => {
    if (resyncTimer.current) clearTimeout(resyncTimer.current)
    resyncTimer.current = 0
  }, [])
  /** Nouvel essai de synchronisation plus tard (réseau présent mais base ou jeton pas encore joignables). */
  const resyncLater = useCallback(() => {
    clearResync()
    resyncTimer.current = setTimeout(() => resyncRef.current(), RETRY_DELAY)
  }, [clearResync])

  /** Installe une progression en mémoire et dans la copie locale de son propriétaire. */
  const adopt = useCallback((p: Progress) => {
    progRef.current = p
    setProg(p)
    if (ownerRef.current && canWrite()) writeLocalProgress(localStore(), ownerRef.current, p)
  }, [])

  const flush = useCallback(async (): Promise<void> => {
    const sv = save.current
    const owner = ownerRef.current
    if (!supabase || !owner || !sv.dirty || !canWrite()) return
    // Hors réseau (F1) : aucun essai, aucune erreur ; la note est dans la copie locale, l'événement `online` relancera.
    if (isOffline()) return
    if (sv.saving) { sv.again = true; return }
    sv.saving = true
    sv.dirty = false
    if (sv.timer) clearTimeout(sv.timer)
    const live = await hasLiveSession(owner)
    const sent = gradesOff.current ? [] : gradesBatch(readGradesQueue(localStore(), owner))
    const { data, error } = live ? await supabase.rpc('save_progress', saveArgs(progRef.current, sent)) : { data: null, error: AUTH_PENDING }
    sv.saving = false
    if (ownerRef.current !== owner) return
    if (error && sent.length && (isGradesRejected(error) || isGradesUnsupported(error))) {
      // File refusée en bloc : abandonnée ; base sans p_grades : file gardée, envois à 3 clés. La progression repart aussitôt.
      console.error('[xxb] Notes de ligue non envoyées', error)
      if (isGradesRejected(error)) clearGradesQueue(localStore(), owner)
      else gradesOff.current = true
      sv.dirty = true
      sv.again = true
    } else if (error) {
      console.error('[xxb] Enregistrement de la progression impossible', error)
      const kind = saveErrorKind(error)
      sv.dirty = true
      setSaveErr(kind)
      // Refus définitif (22023, 23514) : pas de boucle ; la copie locale garde tout, RÉESSAYER reste possible.
      if (kind === 'retry') sv.timer = setTimeout(() => void flush(), RETRY_DELAY)
    } else {
      setSaveErr(null)
      const left = sent.length ? removeSentGrades(localStore(), owner, sent) : []
      // Plus de 500 notes en attente : le reste part dans l'envoi suivant.
      if (left.length && !gradesOff.current) { sv.dirty = true; sv.again = true }
      const week = weekOfSaveResult(data)
      setWeekSync(w => ({ seq: w.seq + 1, weekXp: week?.weekXp ?? null, counted: week?.counted ?? 0 }))
      const saved = fromSaveResult(data)
      // État fusionné du serveur, refusionné avec ce qui a été noté pendant l'appel.
      if (saved) adopt(mergeProgress(saved, progRef.current))
    }
    if (sv.again) { sv.again = false; void flush() }
  }, [adopt])

  const schedule = useCallback((immediate: boolean) => {
    save.current.dirty = true
    if (save.current.timer) clearTimeout(save.current.timer)
    if (immediate) void flush()
    else save.current.timer = setTimeout(() => void flush(), SAVE_DELAY)
  }, [flush])

  const commit = useCallback((next: Progress, immediate = false) => {
    adopt(next)
    schedule(immediate)
  }, [adopt, schedule])

  /**
   * Note ou séance enregistrée (`update` appliqué à la progression). Sans propriétaire (SIGNED_OUT pendant une séance) :
   * appliquée à la copie locale du dernier compte chargé, qu'`install` fusionnera et renverra à la reconnexion.
   */
  const record = useCallback((update: (p: Progress) => Progress, immediate = false) => {
    const last = lastOwnerRef.current
    if (ownerRef.current || !last || !canWrite()) { commit(update(progRef.current), immediate); return }
    const store = localStore()
    writeLocalProgress(store, last, update(readLocalProgress(store, last)))
  }, [commit])

  /** Fusionne la ligne serveur, la copie locale et l'état en mémoire ; renvoie au serveur ce qu'il n'a pas. */
  const install = useCallback((userId: string, row: unknown) => {
    const server = row ? parseStoredProgress(row) : EMPTY_PROGRESS
    const local = canWrite() ? readLocalProgress(localStore(), userId) : EMPTY_PROGRESS
    const current = ownerRef.current === userId ? progRef.current : EMPTY_PROGRESS
    const { prog: merged, dirty } = reconcileOnLoad(server, mergeProgress(local, current))
    ownerRef.current = userId
    lastOwnerRef.current = userId
    setUserId(userId)
    adopt(merged)
    // Notes prises hors réseau et pas encore envoyées : elles partent dans le même envoi.
    if (dirty || save.current.dirty) schedule(false)
  }, [adopt, schedule])

  /**
   * Révision lue depuis l'appareil (F1) : copie des cartes de ce compte et copie locale de sa progression.
   * Faux si aucune copie valide n'existe pour ce compte. Les notes vont dans la copie locale et partent au retour du réseau.
   */
  const fromDevice = useCallback((user: KnownUser): boolean => {
    const store = localStore()
    const cached = canWrite() ? readCardsCache(store, user.id) : null
    if (!cached) return false
    const current = ownerRef.current === user.id ? progRef.current : EMPTY_PROGRESS
    ownerRef.current = user.id
    lastOwnerRef.current = user.id
    setUserId(user.id)
    setMail(user.email)
    adopt(mergeProgress(readLocalProgress(store, user.id), current))
    setContent(cached)
    setLocal(true)
    setStat(cached.plan ? 'ready' : 'empty')
    // Réseau annoncé présent mais base injoignable : nouvel essai plus tard ; sinon l'événement `online` s'en charge.
    if (!isOffline()) resyncLater()
    return true
  }, [adopt, resyncLater, setLocal, setMail, setStat])

  /** Après un chargement en ligne réussi : copie des cartes et compte retenus pour la révision hors ligne. */
  const rememberDevice = useCallback((userId: string, c: RevisionContent) => {
    if (!canWrite()) return
    const store = localStore()
    if (writeCardsCache(store, userId, c)) writeKnownUser(store, { id: userId, email: emailRef.current })
  }, [])

  /**
   * Charge la progression puis le contenu, et rafraîchit la copie de l'appareil. En échec : copie de l'appareil si ce compte
   * en a une (F1), sinon « indisponible » sans aucune écriture. `quiet` (retour du réseau) : ni écran de chargement, ni
   * changement d'état en cas d'échec.
   */
  const loadFor = useCallback(async (userId: string, quiet = false) => {
    if (!supabase || loadingFor.current === userId) return
    const seq = ++loadSeq.current
    const isCurrent = (): boolean => seq === loadSeq.current
    loadingFor.current = userId
    if (!quiet) setStat('loading')
    try {
      const { data, error } = await supabase.from('progress').select('cards, sessions, xp').eq('user_id', userId).maybeSingle()
      if (error) throw error
      if (!isCurrent()) return
      install(userId, data)
      const c = await loadContent()
      if (!isCurrent()) return
      setContent(c)
      setLocal(false)
      rememberDevice(userId, c)
      setStat(c.plan ? 'ready' : 'empty')
    } catch (err) {
      if (!isCurrent()) return
      console.error('[xxb] Révision indisponible', err)
      if (!quiet && !fromDevice({ id: userId, email: emailRef.current })) setStat('unavailable')
    } finally {
      if (isCurrent()) loadingFor.current = null
    }
  }, [fromDevice, install, rememberDevice, setLocal, setStat])

  /**
   * Retour du réseau, ou jeton rafraîchi (F1). Révision lue depuis l'appareil : rechargement discret, qui envoie au passage
   * les notes prises hors réseau (une seule fois : `install` fusionne et `flush` n'a qu'un envoi en vol). Sinon : envoi
   * des notes en attente. Session pas encore valide : nouvel essai dans 10 s (ou à l'événement TOKEN_REFRESHED).
   */
  const resync = useCallback(async (): Promise<void> => {
    clearResync()
    const owner = ownerRef.current
    if (!supabase || !owner || !canWrite() || isOffline()) return
    if (!localOnlyRef.current) {
      if (save.current.dirty) await flush()
      return
    }
    if (await hasLiveSession(owner)) await loadFor(owner, true)
    if (localOnlyRef.current && ownerRef.current === owner && !isOffline()) resyncLater()
  }, [clearResync, flush, loadFor, resyncLater])
  resyncRef.current = () => void resync()

  /** Hors réseau ou session illisible : révision du dernier compte chargé sur l'appareil, s'il en a une copie. */
  const startFromDevice = useCallback((failed: boolean) => {
    const known = canWrite() ? readKnownUser(localStore()) : null
    if (known && fromDevice(known)) return
    // Jamais connecté ici et hors réseau : écran « connectez-vous une première fois avec du réseau ».
    setStat(known || failed ? 'unavailable' : 'signedout')
  }, [fromDevice, setStat])

  /** Déconnexion : plus aucune donnée de ce compte n'est lue sur l'appareil ; sa progression locale suit la règle du lot 1. */
  const resetUser = useCallback(() => {
    forgetDevice(ownerRef.current)
    loadSeq.current += 1
    loadingFor.current = null
    ownerRef.current = null
    setUserId(null)
    dropPendingSave()
    clearResync()
    setLocal(false)
    progRef.current = EMPTY_PROGRESS
    setProg(EMPTY_PROGRESS)
    setContent(EMPTY_CONTENT)
    setMail(null)
    setStat('signedout')
  }, [clearResync, dropPendingSave, setLocal, setMail, setStat])

  const init = useCallback(() => {
    if (statusRef.current !== 'idle') return
    setStat('loading')
    if (demo) {
      // Planches : données d'exemple du dépôt en développement, sinon le contenu publié si la personne est connectée.
      loadSeeds().catch(() => loadContent()).then(c => { setContent(c); setStat('ready') }).catch(() => setStat(supabase ? 'signedout' : 'unavailable'))
      return
    }
    if (!supabase) { setStat('unavailable'); return }
    // Hors réseau (F1) : getSession attendrait l'échec du rafraîchissement d'un jeton expiré (jusqu'à ~25 s).
    if (isOffline()) { startFromDevice(false); return }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error
      const user = data.session?.user
      // Session réellement absente en ligne (déconnexion ailleurs, jeton révoqué) : l'appareil oublie l'ancien compte (L4-1).
      if (!user) { forgetDevice(null); setStat('signedout'); return }
      setMail(user.email || null)
      void loadFor(user.id)
    }).catch(err => { console.error('[xxb] Session illisible', err); startFromDevice(true) })
  }, [demo, loadFor, setMail, setStat, startFromDevice])

  useEffect(() => {
    if (!supabase || demo) return
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { resetUser(); return }
      const user = session?.user
      // Jeton rafraîchi (souvent au retour du réseau) : les notes en attente partent avec la nouvelle session.
      if (event === 'TOKEN_REFRESHED' && user && user.id === ownerRef.current) { setTimeout(() => void resync(), 0); return }
      if (event === 'SIGNED_IN' && user && ownerRef.current !== user.id) {
        if (isAccountSwitch(ownerRef.current, user.id)) {
          // Plus aucune écriture au nom de l'ancien compte avec le jeton du nouveau ; ses notes restent dans sa copie locale.
          ownerRef.current = null
          setUserId(null)
          dropPendingSave()
          clearResync()
          setLocal(false)
        }
        setMail(user.email || null)
        setSignIn({ step: 'idle' })
        // Différé : on ne rappelle pas Supabase depuis le rappel d'authentification lui-même.
        setTimeout(() => void loadFor(user.id), 0)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [demo, clearResync, dropPendingSave, loadFor, resetUser, resync, setLocal, setMail])

  // Retour du réseau (F1) : envoi des notes prises hors réseau, rechargement discret si la révision venait de l'appareil.
  useEffect(() => {
    const onOnline = () => void resync()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [resync])

  useEffect(() => {
    const onHide = () => void flush()
    const onVisibility = () => { if (document.visibilityState === 'hidden') void flush() }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onVisibility) }
  }, [flush])

  return {
    status, content, prog, saveErr, email, userId, localOnly, signIn, init, weekSync,
    isSyncPending: () => save.current.dirty || save.current.saving || save.current.again,
    retry: () => {
      // Aussi depuis le chargement (FE-5) : le chargement en cours est abandonné par son jeton, puis relancé.
      loadSeq.current += 1
      loadingFor.current = null
      void flush().then(() => { ownerRef.current = null; statusRef.current = 'idle'; init() })
    },
    requestLink: address => {
      if (!supabase) return
      if (!isValidEmail(address)) { setSignIn({ step: 'error', message: 'Adresse e-mail invalide.' }); return }
      const email = address.trim()
      setSignIn({ step: 'sending', email })
      void sendLink(email).then(error => {
        setSignIn(error ? { step: 'error', email, message: sendErrorMessage(error) } : { step: 'sent', email, sentAt: Date.now() })
      })
    },
    resendLink: () => {
      const email = signIn.email
      if (!supabase || signIn.step !== 'sent' || !email || signIn.resending) return
      setSignIn(s => ({ ...s, resending: true, notice: undefined }))
      void sendLink(email).then(error => {
        setSignIn(s => (s.step !== 'sent' || s.email !== email ? s : error
          ? { ...s, resending: false, notice: { kind: 'error', text: sendErrorMessage(error) } }
          : { ...s, resending: false, sentAt: Date.now(), code: undefined, notice: { kind: 'ok', text: `Nouveau lien envoyé à ${email}.` } }))
      })
    },
    verifyCode: raw => {
      const email = signIn.email
      if (!supabase || signIn.step !== 'sent' || !email || signIn.code?.status === 'verifying') return
      if (!isValidCode(raw)) { setSignIn(s => ({ ...s, code: { status: 'error', message: 'Le code compte 6 chiffres.' } })); return }
      setSignIn(s => ({ ...s, code: { status: 'verifying' } }))
      // Succès : l'événement SIGNED_IN charge la progression et remet la connexion à zéro.
      supabase.auth.verifyOtp({ email, token: raw, type: 'email' }).then(({ error }) => {
        if (!error) return
        console.error('[xxb] Code refusé', error)
        setSignIn(s => (s.email === email ? { ...s, code: { status: 'error', message: codeErrorMessage(error) } } : s))
      }, (err: unknown) => {
        console.error('[xxb] Vérification du code impossible', err)
        setSignIn(s => (s.email === email ? { ...s, code: { status: 'error', message: codeErrorMessage(err) } } : s))
      })
    },
    changeEmail: () => setSignIn(s => ({ step: 'idle', email: s.email })),
    signOut: () => {
      if (!supabase) return
      const owner = ownerRef.current
      // Déconnexion choisie : plus aucune note gardée pour ce compte sur l'appareil.
      lastOwnerRef.current = null
      void flush().then(() => {
        // Copie locale effacée seulement si le serveur a tout reçu (téléphone partagé) ; gardée sinon.
        if (owner && canWrite() && canClearLocal(save.current)) clearLocalProgress(localStore(), owner)
        return supabase!.auth.signOut()
      }).then(({ error }) => {
        if (error) console.error('[xxb] Déconnexion impossible', error)
        resetUser()
      })
    },
    grade: (cardId, g, today, choice) => {
      const owner = ownerRef.current
      // Jour et heure de la note pris sur la même horloge, en UTC : jamais un jour futur pour le serveur ; `t` toujours envoyé.
      const at = Date.now()
      const day = utcDay(at)
      if (owner && canWrite()) enqueueGrade(localStore(), owner, { c: cardId, d: day, g, t: Math.floor(at / 1000), ...(choice === undefined ? {} : { a: choice }) }, day)
      record(p => applyGrade(p, cardId, g, today))
    },
    logSession: log => record(p => ({ ...p, sessions: [...p.sessions, log] }), true),
    retrySave: () => { setSaveErr(null); save.current.dirty = true; void flush() },
    setDemoProgress: p => { progRef.current = p; setProg(p) },
  }
}
