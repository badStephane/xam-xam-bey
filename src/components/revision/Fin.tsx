import { useApp } from '../../AppContext'
import { XP_REDO } from '../../lib/constants'
import { gradeCounts, missedCards, REDO } from '../../lib/session'
import { share } from '../../lib/share'
import { Md } from '../Md'
import { CardDocLink } from './CardDocLink'
import { LazyFinGamification } from '../league/lazy'

export function Fin() {
  const { ui, go, patch, startSession } = useApp()
  const s = ui.session
  if (!s) return null
  const ask = s.mode === 'ask'
  const [faux, partiel, juste] = gradeCounts(s.res)
  const n = faux + partiel + juste
  const pct = (v: number) => `${n ? Math.round(v / n * 100) : 0} %`
  const miss = missedCards(s)
  const name = s.name || 'la personne'
  const stamps = ask ? [['FAUX', 'var(--stamp)'], ['PARTIEL', 'var(--ochre)']] : [['FAUSSE', 'var(--stamp)'], ['HÉSITANT', 'var(--ochre)']]
  const f = ask
    ? { tag: 'INTERROGATION TERMINÉE · NE COMPTE PAS DANS VOTRE PROGRESSION', title: `Bilan de ${name}`, list: 'Questions à reprendre', redo: 'REPOSER CES QUESTIONS',
        stats: [[`${String(juste + partiel / 2).replace('.', ',')}/${n}`, 'SCORE', 'var(--hud)'], [pct(juste), 'RÉPONSES JUSTES', 'var(--acc)'], [String(partiel), 'PARTIELLES', 'var(--amber)']],
        chips: [[`✓ JUSTE ${juste}`, 'var(--acc)'], [`~ PARTIEL ${partiel}`, 'var(--amber)'], [`✕ FAUX ${faux}`, 'var(--err)']] }
    : { tag: s.kind === REDO ? `REPRISE TERMINÉE · +${XP_REDO} XP PAR CARTE SUE, NIVEAUX INCHANGÉS` : 'SESSION TERMINÉE', title: 'Quête accomplie', list: 'À retravailler', redo: 'REFAIRE CES CARTES',
        stats: [[`${juste}/${n}`, 'SCORE', 'var(--hud)'], [pct(juste), 'JUSTES DU PREMIER COUP', 'var(--acc)'], [`+${s.xp}`, 'XP GAGNÉS', 'var(--amber)']],
        chips: [[`✓ JUSTES ${juste}`, 'var(--acc)'], [`✕ FAUSSES ${faux}`, 'var(--err)'], ...(partiel ? [[`~ HÉSITANT ${partiel}`, 'var(--amber)']] : [])] }
  // Par startSession : propositions du QCM attribuées et séance gardée pour l'onglet (E2).
  const redo = () => startSession(s.mode, ask ? 'ask' : REDO, ask ? 'Interrogation' : 'Cartes à retravailler', miss, s.name)
  const shareFin = () => {
    const txt = `Xam Xam Bëy · Bilan de ${name} : ${juste} justes, ${partiel} partiels, ${faux} faux sur ${n}.`
    share({ title: 'Bilan Xam Xam Bëy', text: txt }, txt, () => patch({ shared: true }))
  }
  return (
    <div className="fin">
      <div className="col g8"><span className="f-lbl" style={{ fontSize: '0.6875rem', letterSpacing: '.1em', color: 'var(--amber)' }}>{f.tag}</span><h1>{f.title}</h1></div>
      <div className="kpis">{f.stats.map(([v, l, c]) => <div key={l} className="kpi"><b style={{ color: c }}>{v}</b><span>{l}</span></div>)}</div>
      <div className="row" style={{ gap: 6 }}>{f.chips.map(([t, c]) => <span key={t} className="pill" style={{ borderColor: c, color: c }}>{t}</span>)}</div>
      {!ask && <LazyFinGamification session={s} />}
      <section className="col g10">
        <h2 style={{ margin: 0, font: '700 1.375rem/1.1 var(--f-hud)', letterSpacing: '.02em' }}>{f.list}</h2>
        {miss.length
          ? miss.map(card => {
            const [label, color] = stamps[s.res[card.id]]
            return (
              <div key={card.id} className="sheet punch miss">
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="cote">{card.id.toUpperCase()}</span><span className="stamp" style={{ borderColor: color, color, transform: 'rotate(-2deg)' }}>{label}</span></div>
                <strong style={{ font: '800 1.0625rem/1.2 var(--f-doc)' }}>{card.q}</strong>
                <span style={{ fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--ink2)' }}><Md text={card.a} /></span>
                <CardDocLink card={card} />
              </div>
            )
          })
          : <p className="muted" style={{ margin: 0 }}>{n ? 'Rien à retravailler. Toutes les réponses sont justes du premier coup.' : 'Aucune réponse enregistrée.'}</p>}
      </section>
      <div className="row">
        {miss.length > 0 && <button className="btn tall acc" onClick={redo}>{f.redo}</button>}
        {ask && n > 0 && <button className="btn tall" onClick={shareFin}>{ui.shared ? 'BILAN COPIÉ ✓' : 'PARTAGER LE BILAN'}</button>}
        <button className="btn tall" onClick={() => go('revision', { session: null })}>RETOUR À AUJOURD’HUI</button>
      </div>
    </div>
  )
}
