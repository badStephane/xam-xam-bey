import { useApp } from '../../AppContext'
import { DAY_NAMES, EXTRA_NEW, FREEZE_EVERY, FREEZE_MAX, MONTH_NAMES, SECONDS_PER_CARD } from '../../lib/constants'
import { p2, plural } from '../../lib/format'
import { TrainCard } from './TrainCard'
import { LazyWeekBlock } from '../league/lazy'
import { allCards, dailyCards, newCards, streakState } from '../../lib/srs'

export function Today() {
  const { rev, now, today, cur, startSession } = useApp()
  const cards = allCards(rev.content)
  const { due, fresh } = dailyCards(cards, rev.prog, today, cur)
  const n = due.length + fresh.length
  // Session du jour finie : un scout motivé peut demander d'autres questions jamais vues (zones déjà ouvertes).
  const extra = n ? [] : newCards(cards, rev.prog, cur, EXTRA_NEW)
  const { current: st, freezes, frozeYesterday } = streakState(rev.prog, today)
  const minutes = (k: number) => Math.max(1, Math.round(k * SECONDS_PER_CARD / 60))
  // Parcours jeunes : le gros bouton d'abord, les chiffres ensuite, et l'entraînement à la carte replié (moins de choix d'un coup).
  return (
    <div className="col g16">
      <div className="head">
        <span className="eyebrow">{DAY_NAMES[now.getDay()]} {now.getDate()} {MONTH_NAMES[now.getMonth()].toUpperCase()} · ZONE {p2(cur)}</span>
        <h1 className="h-screen">Aujourd’hui</h1>
      </div>
      {n
        ? <button className="go" onClick={() => startSession('self', 'daily', 'Session du jour', [...due, ...fresh])}><b>C’EST PARTI · {plural(n, 'QUESTION', 'QUESTIONS')}</b><span>ENVIRON {minutes(n)} MIN</span></button>
        : extra.length
          ? <button className="go" onClick={() => startSession('self', 'extra', 'Nouvelles questions', extra)}><b>TU ES À JOUR · {extra.length} QUESTIONS EN BONUS</b><span>ENVIRON {minutes(extra.length)} MIN · ELLES COMPTENT AUSSI</span></button>
          : <button className="go" disabled><b>RIEN À RÉVISER AUJOURD’HUI</b><span>TU ES À JOUR · REVIENS DEMAIN</span></button>}
      <div className="kpis">
        <div className="kpi"><b>{due.length}</b><span>À REVOIR</span></div>
        <div className="kpi"><b>{fresh.length}</b><span>{fresh.length > 1 ? 'NOUVELLES' : 'NOUVELLE'}</span></div>
        <div className="kpi"><b style={{ color: 'var(--amber)' }}>{st}</b><span>{st > 1 ? 'JOURS' : 'JOUR'} DE SUITE{freezes > 0 && <> · ❄ {freezes} {freezes > 1 ? 'GELS' : 'GEL'}</>}</span></div>
      </div>
      {frozeYesterday && <div className="banner" role="status"><b>❄ GEL UTILISÉ</b><span style={{ fontSize: '0.875rem' }}>Tu n’as pas révisé hier : un gel a protégé ta série.</span></div>}
      <LazyWeekBlock />
      <details className="lg-rules more-opts">
        <summary>PLUS D’OPTIONS : CHOISIR UNE ZONE, INTERROGER QUELQU’UN</summary>
        <div className="duo">
          <TrainCard />
          <section className="box" aria-labelledby="t-meth">
            <h2 id="t-meth" className="h-sec" style={{ fontSize: '1.1875rem' }}>COMMENT ÇA MARCHE</h2>
            <ol className="steps">
              <li><b>01</b><span>Lis la question et cherche la réponse dans ta tête.</span></li>
              <li><b>02</b><span>Choisis une des quatre réponses, puis valide.</span></li>
              <li><b>03</b><span>Juste : la question revient plus tard (dans 1, 3, 7, 21, puis 60 jours). Faux : elle revient à la fin, puis demain.</span></li>
              <li><b>04</b><span>Tous les {FREEZE_EVERY} jours de suite, tu gagnes un gel ({FREEZE_MAX} au plus) : il protège ta série si tu rates un jour.</span></li>
            </ol>
          </section>
        </div>
      </details>
    </div>
  )
}
