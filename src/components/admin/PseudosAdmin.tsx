import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../AppContext'
import { leagueName } from '../../lib/league'
import { BlockedWords } from './BlockedWords'
import { ADMIN_PAGE, adminListPseudos, adminModeratePseudo, type AdminPseudo, type ModerationAction } from '../../lib/leagueApi'

type Load = 'loading' | 'ready' | 'error'

const dateLabel = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function Line({ row, onDone }: { row: AdminPseudo; onDone(a: ModerationAction): void }) {
  const [ask, setAsk] = useState<ModerationAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const run = async (a: ModerationAction) => {
    setBusy(true)
    const r = await adminModeratePseudo(row.userId, a)
    setBusy(false)
    if (!r.ok) { setErr(true); return }
    setAsk(null)
    onDone(a)
  }
  return (
    <li className="adm-pseudo">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{row.pseudo}</b>
        <span className="lbl">{row.tier ? `${leagueName(row.tier).toUpperCase()} · ` : ''}{row.reports > 0 ? `${row.reports} SIGNALEMENT${row.reports > 1 ? 'S' : ''} · ` : ''}{dateLabel(row.changedAt)}</span>
      </div>
      {ask
        ? (
          <div className="col g8" role="group" aria-label={`Retirer ${row.pseudo}`}>
            <p style={{ margin: 0 }}>Retirer {row.pseudo} ? Le scout devra choisir un autre pseudo.</p>
            <div className="row"><button className="btn" onClick={() => setAsk(null)}>ANNULER</button><button className="btn acc" disabled={busy} onClick={() => void run(ask)}>RETIRER</button></div>
          </div>
        )
        : (
          <div className="row">
            <button className="btn-mono" onClick={() => setAsk('reset')}>RÉINITIALISER</button>
            <button className="btn-mono" onClick={() => setAsk('refuse')}>REFUSER</button>
            {row.reports > 0 && <button className="btn-mono" disabled={busy} onClick={() => void run('ignore')}>IGNORER</button>}
          </div>
        )}
      {err && <span className="field-err" role="alert">L’action n’a pas pu être faite. Réessayez.</span>}
    </li>
  )
}

/** Onglet PSEUDOS de l'admin (16-design P-H) : aucun e-mail ni nom, seulement le pseudo, les signalements et la date. */
export function PseudosAdmin() {
  const { offline } = useApp()
  const [rows, setRows] = useState<AdminPseudo[]>([])
  const [load, setLoad] = useState<Load>('loading')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [more, setMore] = useState(false)
  const [reportedOnly, setReportedOnly] = useState(false)

  const fetchPage = useCallback(async (q: string, after: string | null) => {
    setLoad('loading')
    const r = await adminListPseudos(q, after)
    if (!r.ok) { setLoad('error'); return }
    setRows(prev => (after ? [...prev, ...r.data] : r.data))
    setMore(r.data.length >= ADMIN_PAGE)
    setLoad('ready')
  }, [])

  useEffect(() => { if (!offline) void fetchPage(query, null) }, [offline, query, fetchPage])

  if (offline) return <p className="banner" role="status"><b>HORS RÉSEAU</b><span style={{ fontSize: 14 }}>Hors réseau : la modération demande du réseau.</span></p>
  const submit = (e: FormEvent) => { e.preventDefault(); setQuery(search) }
  // Ordre du serveur : signalés d'abord, puis les plus récents (16-design P-H).
  const shown = reportedOnly ? rows.filter(r => r.reports > 0) : rows
  const drop = (row: AdminPseudo, a: ModerationAction) =>
    setRows(rs => (a === 'ignore' ? rs.map(r => (r.userId === row.userId ? { ...r, reports: 0 } : r)) : rs.filter(r => r.userId !== row.userId)))
  return (
    <section className="col g12" aria-label="Pseudos">
      <form className="row" onSubmit={submit} role="search">
        <label className="sr" htmlFor="adm-ps-q">Rechercher un pseudo</label>
        <input id="adm-ps-q" className="pseudo-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un pseudo" />
        <button className="btn-mono" type="submit">RECHERCHER</button>
        <button className="chip" type="button" aria-pressed={reportedOnly} onClick={() => setReportedOnly(v => !v)}>SIGNALÉS</button>
      </form>
      {load === 'error' && (
        <div className="warn-inline" role="alert"><span>La liste n’a pas pu être chargée.</span><button className="btn-mono" onClick={() => void fetchPage(query, null)}>RÉESSAYER</button></div>
      )}
      {load === 'loading' && !rows.length && <div className="col g6" role="status" aria-label="Chargement des pseudos">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skel-line" style={{ height: 56 }} />)}</div>}
      {load !== 'loading' && load !== 'error' && !shown.length && <p className="muted" style={{ margin: 0 }}>{reportedOnly ? 'Aucun signalement.' : 'Aucun pseudo pour le moment.'}</p>}
      {shown.length > 0 && <ul className="col g8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{shown.map(r => <Line key={r.userId} row={r} onDone={a => drop(r, a)} />)}</ul>}
      {more && load === 'ready' && rows[rows.length - 1]?.cursor && <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void fetchPage(query, rows[rows.length - 1].cursor)}>AFFICHER PLUS</button>}
      <BlockedWords />
    </section>
  )
}
