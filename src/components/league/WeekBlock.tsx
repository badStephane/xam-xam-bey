import { useApp } from '../../AppContext'
import { useLeague } from '../../hooks/useLeague'
import { challengeCount, leagueName, myRow, ordinal } from '../../lib/league'
import { PseudoForm } from './PseudoForm'

const MAX_AGE = 5 * 60_000

/** Bloc « Cette semaine » de l'écran Aujourd'hui : défi et place, une petite lecture (copie gardée moins de 5 min). */
export function WeekBlock() {
  const { go } = useApp()
  const lg = useLeague(MAX_AGE)
  const s = lg.data
  if (!s) return lg.load === 'loading' ? <div className="skel-line" style={{ height: 52 }} role="status" aria-label="Chargement de la semaine" /> : null
  const offline = lg.load === 'offline'
  // Parcours jeunes : le pseudo se choisit ici, juste après la première connexion, sans chercher l'écran Ligue.
  // Seulement s'il n'a jamais été choisi : un pseudo retiré ou une sortie des ligues se règlent sur l'écran Ligue.
  if (s.status === 'no_pseudo' && !offline) {
    return (
      <section className="box week-block" aria-labelledby="wk-h">
        <h2 id="wk-h" className="h-sec" style={{ fontSize: '1.0625rem' }}>CHOISIS TON PSEUDO</h2>
        <p style={{ margin: 0 }}>Chaque semaine, compare tes points avec une vingtaine de scouts. Les autres ne voient que ton pseudo.</p>
        <PseudoForm onDone={() => { void lg.reload() }} />
      </section>
    )
  }
  const me = myRow(s)
  const ch = s.challenge
  const league = s.status === 'active' || s.status === 'not_started' || s.status === 'pending'
  return (
    <section className="box week-block" aria-labelledby="wk-h">
      <h2 id="wk-h" className="h-sec" style={{ fontSize: '1.0625rem' }}>CETTE SEMAINE</h2>
      <p className="mono" style={{ margin: 0, fontSize: '0.8125rem' }}>
        {ch && <>DÉFI {challengeCount(ch)}{offline ? ' (dernière connexion)' : ''}</>}
        {ch && league && ' · '}
        {league && <>{leagueName(s.tier).toUpperCase()} {offline ? 'Hors réseau' : me ? ordinal(me.rank).toUpperCase() : ''}</>}
      </p>
      {league && <button className="btn-mono" style={{ alignSelf: 'flex-start' }} onClick={() => go('ligue')}>VOIR MA LIGUE</button>}
    </section>
  )
}
