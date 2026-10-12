import { useCallback, useEffect, useRef, useState } from 'react'
import { KEPT_SESSIONS, SAVE_DELAY } from '../lib/constants'
import { PARAMS } from '../lib/params'
import { applyGrade, EMPTY_PROGRESS, readProgress, validCards } from '../lib/srs'
import { isValidEmail, magicLinkRedirect, supabase } from '../lib/supabase'
import type { Fiche, Grade, Plan, Progress, RevisionContent, RevStatus, SessionLog } from '../lib/types'

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

async function loadContent(): Promise<RevisionContent> {
  if (!supabase) throw new Error('Supabase non configuré')
  const { data, error } = await supabase.from('revision_content').select('id, data')
  if (error) throw error
  return toContent(data || [])
}

export type SignInState = { step: 'idle' | 'sending' | 'sent' | 'error'; message?: string }

export interface Revision {
  status: RevStatus
  content: RevisionContent
  prog: Progress
  saveErr: boolean
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

/** Contenu de révision et progression personnelle (Supabase), enregistrée avec un léger délai. */
export function useRevision(demo: boolean): Revision {
  const [status, setStatus] = useState<RevStatus>('idle')
  const [content, setContent] = useState<RevisionContent>(EMPTY_CONTENT)
  const [prog, setProg] = useState<Progress>(EMPTY_PROGRESS)
  const [saveErr, setSaveErr] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [signIn, setSignIn] = useState<SignInState>({ step: 'idle' })
  const statusRef = useRef<RevStatus>('idle')
  const progRef = useRef<Progress>(EMPTY_PROGRESS)
  /** Identifiant de la personne dont la progression a été lue avec succès : condition pour écrire. */
  const ownerRef = useRef<string | null>(null)
  const save = useRef({ dirty: false, saving: false, again: false, timer: 0 as ReturnType<typeof setTimeout> | 0 })

  const setStat = useCallback((s: RevStatus) => { statusRef.current = s; setStatus(s) }, [])

  const flush = useCallback(async (): Promise<void> => {
    const sv = save.current
    const owner = ownerRef.current
    if (!supabase || !owner || !sv.dirty || PARAMS.frame || PARAMS.demo) return
    if (sv.saving) { sv.again = true; return }
    sv.saving = true
    sv.dirty = false
    if (sv.timer) clearTimeout(sv.timer)
    const p = progRef.current
    const { error } = await supabase.from('progress').upsert({
      user_id: owner, cards: p.cards, sessions: p.sessions.slice(-KEPT_SESSIONS), xp: p.xp, updated_at: new Date().toISOString(),
    })
    sv.saving = false
    if (error) {
      console.error('[xxb] Enregistrement de la progression impossible', error)
      sv.dirty = true
      setSaveErr(true)
      sv.timer = setTimeout(() => void flush(), RETRY_DELAY)
    } else {
      setSaveErr(false)
    }
    if (sv.again) { sv.again = false; void flush() }
  }, [])

  const commit = useCallback((next: Progress, immediate = false) => {
    progRef.current = next
    setProg(next)
    save.current.dirty = true
    if (save.current.timer) clearTimeout(save.current.timer)
    if (immediate) void flush()
    else save.current.timer = setTimeout(() => void flush(), SAVE_DELAY)
  }, [flush])

  /** Charge la progression puis le contenu. Si la lecture échoue, aucune écriture n'est autorisée. */
  const loadFor = useCallback(async (userId: string) => {
    if (!supabase) return
    setStat('loading')
    try {
      const { data, error } = await supabase.from('progress').select('cards, sessions, xp').eq('user_id', userId).maybeSingle()
      if (error) throw error
      const p = data ? readProgress(data) : EMPTY_PROGRESS
      progRef.current = p
      setProg(p)
      ownerRef.current = userId
      const c = await loadContent()
      setContent(c)
      setStat(c.plan ? 'ready' : 'empty')
    } catch (err) {
      console.error('[xxb] Révision indisponible', err)
      setStat('unavailable')
    }
  }, [setStat])

  const resetUser = useCallback(() => {
    ownerRef.current = null
    progRef.current = EMPTY_PROGRESS
    setProg(EMPTY_PROGRESS)
    setContent(EMPTY_CONTENT)
    setEmail(null)
    setStat('signedout')
  }, [setStat])

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
        setEmail(user.email || null)
        setSignIn({ step: 'idle' })
        // Différé : on ne rappelle pas Supabase depuis le rappel d'authentification lui-même.
        setTimeout(() => void loadFor(user.id), 0)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [demo, loadFor, resetUser])

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
      void flush().then(() => supabase!.auth.signOut()).then(({ error }) => {
        if (error) console.error('[xxb] Déconnexion impossible', error)
        resetUser()
      })
    },
    grade: (cardId, g, today) => commit(applyGrade(progRef.current, cardId, g, today)),
    logSession: log => commit({ ...progRef.current, sessions: [...progRef.current.sessions, log] }, true),
    retrySave: () => { setSaveErr(false); save.current.dirty = true; void flush() },
    setDemoProgress: p => { progRef.current = p; setProg(p) },
  }
}
