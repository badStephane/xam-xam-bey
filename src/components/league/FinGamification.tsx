import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../AppContext'
import { useLeague } from '../../hooks/useLeague'
import { localBadges, newlyEarned, serverBadges } from '../../lib/badges'
import { pseudoAskKey } from '../../lib/gameKeys'
import { DAILY_LEAGUE_CARDS, gradedToday, utcDay } from '../../lib/gradeQueue'

/** A6 : 300 XP de ligue par jour au plus. */
const DAILY_LEAGUE_XP = 300
import { challengeCount, leagueName, myRow, ordinal, type LeagueState } from '../../lib/league'
import { setLeagueOptIn } from '../../lib/leagueApi'
import { REDO } from '../../lib/session'
import type { Session } from '../../lib/types'
import { useRevisionOffline } from '../revision/OfflineNotice'
import { welcomeText } from './LeagueScreen'
import { PseudoForm } from './PseudoForm'

const SYNC_WAIT_MS = 15_000
const MAX_SHOWN_BADGES = 3

function localStore(): Storage | null {
  try { return window.localStorage } catch { return null }
}

function inLeague(s: LeagueState | null): boolean {
  return !!s && !!s.pseudo && ['active', 'not_started', 'pending'].includes(s.status)
}

/** Ligne de ligue du bilan : valeur lue après l'envoi des notes. */
function LeagueLine({ data, previous, load, redo, capped }: { data: LeagueState | null; previous: LeagueState | null; load: string; redo: boolean; capped: boolean }) {
  const offline = useRevisionOffline()
  if (!inLeague(data) || !data) return null
  const me = myRow(data)
  const before = previous && previous.weekStart === data.weekStart ? myRow(previous) : null
  const gain = me && before ? before.rank - me.rank : 0
  let line: JSX.Element
  if (offline) line = <span>Hors réseau : votre place sera mise à jour au retour du réseau.</span>
  else if (load === 'loading') line = <span className="skel-line" style={{ height: 18, width: '70%' }} aria-label="Chargement de votre place" />
  else if (load === 'error') line = <span>Place non disponible pour le moment.</span>
  else line = <b className="mono">{leagueName(data.tier).toUpperCase()} · {data.weekXp} XP CETTE SEMAINE{me ? ` · ${ordinal(me.rank).toUpperCase()} SUR ${data.groupSize ?? data.group.length}` : ''}{gain > 0 ? ` ▲${gain}` : ''}</b>
  return (
    <div className="col g6">
      {line}
      {redo && <span className="muted" style={{ fontSize: 14 }}>Cartes déjà comptées aujourd’hui pour la ligue.</span>}
      {!redo && capped && <span className="muted" style={{ fontSize: 14 }}>Plafond du jour atteint (300 XP) : les cartes suivantes comptent pour votre niveau, pas pour la ligue.</span>}
    </div>
  )
}

function Invite({ tier, onJoined }: { tier: number; onJoined(): void }) {
  const { rev, go } = useApp()
  const [step, setStep] = useState<'ask' | 'form' | 'no' | 'done'>('ask')
  const [pseudo, setPseudo] = useState('')
  useEffect(() => {
    // Proposé une seule fois en fin de séance (16-design P-A) : marqué dès l'affichage.
    if (!rev.userId) return
    try { if (!localStore()?.getItem(pseudoAskKey(rev.userId))) localStore()?.setItem(pseudoAskKey(rev.userId), 'shown') } catch { /* stockage bloqué */ }
  }, [rev.userId])
  if (step === 'no') return null
  if (step === 'done') {
    return (
      <section className="box fade-in" role="status">
        <p style={{ margin: 0 }}>{welcomeText(tier, pseudo)}</p>
        <button className="btn-mono" style={{ alignSelf: 'flex-start' }} onClick={() => go('ligue')}>VOIR MA LIGUE</button>
      </section>
    )
  }
  const refuse = () => {
    // « Non merci » définitif (P-A) : retenu sur l'appareil et par le serveur (set_league_opt_in(false), L5-2).
    try { if (rev.userId) localStore()?.setItem(pseudoAskKey(rev.userId), 'no') } catch { /* stockage bloqué */ }
    void setLeagueOptIn(false).then(r => { if (!r.ok) console.error('[xxb] « Non merci » non enregistré', r.error) })
    setStep('no')
  }
  return (
    <section className="box" aria-labelledby="fin-join">
      <h2 id="fin-join" className="h-sec">REJOINDRE LES LIGUES ?</h2>
      <p style={{ margin: 0 }}>Comparez votre semaine avec une vingtaine de scouts. Seul votre pseudo est visible, jamais votre nom ni votre e-mail.</p>
      {step === 'form'
        ? <PseudoForm onDone={p => { setPseudo(p); setStep('done'); onJoined() }} />
        : <div className="row two-btn"><button className="btn acc" onClick={() => setStep('form')}>CHOISIR UN PSEUDO</button><button className="btn" onClick={refuse}>NON MERCI</button></div>}
    </section>
  )
}

