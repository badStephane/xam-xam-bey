import { useState } from 'react'
import { useApp } from '../../AppContext'
import { useLeague } from '../../hooks/useLeague'
import { cacheTimeLabel, countdownLabel, lastResultText, leagueName, promotedCount, readSeenResult, weekLabel, writeSeenResult, type LeagueState } from '../../lib/league'
import { setLeagueOptIn } from '../../lib/leagueApi'
import { ProgressChips } from '../revision/ProgressChips'
import { useRevisionOffline } from '../revision/OfflineNotice'
import { LeagueIcon } from './icons'
import { LeagueBoard } from './LeagueBoard'
import { PseudoForm } from './PseudoForm'

const SMALL_GROUP = 10
const INVITE = 'Comparez votre semaine avec une vingtaine de scouts. Seul votre pseudo est visible, jamais votre nom ni votre e-mail.'
export const welcomeText = (tier: number, pseudo: string): string => `Bienvenue en ${leagueName(tier)}, ${pseudo}. Vos prochaines cartes comptent pour la semaine.`

function localStore(): Storage | null {
  try { return window.localStorage } catch { return null }
}

function Skeleton() {
  return (
    <div className="col g6" role="status" aria-label="Chargement du classement">
      <div className="skel-line" style={{ height: 28, width: '60%' }} />
      {Array.from({ length: 8 }, (_, i) => <div key={i} className="skel-line" style={{ height: 48 }} />)}
    </div>
  )
}

function LastResult({ state }: { state: LeagueState }) {
  const { rev } = useApp()
  const r = state.lastResult
  const [hidden, setHidden] = useState(() => !r || !rev.userId || readSeenResult(localStore(), rev.userId) === r.weekStart)
  if (hidden || !r) return null
  const close = () => { if (rev.userId) writeSeenResult(localStore(), rev.userId, r.weekStart); setHidden(true) }
  return (
    <section className="box lg-last" aria-labelledby="lg-last-h">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="lg-last-h" className="h-sec">SEMAINE PASSÉE</h2>
        <button className="btn-mono" onClick={close}>✕ FERMER</button>
      </div>
      <p style={{ margin: 0 }}>{lastResultText(r)}</p>
    </section>
  )
}

function Rules() {
  return (
    <details className="lg-rules">
      <summary>Comment ça marche ?</summary>
      <ul>
        <li>La semaine va du lundi au dimanche 20 h. Chaque semaine repart de 0 XP.</li>
        <li>Une carte notée rapporte de l’XP de ligue une fois par jour : 10 XP pour un QCM réussi, 5 XP pour une carte en auto-évaluation. 30 cartes par jour au plus.</li>
        <li>Les premiers du groupe (50 XP au moins) montent ; les derniers descendent, sauf avec 100 XP ou plus dans la semaine.</li>
        <li>Une semaine sans révision ne change pas votre ligue.</li>
      </ul>
    </details>
  )
}

function Quit({ onDone }: { onDone(): void }) {
  const offline = useRevisionOffline()
  const [ask, setAsk] = useState(false)
  const [err, setErr] = useState(false)
  const quit = async () => {
    const r = await setLeagueOptIn(false)
    if (!r.ok) { setErr(true); return }
    setAsk(false)
    onDone()
  }
  if (!ask) return <button className="btn-mono" style={{ alignSelf: 'flex-start' }} disabled={offline} onClick={() => setAsk(true)}>QUITTER LES LIGUES</button>
  return (
    <div className="box col g8" role="group" aria-label="Quitter les ligues">
      <p style={{ margin: 0 }}>Quitter les ligues ? Votre pseudo disparaît des classements tout de suite. Vos XP, niveaux, badges et défis restent à vous.</p>
      {err && <span className="field-err" role="alert">La demande n’a pas pu être envoyée. Vérifiez la connexion puis réessayez.</span>}
      <div className="row"><button className="btn" onClick={() => setAsk(false)}>RESTER</button><button className="btn acc" onClick={quit}>QUITTER</button></div>
    </div>
  )
}

