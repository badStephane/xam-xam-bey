import { useEffect, useRef, useState } from 'react'
import type { ScoutProgress, ScoutSession, ScoutWeek, ScoutZone } from '../../lib/adminScout'
import { successRate, weekLabel } from '../../lib/adminStats'
import { ZONES } from '../../lib/constants'
import { p2, plural, shortDate } from '../../lib/format'
import { adminScoutProgress } from '../../lib/leagueApi'

type Load = { kind: 'loading' } | { kind: 'error'; notFound: boolean } | { kind: 'ready'; fiche: ScoutProgress }

const cell = { padding: '8px 6px', borderBottom: '1px solid var(--line)', textAlign: 'left' as const, fontVariantNumeric: 'tabular-nums' as const }
const caption = { textAlign: 'left' as const, paddingBottom: 6 }
const table = { borderCollapse: 'collapse' as const, width: '100%', fontSize: '0.9375rem' }
export const dateLabel = (iso: string | null): string =>
  (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'jamais')
const rateText = (correct: number, answers: number): string => {
  const r = successRate(correct, answers)
  return r === null ? '—' : `${r} %`
}

function Weeks({ weeks }: { weeks: ScoutWeek[] }) {
  const max = Math.max(1, ...weeks.map(w => w.answers))
  return (
    <table style={table}>
      <caption className="f-lbl" style={caption}>RÉPONSES PAR SEMAINE</caption>
      <thead><tr><th scope="col" style={cell}>Semaine du</th><th scope="col" style={{ ...cell, width: '40%' }}>Réponses</th><th scope="col" style={cell}>Réussite</th><th scope="col" style={cell}>Jours</th></tr></thead>
      <tbody>
        {weeks.map(w => (
          <tr key={w.week}>
            <th scope="row" style={cell}>{weekLabel(w.week)}</th>
            <td style={cell}>
              <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <span aria-hidden="true" style={{ height: 8, width: `${(70 * w.answers) / max}%`, minWidth: w.answers ? 4 : 0, background: 'var(--acc)', borderRadius: '0 4px 4px 0' }} />
                {w.answers}
              </span>
            </td>
            <td style={cell}>{rateText(w.correct, w.answers)}</td>
            <td style={cell}>{w.days}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Zones({ zones }: { zones: ScoutZone[] }) {
  return (
    <table style={table}>
      <caption className="f-lbl" style={caption}>AVANCEMENT PAR ZONE</caption>
      <thead><tr><th scope="col" style={cell}>Zone</th><th scope="col" style={cell}>Cartes vues</th><th scope="col" style={cell}>Acquises</th></tr></thead>
      <tbody>
        {zones.map(z => (
          <tr key={z.zone}>
            <th scope="row" style={cell}>{p2(z.zone)} {ZONES[z.zone - 1]?.[0] ?? ''}</th>
            <td style={cell}>{z.seen} / {z.total}</td>
            <td style={cell}>{z.acquired} / {z.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Sessions({ sessions }: { sessions: ScoutSession[] }) {
  return (
    <section className="col g8" aria-labelledby="sc-sess-h">
      <h3 id="sc-sess-h" className="f-lbl" style={{ margin: 0 }}>DERNIÈRES SÉANCES</h3>
      {sessions.length
        ? (
          <ul className="col g6" style={{ margin: 0, paddingLeft: 18 }}>
            {sessions.map((s, i) => <li key={`${s.d}-${i}`}>{shortDate(s.d)}{s.l ? ` · ${s.l}` : ''} · {s.ok} / {plural(s.n, 'carte réussie', 'cartes réussies')}</li>)}
          </ul>
        )
        : <p className="muted" style={{ margin: 0 }}>Aucune séance enregistrée.</p>}
    </section>
  )
}

/** Fiche d'un scout. L'ouverture est notée par le serveur dans le journal des consultations. */
export function ScoutDetail({ userId, onBack }: { userId: string; onBack(): void }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const asked = useRef<string | null>(null)

  useEffect(() => {
    // Une seule consultation notée par ouverture (le double montage du mode strict ne doit pas l'écrire deux fois).
    if (asked.current === userId) return
    asked.current = userId
    setLoad({ kind: 'loading' })
    void adminScoutProgress(userId).then(r =>
      setLoad(r.ok ? { kind: 'ready', fiche: r.data } : { kind: 'error', notFound: r.error.message === 'NOT_FOUND' }))
  }, [userId])

  const back = <button className="btn-mono" style={{ alignSelf: 'flex-start' }} onClick={onBack}>← RETOUR À LA RECHERCHE</button>
  if (load.kind === 'loading') {
    return <div className="col g6" role="status" aria-label="Chargement de la fiche">{back}{Array.from({ length: 5 }, (_, i) => <div key={i} className="skel-line" style={{ height: 36 }} />)}</div>
  }
  if (load.kind === 'error') {
    return <div className="col g8">{back}<p className="warn-inline" role="alert">{load.notFound ? 'Ce compte n’existe plus.' : 'La fiche n’a pas pu être chargée. Réessayez.'}</p></div>
  }
  const { fiche } = load
  return (
    <section className="col g16" aria-label={`Fiche de ${fiche.email}`}>
      {back}
      <div className="col g6">
        <b style={{ fontSize: '1.125rem', overflowWrap: 'anywhere' }}>{fiche.email}</b>
        <span className="lbl">{fiche.pseudo ? `PSEUDO ${fiche.pseudo} · ` : 'SANS PSEUDO · '}{fiche.xp} XP</span>
        <span className="muted" style={{ fontSize: '0.875rem' }}>Inscrit le {dateLabel(fiche.createdAt)} · dernière révision enregistrée : {dateLabel(fiche.lastActive)}</span>
      </div>
      <Weeks weeks={fiche.weeks} />
      {fiche.zones.length ? <Zones zones={fiche.zones} /> : <p className="muted" style={{ margin: 0 }}>Aucune carte vue.</p>}
      <Sessions sessions={fiche.sessions} />
    </section>
  )
}
