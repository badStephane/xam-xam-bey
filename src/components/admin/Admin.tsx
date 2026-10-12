import { useState } from 'react'
import { useApp } from '../../AppContext'
import { SignInGate } from '../revision/Gate'
import { CardsAdmin } from './CardsAdmin'
import { DocsAdmin } from './DocsAdmin'

type Tab = 'docs' | 'cards'

/** Espace Admin : documents de la bibliothèque et questions de révision. Les droits sont vérifiés par la base (RLS). */
export function Admin() {
  const { rev, isAdmin } = useApp()
  const [tab, setTab] = useState<Tab>('docs')
  if (!rev.email) return <SignInGate />
  if (!isAdmin) {
    return <p className="muted" role="status">Cet espace est réservé aux administrateurs. Demandez à un administrateur d’ajouter votre adresse ({rev.email}).</p>
  }
  return (
    <div className="col g16">
      <div className="head"><span className="eyebrow">ADMINISTRATION</span><h1 className="h-screen">Contenu</h1></div>
      <nav className="chips" aria-label="Administration">
        <button className="chip" aria-current={tab === 'docs' ? 'page' : undefined} onClick={() => setTab('docs')}>DOCUMENTS</button>
        <button className="chip" aria-current={tab === 'cards' ? 'page' : undefined} onClick={() => setTab('cards')}>QUESTIONS</button>
      </nav>
      {tab === 'docs' ? <DocsAdmin /> : <CardsAdmin />}
    </div>
  )
}
