import { useEffect, useState } from 'react'
import { useApp } from '../../AppContext'
import type { Session } from '../../lib/types'
import { ProgressChips } from '../revision/ProgressChips'

type Chunk = typeof import('./Gamification')

/**
 * Chargement à la demande du morceau du lot 5 (P7 : budget du bundle initial). Le service worker le précharge à son
 * installation (src/sw/buildSw.ts) : Ligue et Badges s'ouvrent hors ligne même sans visite préalable. Morceau absent
 * (premier passage hors réseau, avant le worker) : écran de repli, nouvel essai au retour du réseau.
 */
let chunk: Chunk | null = null
let pending: Promise<Chunk> | null = null

function loadChunk(): Promise<Chunk> {
  pending ??= import('./Gamification').then(m => { chunk = m; return m }, err => { pending = null; throw err })
  return pending
}

function useChunk(): { mod: Chunk | null; failed: boolean } {
  const [mod, setMod] = useState<Chunk | null>(chunk)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (mod) return
    let alive = true
    const tryLoad = () => loadChunk().then(m => { if (alive) { setMod(m); setFailed(false) } }, err => {
      console.warn('[xxb] Écran du lot 5 non chargé', err)
      if (alive) setFailed(true)
    })
    void tryLoad()
    window.addEventListener('online', tryLoad)
    return () => { alive = false; window.removeEventListener('online', tryLoad) }
  }, [mod])
  return { mod, failed }
}

/** Le titre arrive avec le morceau : focus posé dessus une fois chargé (UX-13), si personne n'a pris le focus entre-temps. */
function focusHeadingLater(): void {
  setTimeout(() => {
    const active = document.activeElement
    if (active && active !== document.body && active.closest('#view')) return
    const h = document.querySelector<HTMLElement>('#view h1')
    if (!h) return
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1')
    h.focus({ preventScroll: true })
  }, 0)
}

function Missing({ title }: { title: string }) {
  const { go } = useApp()
  const offline = navigator.onLine === false
  return (
    <div className="col g16">
      <ProgressChips />
      <h1 className="h-screen">{title}</h1>
      <p role="status" style={{ margin: 0 }}>{offline
        ? 'Cet écran n’est pas encore sur votre téléphone. Il s’ouvrira au retour du réseau.'
        : 'Cet écran n’a pas pu se charger. Vérifiez la connexion puis rechargez la page.'}</p>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('progression')}>RETOUR AUX PROGRÈS</button>
    </div>
  )
}

function Screen({ title, pick }: { title: string; pick(m: Chunk): () => JSX.Element }) {
  const { mod, failed } = useChunk()
  const [late] = useState(() => !chunk)
  useEffect(() => { if (mod && late) focusHeadingLater() }, [mod, late])
  if (mod) { const C = pick(mod); return <C /> }
  if (failed) return <Missing title={title} />
  return (
    <div className="col g16">
      <ProgressChips />
      <p className="mono" role="status" style={{ color: 'var(--acc)' }}>CHARGEMENT…</p>
    </div>
  )
}

export const LazyLeague = () => <Screen title="Ligue" pick={m => m.LeagueScreen} />
export const LazyBadges = () => <Screen title="Badges" pick={m => m.BadgesScreen} />

/** Blocs secondaires (bilan, écran du jour) : rien tant que le morceau n'est pas là, jamais d'alerte. */
export function LazyWeekBlock() {
  const { mod } = useChunk()
  return mod ? <mod.WeekBlock /> : null
}

export function LazyFinGamification({ session }: { session: Session }) {
  const { mod } = useChunk()
  return mod ? <mod.FinGamification session={session} /> : null
}
