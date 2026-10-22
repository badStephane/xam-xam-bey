import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../../AppContext'
import { successRate, weekLabel, type AdminStats, type HardQuestion, type WeekStat, type ZoneStat } from '../../lib/adminStats'
import { ZONES } from '../../lib/constants'
import { p2, plain, plural } from '../../lib/format'
import { adminStats } from '../../lib/leagueApi'

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; stats: AdminStats }

const cell = { padding: '8px 6px', borderBottom: '1px solid var(--line)', textAlign: 'left' as const, fontVariantNumeric: 'tabular-nums' as const }
const caption = { textAlign: 'left' as const, paddingBottom: 6 }
const zoneName = (z: number): string => `${p2(z)} ${ZONES[z - 1]?.[0] ?? ''}`.trim()
const rateText = (correct: number, answers: number): string => {
  const r = successRate(correct, answers)
  return r === null ? '—' : `${r} %`
}

/** Évolution : une barre par semaine (scouts actifs), les chiffres écrits dans la ligne. */
function WeeksTable({ weeks }: { weeks: WeekStat[] }) {
  const max = Math.max(1, ...weeks.map(w => w.scouts))
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9375rem' }}>
      <caption className="f-lbl" style={caption}>ACTIVITÉ PAR SEMAINE</caption>
      <thead><tr><th scope="col" style={cell}>Semaine du</th><th scope="col" style={{ ...cell, width: '40%' }}>Scouts actifs</th><th scope="col" style={cell}>Réponses</th><th scope="col" style={cell}>Réussite</th></tr></thead>
      <tbody>
        {weeks.map(w => (
          <tr key={w.week}>
            <th scope="row" style={cell}>{weekLabel(w.week)}</th>
            <td style={cell}>
              <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <span aria-hidden="true" style={{ height: 8, width: `${(70 * w.scouts) / max}%`, minWidth: w.scouts ? 4 : 0, background: 'var(--acc)', borderRadius: '0 4px 4px 0' }} />
                {w.scouts}
              </span>
            </td>
            <td style={cell}>{w.answers}</td>
            <td style={cell}>{rateText(w.correct, w.answers)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ZonesTable({ zones }: { zones: ZoneStat[] }) {
  if (!zones.length) return <p className="muted" style={{ margin: 0 }}>Aucune carte vue pour le moment.</p>
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9375rem' }}>
      <caption className="f-lbl" style={caption}>AVANCEMENT PAR ZONE</caption>
      <thead><tr><th scope="col" style={cell}>Zone</th><th scope="col" style={cell}>Scouts</th><th scope="col" style={cell}>Cartes vues</th><th scope="col" style={cell}>Acquises</th></tr></thead>
      <tbody>
        {zones.map(z => (
          <tr key={z.zone}>
            <th scope="row" style={cell}>{zoneName(z.zone)}</th>
            <td style={cell}>{z.scouts}</td>
            <td style={cell}>{z.seen}</td>
            <td style={cell}>{rateText(z.acquired, z.seen)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Hardest({ list }: { list: HardQuestion[] }) {
  return (
    <section className="col g8" aria-labelledby="st-hard-h">
      <h2 id="st-hard-h" className="f-lbl" style={{ margin: 0 }}>QUESTIONS LES PLUS RATÉES</h2>
      <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Sur les 7 dernières semaines, parmi les questions qui ont au moins 5 réponses. Un taux très bas signale souvent une question ou une réponse à revoir.</p>
      {list.length
        ? (
          <ol className="col g8" style={{ margin: 0, paddingLeft: 22 }}>
            {list.map(h => (
              <li key={h.id}>
                <span className="lbl">{zoneName(h.zone).toUpperCase()} · {h.id}</span>
                <div style={{ overflowWrap: 'anywhere' }}>{plain(h.q)}</div>
                <span className="muted" style={{ fontSize: '0.875rem' }}>{rateText(h.correct, h.answers)} de réussite sur {plural(h.answers, 'réponse', 'réponses')}</span>
              </li>
            ))}
          </ol>
        )
        : <p className="muted" style={{ margin: 0 }}>Pas encore assez de réponses.</p>}
    </section>
  )
}

/** Onglet STATS de l'admin (2026-10-22) : agrégats seulement, aucun compte identifiable (décision PM). */
export function StatsAdmin() {
  const { offline } = useApp()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })

  const fetchStats = useCallback(async () => {
    setLoad({ kind: 'loading' })
    const r = await adminStats()
    setLoad(r.ok ? { kind: 'ready', stats: r.data } : { kind: 'error' })
  }, [])

  useEffect(() => { if (!offline) void fetchStats() }, [offline, fetchStats])

  if (offline) return <p className="banner" role="status"><b>HORS RÉSEAU</b><span style={{ fontSize: '0.875rem' }}>Hors réseau : les statistiques demandent du réseau.</span></p>
  if (load.kind === 'error') {
    return <div className="warn-inline" role="alert"><span>Les statistiques n’ont pas pu être chargées.</span><button className="btn-mono" onClick={() => void fetchStats()}>RÉESSAYER</button></div>
  }
  if (load.kind === 'loading') {
    return <div className="col g6" role="status" aria-label="Chargement des statistiques">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skel-line" style={{ height: 36 }} />)}</div>
  }
  const { stats } = load
  return (
    <section className="col g16" aria-label="Statistiques">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p style={{ margin: 0 }}><b style={{ fontSize: '1.5rem' }}>{stats.accounts}</b> {stats.accounts > 1 ? 'comptes ont' : 'compte a'} commencé à réviser.</p>
        <button className="btn-mono" onClick={() => void fetchStats()}>ACTUALISER</button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Chiffres globaux, sans aucun nom ni pseudo. Une réponse compte au plus une fois par question et par jour, 30 par scout et par jour.</p>
      <WeeksTable weeks={stats.weeks} />
      <ZonesTable zones={stats.zones} />
      <Hardest list={stats.hardest} />
    </section>
  )
}
