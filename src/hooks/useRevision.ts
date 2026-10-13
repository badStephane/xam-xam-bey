import { useCallback, useEffect, useRef, useState } from 'react'
import { SAVE_DELAY } from '../lib/constants'
import { PARAMS } from '../lib/params'
import { mergeProgress, parseStoredProgress } from '../lib/progressMerge'
import { canClearLocal, clearLocalProgress, fromSaveResult, isAccountSwitch, readLocalProgress, reconcileOnLoad, saveArgs, saveErrorKind, writeLocalProgress, type SaveErrorKind } from '../lib/progressSync'
import { applyGrade, cardsByZone, EMPTY_PROGRESS, validCards } from '../lib/srs'
import { isValidEmail, magicLinkRedirect, supabase } from '../lib/supabase'
import type { CardRow, Fiche, Grade, Plan, Progress, RevisionContent, RevStatus, SessionLog } from '../lib/types'

const EMPTY_CONTENT: RevisionContent = { plan: null, fiches: {}, cards: {} }
const SEED_FILES = ['plan', 'fiche-1', 'cards-1']
const RETRY_DELAY = 10_000

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

export type SignInState = { step: 'idle' | 'sending' | 'sent' | 'error'; message?: string }

export interface Revision {
  status: RevStatus
  content: RevisionContent
  prog: Progress
  /** null si tout est enregistré ; 'retry' : nouvel essai automatique ; 'rejected' : refus définitif du serveur. */
  saveErr: SaveErrorKind | null
  email: string | null
  signIn: SignInState
  init(): void
  retry(): void
  requestLink(email: string): void
  signOut(): void
  grade(cardId: string, g: Grade, today: number): void
  logSession(log: SessionLog): void
  retrySave(): void
  setDemoProgress(p: Progress): void
}

/** Planches et aperçus : aucune écriture, ni serveur ni locale. */
const canWrite = (): boolean => !PARAMS.frame && !PARAMS.demo

function localStore(): Storage | null {
  try { return window.localStorage } catch { return null }
}

