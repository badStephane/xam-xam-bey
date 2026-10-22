import { useState, type FormEvent } from 'react'
import { useApp } from '../../AppContext'
import type { AdminView, ScoutHit } from '../../lib/adminScout'
import { adminFindScouts, adminListViews } from '../../lib/leagueApi'
import { dateLabel, ScoutDetail } from './ScoutDetail'

const MIN_SEARCH = 3

type Search = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; text: string } | { kind: 'ready'; hits: ScoutHit[] }
type Journal = { kind: 'closed' } | { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; views: AdminView[] }

function Hits({ hits, onOpen }: { hits: ScoutHit[]; onOpen(id: string): void }) {
  if (!hits.length) return <p className="muted" style={{ margin: 0 }}>Aucun compte trouvé.</p>
  return (
    <ul className="col g8" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Comptes trouvés">
      {hits.map(h => (
        <li key={h.userId}>
          <button className="adm-pseudo" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', color: 'inherit', font: 'inherit' }} onClick={() => onOpen(h.userId)}>
            <b style={{ overflowWrap: 'anywhere' }}>{h.email}</b>
            <span className="lbl">{h.pseudo ? `${h.pseudo} · ` : ''}DERNIÈRE RÉVISION : {dateLabel(h.lastActive).toUpperCase()}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Journal des consultations, chargé à l'ouverture : quel admin a ouvert quelle fiche, et quand (un an gardé). */
function ViewsJournal() {
  const [journal, setJournal] = useState<Journal>({ kind: 'closed' })
  const load = async () => {
    setJournal({ kind: 'loading' })
    const r = await adminListViews()
    setJournal(r.ok ? { kind: 'ready', views: r.data } : { kind: 'error' })
  }
  return (
    <details onToggle={e => { if ((e.target as HTMLDetailsElement).open && journal.kind === 'closed') void load() }}>
      <summary className="f-lbl" style={{ cursor: 'pointer' }}>JOURNAL DES CONSULTATIONS</summary>
      <div className="col g8" style={{ marginTop: 8 }}>
        {journal.kind === 'loading' && <p className="mono" role="status">CHARGEMENT…</p>}
        {journal.kind === 'error' && <div className="warn-inline" role="alert"><span>Le journal n’a pas pu être chargé.</span><button className="btn-mono" onClick={() => void load()}>RÉESSAYER</button></div>}
        {journal.kind === 'ready' && (journal.views.length
          ? (
            <ul className="col g6" style={{ margin: 0, paddingLeft: 18, fontSize: '0.875rem' }}>
              {journal.views.map((v, i) => <li key={`${v.viewedAt}-${i}`} style={{ overflowWrap: 'anywhere' }}>{dateLabel(v.viewedAt)} · {v.adminEmail} {v.search !== null ? `a cherché « ${v.search} »` : `a consulté ${v.targetEmail}`}</li>)}
            </ul>
          )
          : <p className="muted" style={{ margin: 0 }}>Aucune consultation.</p>)}
      </div>
    </details>
  )
}

/** Onglet SUIVI de l'admin (2026-10-22) : retrouver un compte par e-mail ou pseudo et ouvrir sa fiche de progression. */
export function ScoutsAdmin() {
  const { offline } = useApp()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<Search>({ kind: 'idle' })
  const [open, setOpen] = useState<string | null>(null)

  if (offline) return <p className="banner" role="status"><b>HORS RÉSEAU</b><span style={{ fontSize: '0.875rem' }}>Hors réseau : le suivi demande du réseau.</span></p>
  if (open) return <ScoutDetail key={open} userId={open} onBack={() => setOpen(null)} />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (query.trim().length < MIN_SEARCH) { setSearch({ kind: 'error', text: `Saisissez au moins ${MIN_SEARCH} caractères.` }); return }
    setSearch({ kind: 'loading' })
    const r = await adminFindScouts(query)
    setSearch(r.ok ? { kind: 'ready', hits: r.data } : { kind: 'error', text: 'La recherche n’a pas pu aboutir. Réessayez.' })
  }
  return (
    <section className="col g12" aria-label="Suivi d’un scout">
      <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Retrouvez un compte par une partie de son e-mail ou de son pseudo. Chaque recherche et chaque fiche ouverte sont notées dans le journal des consultations ; les scouts savent que les responsables peuvent voir leur progression.</p>
      <form className="row" onSubmit={e => void submit(e)} role="search">
        <label className="sr" htmlFor="adm-sc-q">E-mail ou pseudo</label>
        <input id="adm-sc-q" className="pseudo-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="E-mail ou pseudo" autoComplete="off" />
        <button className="btn-mono" type="submit" disabled={search.kind === 'loading'}>RECHERCHER</button>
      </form>
      {search.kind === 'loading' && <p className="mono" role="status">RECHERCHE…</p>}
      {search.kind === 'error' && <p className="field-err" role="alert" style={{ margin: 0 }}>{search.text}</p>}
      {search.kind === 'ready' && <Hits hits={search.hits} onOpen={setOpen} />}
      <ViewsJournal />
    </section>
  )
}