/** Contenu selon le statut du contrat (L5-3). */
function Body({ state, onJoined }: { state: LeagueState; onJoined(p: string): void }) {
  const { go } = useApp()
  const offline = useRevisionOffline()
  switch (state.status) {
    case 'no_pseudo':
    case 'reset':
      return (
        <section className="box" aria-label="Rejoindre les ligues">
          <p style={{ margin: 0 }}>{state.status === 'reset' ? 'Votre pseudo a été retiré par un responsable. Choisissez-en un autre pour réapparaître dans les ligues.' : INVITE}</p>
          <PseudoForm onDone={onJoined} />
        </section>
      )
    case 'opted_out':
      // L5-2 : quitter libère le pseudo ; revenir = en choisir un (retour dans la dernière ligue atteinte).
      return (
        <section className="box" aria-label="Revenir dans les ligues">
          <p style={{ margin: 0 }}>Vous ne participez pas aux ligues. Vos XP, niveaux, badges et défis restent à vous. Choisissez un pseudo pour revenir.</p>
          <PseudoForm onDone={onJoined} />
        </section>
      )
    case 'not_started':
      return (
        <section className="box">
          <p style={{ margin: 0 }}>Notez une carte pour entrer dans un groupe de cette semaine.</p>
          <button className="btn acc" style={{ alignSelf: 'flex-start' }} onClick={() => go('revision', { session: null })}>DÉMARRER LA SESSION DU JOUR</button>
        </section>
      )
    case 'pending':
      return <p className="banner" role="status"><b>RÉSULTATS LUNDI MATIN</b><span style={{ fontSize: '0.875rem' }}>Les classements de la semaine sont en cours de calcul.</span></p>
    default:
      return <LeagueBoard state={state} canReport={!offline} />
  }
}

/** Écran Ligue (16-design §4.1), chargé à la demande. */
export function LeagueScreen() {
  const { now } = useApp()
  const lg = useLeague(0)
  const [welcome, setWelcome] = useState<string | null>(null)
  const s = lg.data
  const n = s?.groupSize ?? s?.group.length ?? 0
  const up = s ? s.upCount ?? promotedCount(n, s.tier) : 0
  const joined = (p: string) => { setWelcome(welcomeText(s?.tier ?? 1, p)); void lg.reload() }
  const inLeague = !!s && ['active', 'not_started', 'pending'].includes(s.status)
  return (
    <div className="col g16 league">
      <ProgressChips />
      <div className="head">
        {s && <span className="eyebrow">{weekLabel(s.weekStart, s.weekEnd)} · {countdownLabel(now, s.weekEnd)}</span>}
        <h1 className="h-screen row" style={{ gap: 10 }}>{s && <LeagueIcon tier={s.tier} />}{s ? leagueName(s.tier) : 'Ligue'}</h1>
        {s?.status === 'active' && <p className="muted" style={{ margin: 0 }}>Groupe de {n}{up ? ` · les ${up} premiers montent` : ''}</p>}
        {s?.status === 'active' && n < SMALL_GROUP && <p className="muted" style={{ margin: 0 }}>Le groupe se remplit au fil de la semaine.</p>}
        {s && <span className="lbl">{s.weekXp} XP CETTE SEMAINE</span>}
      </div>
      {welcome && <p className="banner" role="status"><span style={{ fontSize: '0.875rem' }}>{welcome}</span></p>}
      {lg.load === 'offline' && (
        <p className="banner" role="status"><b>HORS RÉSEAU</b><span style={{ fontSize: '0.875rem' }}>{lg.at
          ? `Hors réseau : classement de la dernière connexion (${cacheTimeLabel(lg.at)}).`
          : 'Hors réseau : le classement s’affichera au retour du réseau. Vos révisions comptent quand même.'}</span></p>
      )}
      {lg.load === 'error' && (
        <div className="warn-inline" role="alert">
          <span>Le classement n’a pas pu être chargé. Vérifiez la connexion puis touchez Réessayer.</span>
          <button className="btn-mono" onClick={() => void lg.reload()}>RÉESSAYER</button>
        </div>
      )}
      {!s && lg.load === 'loading' && <Skeleton />}
      {s && <LastResult state={s} />}
      {s && <Body state={s} onJoined={joined} />}
      {s && lg.load !== 'offline' && (
        <div className="row">
          <button className="btn-mono" onClick={() => void lg.reload()} disabled={lg.load === 'loading'}>ACTUALISER</button>
          {lg.at && <span className="lbl">À {cacheTimeLabel(lg.at).replace(/^\S+ /, '').toUpperCase()}</span>}
        </div>
      )}
      <Rules />
      {inLeague && s?.pseudo && lg.load !== 'offline' && <Quit onDone={() => { setWelcome(null); void lg.reload() }} />}
    </div>
  )
}