/** Contenu de révision et progression personnelle (Supabase), enregistrée avec un léger délai et copiée en local. */
export function useRevision(demo: boolean): Revision {
  const [status, setStatus] = useState<RevStatus>('idle')
  const [content, setContent] = useState<RevisionContent>(EMPTY_CONTENT)
  const [prog, setProg] = useState<Progress>(EMPTY_PROGRESS)
  const [saveErr, setSaveErr] = useState<SaveErrorKind | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [signIn, setSignIn] = useState<SignInState>({ step: 'idle' })
  const statusRef = useRef<RevStatus>('idle')
  const progRef = useRef<Progress>(EMPTY_PROGRESS)
  /** Identifiant de la personne dont la progression a été lue avec succès : condition pour écrire. */
  const ownerRef = useRef<string | null>(null)
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
    if (sv.saving) { sv.again = true; return }
    sv.saving = true
    sv.dirty = false
    if (sv.timer) clearTimeout(sv.timer)
    const { data, error } = await supabase.rpc('save_progress', saveArgs(progRef.current))
    sv.saving = false
    if (ownerRef.current !== owner) return
    if (error) {
      console.error('[xxb] Enregistrement de la progression impossible', error)
      const kind = saveErrorKind(error)
      sv.dirty = true
      setSaveErr(kind)
      // Refus définitif (22023, 23514) : pas de boucle ; la copie locale garde tout, RÉESSAYER reste possible.
      if (kind === 'retry') sv.timer = setTimeout(() => void flush(), RETRY_DELAY)
    } else {
      setSaveErr(null)
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

  /** Fusionne la ligne serveur, la copie locale et l'état en mémoire ; renvoie au serveur ce qu'il n'a pas. */
  const install = useCallback((userId: string, row: unknown) => {
    const server = row ? parseStoredProgress(row) : EMPTY_PROGRESS
    const local = canWrite() ? readLocalProgress(localStore(), userId) : EMPTY_PROGRESS
    const current = ownerRef.current === userId ? progRef.current : EMPTY_PROGRESS
    const { prog: merged, dirty } = reconcileOnLoad(server, mergeProgress(local, current))
    ownerRef.current = userId
    adopt(merged)
    if (dirty) schedule(false)
  }, [adopt, schedule])

  /** Charge la progression puis le contenu. Si la lecture échoue, aucune écriture n'est autorisée. */
  const loadFor = useCallback(async (userId: string) => {
    if (!supabase || loadingFor.current === userId) return
    const seq = ++loadSeq.current
    const isCurrent = (): boolean => seq === loadSeq.current
    loadingFor.current = userId
    setStat('loading')
    try {
      const { data, error } = await supabase.from('progress').select('cards, sessions, xp').eq('user_id', userId).maybeSingle()
      if (error) throw error
      if (!isCurrent()) return
      install(userId, data)
      const c = await loadContent()
      if (!isCurrent()) return
      setContent(c)
      setStat(c.plan ? 'ready' : 'empty')
    } catch (err) {
      if (!isCurrent()) return
      console.error('[xxb] Révision indisponible', err)
      setStat('unavailable')
    } finally {
      if (isCurrent()) loadingFor.current = null
    }
  }, [install, setStat])

  const resetUser = useCallback(() => {
    loadSeq.current += 1
    loadingFor.current = null
    ownerRef.current = null
    dropPendingSave()
    progRef.current = EMPTY_PROGRESS
    setProg(EMPTY_PROGRESS)
    setContent(EMPTY_CONTENT)
    setEmail(null)
    setStat('signedout')
  }, [dropPendingSave, setStat])

  const init = useCallback(() => {
    if (statusRef.current !== 'idle') return
    setStat('loading')
    if (demo) {
      // Planches : données d'exemple du dépôt en développement, sinon le contenu publié si la personne est connectée.
      loadSeeds().catch(() => loadContent()).then(c => { setContent(c); setStat('ready') }).catch(() => setStat(supabase ? 'signedout' : 'unavailable'))
      return
    }
    if (!supabase) { setStat('unavailable'); return }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error
      const user = data.session?.user
      if (!user) { setStat('signedout'); return }
      setEmail(user.email || null)
      void loadFor(user.id)
    }).catch(err => { console.error('[xxb] Session illisible', err); setStat('unavailable') })
  }, [demo, loadFor, setStat])

  useEffect(() => {
    if (!supabase || demo) return
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { resetUser(); return }
      const user = session?.user
      if (event === 'SIGNED_IN' && user && ownerRef.current !== user.id) {
        if (isAccountSwitch(ownerRef.current, user.id)) {
          // Plus aucune écriture au nom de l'ancien compte avec le jeton du nouveau ; ses notes restent dans sa copie locale.
          ownerRef.current = null
          dropPendingSave()
        }
        setEmail(user.email || null)
        setSignIn({ step: 'idle' })
        // Différé : on ne rappelle pas Supabase depuis le rappel d'authentification lui-même.
        setTimeout(() => void loadFor(user.id), 0)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [demo, dropPendingSave, loadFor, resetUser])

  useEffect(() => {
    const onHide = () => void flush()
    const onVisibility = () => { if (document.visibilityState === 'hidden') void flush() }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onVisibility) }
  }, [flush])

  return {
    status, content, prog, saveErr, email, signIn, init,
    retry: () => {
      if (statusRef.current === 'loading') return
      void flush().then(() => { ownerRef.current = null; statusRef.current = 'idle'; init() })
    },
    requestLink: address => {
      if (!supabase) return
      if (!isValidEmail(address)) { setSignIn({ step: 'error', message: 'Adresse e-mail invalide.' }); return }
      setSignIn({ step: 'sending' })
      supabase.auth.signInWithOtp({ email: address.trim(), options: { emailRedirectTo: magicLinkRedirect(), shouldCreateUser: true } })
        .then(({ error }) => {
          if (error) {
            console.error('[xxb] Envoi du lien impossible', error)
            const tooMany = error.status === 429 || /rate limit/i.test(error.message)
            setSignIn({ step: 'error', message: tooMany ? 'Trop de demandes. Réessayez dans quelques minutes.' : 'Le lien n’a pas pu être envoyé. Réessayez.' })
          } else {
            setSignIn({ step: 'sent', message: address.trim() })
          }
        })
    },
    signOut: () => {
      if (!supabase) return
      const owner = ownerRef.current
      void flush().then(() => {
        // Copie locale effacée seulement si le serveur a tout reçu (téléphone partagé) ; gardée sinon.
        if (owner && canWrite() && canClearLocal(save.current)) clearLocalProgress(localStore(), owner)
        return supabase!.auth.signOut()
      }).then(({ error }) => {
        if (error) console.error('[xxb] Déconnexion impossible', error)
        resetUser()
      })
    },
    grade: (cardId, g, today) => commit(applyGrade(progRef.current, cardId, g, today)),
    logSession: log => commit({ ...progRef.current, sessions: [...progRef.current.sessions, log] }, true),
    retrySave: () => { setSaveErr(null); save.current.dirty = true; void flush() },
    setDemoProgress: p => { progRef.current = p; setProg(p) },
  }
}