/** Blocs du bilan (16-design P-C) : ligue, nouveaux badges, défi, invitation. Chaque bloc seulement s'il a du contenu. */
export function FinGamification({ session }: { session: Session }) {
  const { rev, sessionStartProg, go } = useApp()
  const offline = useRevisionOffline()
  const startSeq = useRef(rev.weekSync.seq)
  const [synced, setSynced] = useState(() => !rev.isSyncPending())
  useEffect(() => {
    if (synced) return
    if (rev.weekSync.seq !== startSeq.current || rev.saveErr) { setSynced(true); return }
    const t = setTimeout(() => setSynced(true), SYNC_WAIT_MS)
    return () => clearTimeout(t)
  }, [synced, rev.weekSync.seq, rev.saveErr])
  const lg = useLeague(0, synced)
  const [askable] = useState(() => {
    try { return !!rev.userId && !localStore()?.getItem(pseudoAskKey(rev.userId)) } catch { return false }
  })
  const fresh = useMemo(() => {
    const local = sessionStartProg ? newlyEarned(localBadges(sessionStartProg, rev.content.cards), localBadges(rev.prog, rev.content.cards)) : []
    const server = lg.previous && lg.data ? newlyEarned(serverBadges(lg.previous.badges, lg.previous.tier), serverBadges(lg.data.badges, lg.data.tier)) : []
    return [...local, ...server]
  }, [sessionStartProg, rev.prog, rev.content.cards, lg.previous, lg.data])
  const ch = lg.data?.challenge
  const justDone = !!ch?.done && !!lg.previous?.challenge && !lg.previous.challenge.done
  const challengeBadge = serverBadges(lg.data?.badges ?? [], 1)[0]
  // Plafond : XP du jour donnée par le serveur ; sinon cartes notées aujourd'hui sur l'appareil (A6).
  const capped = lg.data?.todayXp != null ? lg.data.todayXp >= DAILY_LEAGUE_XP : !!rev.userId && gradedToday(localStore(), rev.userId, utcDay(Date.now())) >= DAILY_LEAGUE_CARDS
  const showInvite = askable && !offline && lg.load === 'ready' && lg.data?.status === 'no_pseudo'
  // Une fois affichée, l'invitation reste en place (bienvenue après le choix, même si le statut change).
  const [inviteOn, setInviteOn] = useState(false)
  useEffect(() => { if (showInvite) setInviteOn(true) }, [showInvite])
  return (
    <div className="col g10 fin-game">
      <LeagueLine data={lg.data} previous={lg.previous} load={lg.load} redo={session.kind === REDO} capped={capped} />
      {fresh.slice(0, MAX_SHOWN_BADGES).map(b => (
        <section key={b.id} className="box fade-in" role="status">
          <b>Nouveau badge : {b.name}{b.count > 1 ? ` ×${b.count}` : ''}</b>
          <span className="muted" style={{ fontSize: 14 }}>{b.rule}</span>
        </section>
      ))}
      {fresh.length > MAX_SHOWN_BADGES && <p className="muted" style={{ margin: 0 }}>et {fresh.length - MAX_SHOWN_BADGES} autres</p>}
      {fresh.length > 0 && <button className="btn-mono" style={{ alignSelf: 'flex-start' }} onClick={() => go('badges')}>VOIR MES BADGES</button>}
      {ch && (
        <p className="mono" style={{ margin: 0 }} role={justDone ? 'status' : undefined}>
          {justDone ? `Défi relevé ! Badge Défi relevé ×${Math.max(1, challengeBadge.count)}.` : `DÉFI : ${challengeCount(ch)}`}
        </p>
      )}
      {(showInvite || inviteOn) && lg.data && <Invite tier={lg.data.tier} onJoined={() => void lg.reload()} />}
    </div>
  )
}
