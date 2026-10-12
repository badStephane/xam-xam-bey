import { useApp } from '../../AppContext'
import { ASK_COUNTS, DAY_NAMES, EXAM_SIZE, MONTH_NAMES, NEW_PER_DAY, SECONDS_PER_CARD, ZONE_REVIEW_SIZE, ZONES } from '../../lib/constants'
import { p2, plural, shuffle } from '../../lib/format'
import { allCards, dailyCards, streak } from '../../lib/srs'

function TrainCard() {
  const { ui, rev, patch, startSession } = useApp()
  const cards = rev.content.cards[ui.practice] || []
  const ask = ui.mode === 'ask'
  const zone = `Zone ${p2(ui.practice)}`
  const reviseZone = () => {
    const pool = shuffle(cards)
    if (ask) startSession('ask', 'ask', 'Interrogation', pool.slice(0, ui.askCount))
    else startSession('self', 'theme', zone, pool.slice(0, ZONE_REVIEW_SIZE))
  }
  const exam = () => startSession(ui.mode, ask ? 'ask' : 'exam', `Mini-examen · ${zone}`, shuffle(cards).slice(0, EXAM_SIZE))
  return (
    <section className="sheet r10 train" aria-labelledby="t-train">
      <h2 id="t-train">S’entraîner sur une zone</h2>
      <div className="col g6">
        <label htmlFor="zone-sel" className="f-lbl">ZONE</label>
        <select id="zone-sel" className="field" value={ui.practice} onChange={e => patch({ practice: Number(e.target.value) })}>
          {ZONES.map(([, , theme], i) => <option key={i} value={i + 1}>Zone {p2(i + 1)} · {theme}{(rev.content.cards[i + 1] || []).length ? '' : ' (à venir)'}</option>)}
        </select>
      </div>
      <div className="col g6">
        <span id="t-mode" className="f-lbl">QUI RÉPOND ?</span>
        <div className="two" role="radiogroup" aria-labelledby="t-mode" style={{ gap: 6 }}>
          <button className="mode-btn" role="radio" aria-checked={!ask} onClick={() => patch({ mode: 'self' })}><strong>Je réponds</strong><span>QCM corrigé automatiquement. Compte dans ma progression.</span></button>
          <button className="mode-btn" role="radio" aria-checked={ask} onClick={() => patch({ mode: 'ask' })}><strong>J’interroge</strong><span>Je pose les questions à quelqu’un et je le note.</span></button>
        </div>
      </div>
      {ask && (
        <>
          <div className="col g6">
            <label htmlFor="ask-name" className="f-lbl">PERSONNE INTERROGÉE · FACULTATIF</label>
            <input id="ask-name" className="field" value={ui.askName} onChange={e => patch({ askName: e.target.value })} placeholder="Prénom" autoComplete="off" maxLength={40} />
          </div>
          <div className="col g6">
            <span id="t-count" className="f-lbl">NOMBRE DE QUESTIONS</span>
            <div className="seg3" role="radiogroup" aria-labelledby="t-count">
              {ASK_COUNTS.map(c => <button key={c} role="radio" aria-checked={ui.askCount === c} onClick={() => patch({ askCount: c })}>{c}</button>)}
            </div>
          </div>
        </>
      )}
      {cards.length
        ? (
          <div className="two">
            <button className="ink-btn big" style={{ minHeight: 50 }} onClick={reviseZone}>{ask ? `Interroger · ${Math.min(ui.askCount, cards.length)} questions` : 'Réviser la zone'}</button>
            <button className="ink-line big" style={{ minHeight: 50 }} onClick={exam}>Mini-examen · {Math.min(EXAM_SIZE, cards.length)} questions</button>
          </div>
        )
        : <p className="note-box">Les cartes de cette zone seront publiées au début du mois. Les documents sont déjà dans la bibliothèque.</p>}
    </section>
  )
}

export function Today() {
  const { rev, now, today, cur, startSession } = useApp()
  const { due, fresh } = dailyCards(allCards(rev.content), rev.prog, today, cur)
  const n = due.length + fresh.length
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
        : <button className="go" disabled><b>RIEN À RÉVISER AUJOURD’HUI</b><span>VOUS ÊTES À JOUR · ENTRAÎNEZ-VOUS SUR UNE ZONE</span></button>}
      <div className="duo">
        <TrainCard />
        <section className="box" aria-labelledby="t-meth">
          <h2 id="t-meth" className="h-sec" style={{ fontSize: 19 }}>LA MÉTHODE</h2>
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
