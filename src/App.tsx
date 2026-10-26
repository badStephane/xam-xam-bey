import { lazy, Suspense, useEffect } from 'react'
import { useApp } from './AppContext'
import { Apercu } from './components/library/Apercu'
import { Library } from './components/library/Library'
import { Fiches } from './components/revision/Fiches'
import { Fin } from './components/revision/Fin'
import { Plan } from './components/revision/Plan'
import { Progress } from './components/revision/Progress'
import { RevisionArea } from './components/revision/RevisionArea'
import { Session } from './components/revision/Session'
import { Today } from './components/revision/Today'
import { LazyBadges, LazyLeague } from './components/league/lazy'
import { Shell } from './components/Shell'
import { Topo } from './components/Topo'
import { PARAMS } from './lib/params'
import type { Grade } from './lib/types'

const BG = { dark: '#0D1512', light: '#EEE8DA' }

/** Espace Admin (moins de 5 personnes), chargé à la demande : hors du premier affichage (budget du bundle initial). */
const Admin = lazy(() => import('./components/admin/Admin').then(m => ({ default: m.Admin }), () => ({
  default: () => <p className="muted" role="status">L’espace Admin n’a pas pu se charger. Vérifiez la connexion puis rechargez la page.</p>,
})))
/** Page de révision d'un document (2026-10-18), chargée à la demande. */
const DocPageView = lazy(() => import('./components/revision/DocPageView').then(m => ({ default: m.DocPageView }), () => ({
  default: () => <p className="muted" role="status">Cette page n’a pas pu se charger. Vérifiez la connexion puis rechargez la page.</p>,
})))
const ADMIN_LOADING = <p className="mono" role="status" style={{ color: 'var(--acc)' }}>CHARGEMENT…</p>

function useKeyboard() {
  const { ui, go, answer, pick, validate, next, quitSession } = useApp()
  useEffect(() => {
    if (PARAMS.frame) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName || ''
      if (e.repeat || ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
      if (e.key === 'Escape' && ui.screen === 'apercu') { go('bibliotheque'); return }
      const s = ui.session
      if (ui.screen !== 'session' || !s || s.done) return
      if (e.key === 'Escape') { quitSession(); return }
      // L3-5 : confirmation « Quitter ? » ouverte, aucun raccourci de carte. Tab et les boutons gardent leur effet natif.
      if (ui.quitAsk) return
      if (s.mode === 'ask') {
        if (/^[123]$/.test(e.key)) { e.preventDefault(); answer((Number(e.key) - 1) as Grade) }
        return
      }
      if (!s.rev && /^[1-4]$/.test(e.key)) { e.preventDefault(); pick(Number(e.key) - 1) }
      else if (!s.rev && e.key === 'Enter' && tag !== 'BUTTON') { e.preventDefault(); validate() }
      else if (s.rev && (e.key === 'Enter' || e.key === ' ') && tag !== 'BUTTON') { e.preventDefault(); next() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ui.screen, ui.session, ui.quitAsk, go, answer, pick, validate, next, quitSession])
}

function Screen() {
  const { ui } = useApp()
  switch (ui.screen) {
    case 'session': if (ui.session && !ui.session.done) return <Session />; break
    case 'fin': if (ui.session) return <Fin />; break
    case 'apercu': if (ui.sel) return <Apercu />; break
    case 'bibliotheque': return <Shell><Library /></Shell>
    case 'admin': return <Shell><Suspense fallback={ADMIN_LOADING}><Admin /></Suspense></Shell>
    case 'plan': return <Shell><RevisionArea><Plan /></RevisionArea></Shell>
    case 'fiches': return <Shell><RevisionArea><Fiches /></RevisionArea></Shell>
    case 'page': return <Shell><RevisionArea><Suspense fallback={ADMIN_LOADING}><DocPageView /></Suspense></RevisionArea></Shell>
    case 'progression': return <Shell><RevisionArea><Progress /></RevisionArea></Shell>
    case 'ligue': return <Shell><RevisionArea><LazyLeague /></RevisionArea></Shell>
    case 'badges': return <Shell><RevisionArea><LazyBadges /></RevisionArea></Shell>
    default: break
  }
  if (ui.screen === 'apercu') return <Shell><Library /></Shell>
  return <Shell><RevisionArea><Today /></RevisionArea></Shell>
}

export function App() {
  const { ui } = useApp()
  useKeyboard()
  const theme = ui.dark ? 'dark' : 'light'
  useEffect(() => {
    document.body.style.background = BG[theme]
    // Barre d'état de l'application installée (et barre d'adresse sur Android) : même fond que la carte.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[theme])
  }, [theme])
  return (
    <div id="app" data-xt={theme}>
      <Topo />
      <div id="view"><Screen /></div>
    </div>
  )
}
