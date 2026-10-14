import { useApp } from '../../AppContext'
import { ASK_COUNTS, EXAM_SIZE, ZONES } from '../../lib/constants'
import { p2, plural, shuffle } from '../../lib/format'
import { ALL_ZONES, inZone, SCOPES, selectCards } from '../../lib/practice'
import { allCards } from '../../lib/srs'

const EMPTY_TEXT = {
  all: 'Les cartes de cette zone seront publiées au début du mois. Les documents sont déjà dans la bibliothèque.',
  gaps: 'Aucune lacune ici : toutes les cartes déjà vues sont bien sues. Choisissez « Tout » ou une autre zone.',
  new: 'Toutes les cartes de cette sélection ont déjà été vues. Choisissez « Mes lacunes » ou « Tout ».',
}

/** Entraînement libre : n'importe quelle zone (ou toutes), tout / mes lacunes / jamais vues, en QCM ou en interrogation. */
export function TrainCard() {
  const { ui, rev, patch, startSession } = useApp()
  const cards = allCards(rev.content)
  const ask = ui.mode === 'ask'
  const scope = ask ? 'all' : ui.scope
  const zoneLabel = ui.practice === ALL_ZONES ? 'Toutes les zones' : `Zone ${p2(ui.practice)}`
  const available = selectCards(cards, rev.prog, ui.practice, scope, Infinity)
  const n = Math.min(ui.askCount, available.length)
  const scopeLabel = scope === 'gaps' ? 'Lacunes · ' : scope === 'new' ? 'Nouvelles · ' : ''
  const start = () => {
    const picked = selectCards(cards, rev.prog, ui.practice, scope, ui.askCount)
    if (ask) startSession('ask', 'ask', `Interrogation · ${zoneLabel}`, picked)
    else startSession('self', scope === 'gaps' ? 'gaps' : 'theme', `${scopeLabel}${zoneLabel}`, picked)
  }
  const exam = () => startSession(ui.mode, ask ? 'ask' : 'exam', `Mini-examen · ${zoneLabel}`, shuffle(inZone(cards, ui.practice)).slice(0, EXAM_SIZE))
  const examSize = Math.min(EXAM_SIZE, inZone(cards, ui.practice).length)
  return (
    <section className="sheet r10 train" aria-labelledby="t-train">
      <h2 id="t-train">S’entraîner à la carte</h2>
      <div className="col g6">
        <label htmlFor="zone-sel" className="f-lbl">ZONE</label>
        <select id="zone-sel" className="field" value={ui.practice} onChange={e => patch({ practice: Number(e.target.value) })}>
          <option value={ALL_ZONES}>Toutes les zones · {plural(cards.length, 'carte', 'cartes')}</option>
          {ZONES.map(([, , theme], i) => {
            const k = (rev.content.cards[i + 1] || []).length
            return <option key={i} value={i + 1}>Zone {p2(i + 1)} · {theme}{k ? '' : ' (à venir)'}</option>
          })}
        </select>
      </div>
      <div className="col g6">
        <span id="t-mode" className="f-lbl">QUI RÉPOND ?</span>
        <div className="two" role="radiogroup" aria-labelledby="t-mode" style={{ gap: 6 }}>
          <button className="mode-btn" role="radio" aria-checked={!ask} onClick={() => patch({ mode: 'self' })}><strong>Je réponds</strong><span>QCM corrigé automatiquement. Compte dans ma progression.</span></button>
          <button className="mode-btn" role="radio" aria-checked={ask} onClick={() => patch({ mode: 'ask' })}><strong>J’interroge</strong><span>Je pose les questions à quelqu’un et je le note.</span></button>
        </div>
      </div>
      {!ask && (
        <div className="col g6">
          <span id="t-scope" className="f-lbl">QUOI RÉVISER ?</span>
          <div className="seg3" role="radiogroup" aria-labelledby="t-scope">
            {SCOPES.map(([k, label]) => <button key={k} role="radio" aria-checked={ui.scope === k} onClick={() => patch({ scope: k })} style={{ fontSize: '0.6875rem' }}>{label}</button>)}
          </div>
        </div>
      )}
      {ask && (
        <div className="col g6">
          <label htmlFor="ask-name" className="f-lbl">PERSONNE INTERROGÉE · FACULTATIF</label>
          <input id="ask-name" className="field" value={ui.askName} onChange={e => patch({ askName: e.target.value })} placeholder="Prénom" autoComplete="off" maxLength={40} />
        </div>
      )}
      <div className="col g6">
        <span id="t-count" className="f-lbl">NOMBRE DE QUESTIONS</span>
        <div className="seg3" role="radiogroup" aria-labelledby="t-count">
          {ASK_COUNTS.map(c => <button key={c} role="radio" aria-checked={ui.askCount === c} onClick={() => patch({ askCount: c })}>{c}</button>)}
        </div>
      </div>
      {n > 0
        ? (
          <div className="two">
            <button className="ink-btn big" style={{ minHeight: 50 }} onClick={start}>{ask ? 'Interroger' : 'Réviser'} · {plural(n, 'question', 'questions')}</button>
            <button className="ink-line big" style={{ minHeight: 50 }} onClick={exam} disabled={!examSize}>Mini-examen · {examSize} questions</button>
          </div>
        )
        : <p className="note-box">{EMPTY_TEXT[inZone(cards, ui.practice).length ? scope : 'all']}</p>}
    </section>
  )
}
