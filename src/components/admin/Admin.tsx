import { useState } from 'react'
import { useApp } from '../../AppContext'
import { confirmLeaveDraft } from '../../lib/draftGuard'
import { SignInGate, UnavailableGate } from '../revision/Gate'
import { CardsAdmin } from './CardsAdmin'
import { DocsAdmin } from './DocsAdmin'

type Tab = 'docs' | 'cards'

/** Espace Admin : documents de la bibliothèque et questions de révision. Les droits sont vérifiés par la base (RLS). */
export function Admin() {
  const { rev, isAdmin, adminChecking, go } = useApp()
  const [tab, setTab] = useState<Tab>('docs')
  // UX-9 : ni connexion ni refus affichés tant que la session et les droits ne sont pas connus.
  const readingSession = !rev.email && (rev.status === 'idle' || rev.status === 'loading')
  if (readingSession || adminChecking) {
    return <p className="mono" role="status" style={{ color: 'var(--acc)', animation: 'xxbPulse 1.2s ease-in-out infinite' }}>VÉRIFICATION DE VOS DROITS…</p>
  }
  if (!rev.email) return rev.status === 'unavailable' ? <UnavailableGate /> : <SignInGate />
  if (!isAdmin) {
    return (
      <div className="col g12" style={{ alignItems: 'flex-start' }}>
        <p className="muted" role="status" style={{ margin: 0 }}>Cet espace est réservé aux administrateurs. Demandez à un administrateur d’ajouter votre adresse ({rev.email}).</p>
        <button className="btn" onClick={() => go('bibliotheque')}>RETOUR À LA BIBLIOTHÈQUE</button>
      </div>
    )
  }
  return (
    <div className="col g16">
      <div className="head"><span className="eyebrow">ADMINISTRATION</span><h1 className="h-screen">Contenu</h1></div>
      <nav className="chips" aria-label="Administration">
        <button className="chip" aria-current={tab === 'docs' ? 'page' : undefined} onClick={() => { if (confirmLeaveDraft()) setTab('docs') }}>DOCUMENTS</button>
        <button className="chip" aria-current={tab === 'cards' ? 'page' : undefined} onClick={() => { if (confirmLeaveDraft()) setTab('cards') }}>QUESTIONS</button>
      </nav>
      {tab === 'docs' ? <DocsAdmin /> : <CardsAdmin />}
    </div>
  )
}
