import { useApp } from '../../AppContext'
import { DAY_NAMES, EXTRA_NEW, MONTH_NAMES, NEW_PER_DAY, SECONDS_PER_CARD } from '../../lib/constants'
import { p2, plural } from '../../lib/format'
import { TrainCard } from './TrainCard'
import { LazyWeekBlock } from '../league/lazy'
import { allCards, dailyCards, newCards, streak } from '../../lib/srs'

export function Today() {
  const { rev, now, today, cur, startSession } = useApp()
  const cards = allCards(rev.content)
  const { due, fresh } = dailyCards(cards, rev.prog, today, cur)
  const n = due.length + fresh.length
  // Session du jour finie : un scout motivé peut demander d'autres questions jamais vues (zones déjà ouvertes).
  const extra = n ? [] : newCards(cards, rev.prog, cur, EXTRA_NEW)
  const st = streak(rev.prog, today)
  return (
    <div className="col g16">
      <div className="head">
        <span className="eyebrow">{DAY_NAMES[now.getDay()]} {now.getDate()} {MONTH_NAMES[now.getMonth()].toUpperCase()} · ZONE {p2(cur)}</span>
        <h1 className="h-screen">Aujourd’hui</h1>
      </div>
      <div className="kpis">
        <div className="kpi"><b>{due.length}</b><span>CARTES À REVOIR</span></div>
        <div className="kpi"><b>{fresh.length}</b><span>NOUVELLES · {NEW_PER_DAY} MAX</span></div>
        <div className="kpi"><b style={{ color: 'var(--amber)' }}>{st}</b><span>{st > 1 ? 'JOURS' : 'JOUR'} DE SUITE</span></div>
      </div>
      {n
        ? <button className="go" onClick={() => startSession('self', 'daily', 'Session du jour', [...due, ...fresh])}><b>DÉMARRER LA SESSION DU JOUR ({plural(n, 'CARTE', 'CARTES')})</b><span>ENVIRON {Math.max(1, Math.round(n * SECONDS_PER_CARD / 60))} MIN · QCM</span></button>
        : extra.length
          ? <button className="go" onClick={() => startSession('self', 'extra', 'Nouvelles questions', extra)}><b>VOUS ÊTES À JOUR · {extra.length} NOUVELLES DE PLUS</b><span>ENVIRON {Math.max(1, Math.round(extra.length * SECONDS_PER_CARD / 60))} MIN · COMPTENT DANS VOTRE PROGRESSION</span></button>
          : <button className="go" disabled><b>RIEN À RÉVISER AUJOURD’HUI</b><span>VOUS ÊTES À JOUR · ENTRAÎNEZ-VOUS SUR UNE ZONE</span></button>}
      <LazyWeekBlock />
      <div className="duo">
        <TrainCard />
        <section className="box" aria-labelledby="t-meth">
          <h2 id="t-meth" className="h-sec" style={{ fontSize: '1.1875rem' }}>LA MÉTHODE</h2>
          <ol className="steps">
            <li><b>01</b><span>Lisez la question et cherchez la réponse de mémoire.</span></li>
            <li><b>02</b><span>Choisissez parmi les quatre propositions, puis validez.</span></li>
            <li><b>03</b><span>Bonne réponse : la carte revient à J+1, J+3, J+7, J+21, puis J+60. Mauvaise : elle revient en fin de session, puis le lendemain.</span></li>
          </ol>
        </section>
      </div>
    </div>
  )
}
