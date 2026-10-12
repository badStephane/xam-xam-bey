import { useApp } from '../../AppContext'
import { ZONES } from '../../lib/constants'
import { p2, plain, plural } from '../../lib/format'
import { allCards, dailyCards, zoneStats } from '../../lib/srs'

/** Fiche « ce mois-ci » : la zone en cours et la quête du jour. */
export function ZoneCard() {
  const { ui, rev, docs: allDocs, cur, today, patch, go, startSession } = useApp()
  const [, month, theme] = ZONES[cur - 1]
  const docs = allDocs.filter(d => d.th === cur)
  const ready = rev.status === 'ready'
  const st = zoneStats(rev.content.cards[cur], rev.prog)
  const goal = ready ? rev.content.plan?.months?.find(m => m.n === cur)?.o : ''
  const daily = ready ? dailyCards(allCards(rev.content), rev.prog, today, cur) : { due: [], fresh: [] }
  const nDaily = daily.due.length + daily.fresh.length
  return (
    <section className="sheet zone-card punch">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="cote" style={{ fontSize: 10.5 }}>CE MOIS-CI · ZONE {p2(cur)} · {month.toUpperCase()}</span>
        {ready && st.cards > 0 && <span className="stamp">QUÊTE {st.acq}/{st.cards}</span>}
      </div>
      <h2>{theme}</h2>
      {goal && <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink2)', maxWidth: 560 }}>{plain(goal)}</p>}
      <span className="d-meta" style={{ fontSize: 11 }}>
        {plural(docs.length, 'PIÈCE', 'PIÈCES')} · {plural(docs.filter(d => d.ess).length, 'ESSENTIEL', 'ESSENTIELS')} · {plural(docs.filter(d => ui.seen.includes(d.id)).length, 'CONSULTÉE', 'CONSULTÉES')}
      </span>
      <div className="row" style={{ paddingTop: 4 }}>
        <button className="ink-btn big" onClick={() => (nDaily ? startSession('self', 'daily', 'Session du jour', [...daily.due, ...daily.fresh]) : go('revision'))}>
          {nDaily ? `Quête du jour · ${plural(nDaily, 'carte', 'cartes')}` : 'Réviser la zone'}
        </button>
        <button className="ink-line" onClick={() => patch({ ess: true, month: cur })}>Voir les essentiels</button>
      </div>
    </section>
  )
}
