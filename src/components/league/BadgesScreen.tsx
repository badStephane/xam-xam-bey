import { useMemo, useState } from 'react'
import { useApp } from '../../AppContext'
import { useGrade } from '../../hooks/useGrade'
import { useLeague } from '../../hooks/useLeague'
import { localBadges, recordSeenDates, serverBadges, type BadgeStatus } from '../../lib/badges'
import { GRADES } from '../../lib/grades'
import { challengeCount, challengeTitle, countdownLabel } from '../../lib/league'
import { shortDate } from '../../lib/format'
import { PARAMS } from '../../lib/params'
import { xpLevel } from '../../lib/srs'
import { Segments } from '../Segments'
import { ProgressChips } from '../revision/ProgressChips'
import { BadgeIcon } from './icons'

const LEAGUE_MAX_AGE = 5 * 60_000
const BAR = 10

function localStore(): Storage | null {
  try { return window.localStorage } catch { return null }
}

function Tile({ b, date }: { b: BadgeStatus; date: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button className={`badge-tile${b.earned ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <BadgeIcon earned={b.earned} />
        <b>{b.name}{b.count > 1 ? ` ×${b.count}` : ''}</b>
        <span className="lbl">{b.earned ? (date ?? 'OBTENU') : `À DÉBLOQUER · ${b.progress[0]}/${b.progress[1]}`}</span>
        {open && <span className="badge-rule">{b.rule}</span>}
      </button>
    </li>
  )
}

/** Écran Badges et grade (16-design §4.2), chargé à la demande. Badges personnels toujours affichés, même hors ligne. */
export function BadgesScreen() {
  const { rev, today, now } = useApp()
  const lg = useLeague(LEAGUE_MAX_AGE)
  const grade = useGrade(rev.userId, rev.prog, rev.status === 'ready')
  const lvl = xpLevel(rev.prog.xp)
  const local = useMemo(() => localBadges(rev.prog, rev.content.cards), [rev.prog, rev.content.cards])
  const server = lg.data ? serverBadges(lg.data.badges, lg.data.tier) : serverBadges([], 1)
  const all = [...local, ...server]
  const seen = useMemo(() => (rev.userId && !PARAMS.frame && !PARAMS.demo ? recordSeenDates(localStore(), rev.userId, local, today) : {}), [rev.userId, local, today])
  const serverDate = (id: string): string | null => {
    const code = id === 'polar' ? 'polar_star' : id
    const at = lg.data?.badges.filter(b => b.badge === code).map(b => b.earnedAt).sort().pop()
    return at ? shortDate(Math.floor(Date.parse(at) / 864e5)) : null
  }
  const dateOf = (b: BadgeStatus): string | null => (b.server ? serverDate(b.id) : seen[b.id] ? shortDate(seen[b.id]) : null)
  const earned = all.filter(b => b.earned).length
  const ch = lg.data?.challenge
  const next = grade.next
  const share = next ? Math.max(0, Math.min(1, (rev.prog.xp - GRADES[grade.index].from) / (next.from - GRADES[grade.index].from))) : 1
  const loadingFirst = !lg.data && lg.load === 'loading'
  return (
    <div className="col g16">
      <ProgressChips />
      <div className="head">
        <span className="eyebrow">GRADE : {grade.name.toUpperCase()} · NIV. {lvl.lv}</span>
        <h1 className="h-screen">Badges</h1>
        <Segments className="bar10 gm" count={BAR} on={Math.round(share * BAR)} />
        <span className="lbl">{rev.prog.xp} XP{next ? ` · ${next.name} à ${next.from} XP` : ' · GRADE LE PLUS HAUT'}</span>
      </div>
      {lg.load === 'offline' && lg.data && <p className="banner" role="status"><b>HORS RÉSEAU</b><span style={{ fontSize: 14 }}>Hors réseau : badges de ligue et de défi de la dernière connexion.</span></p>}
      {lg.load === 'error' && (
        <div className="warn-inline" role="alert">
          <span>Les badges de ligue et de défi n’ont pas pu être chargés.</span>
          <button className="btn-mono" onClick={() => void lg.reload()}>RÉESSAYER</button>
        </div>
      )}
      {ch && (
        <section className="box" aria-labelledby="bd-ch">
          <h2 id="bd-ch" className="h-sec">DÉFI DE LA SEMAINE</h2>
          <p style={{ margin: 0 }}>{challengeTitle(ch)} · {challengeCount(ch)}{lg.data ? ` · ${countdownLabel(now, lg.data.weekEnd).toLowerCase()}` : ''}</p>
          <Segments className="bar10 gm" count={BAR} on={Math.round(BAR * Math.min(1, ch.progress / ch.target))} />
        </section>
      )}
      <h2 className="h-sec" style={{ margin: 0 }}>{earned} BADGE{earned > 1 ? 'S' : ''} SUR {all.length}</h2>
      {!earned && <p className="muted" style={{ margin: 0 }}>Votre premier badge : notez une carte.</p>}
      {loadingFirst
        ? <ul className="badge-grid" role="status" aria-label="Chargement des badges">{Array.from({ length: 6 }, (_, i) => <li key={i} className="skel-line" style={{ height: 112 }} />)}</ul>
        : <ul className="badge-grid">{all.map(b => <Tile key={b.id} b={b} date={dateOf(b)} />)}</ul>}
      <section className="box" aria-labelledby="bd-grades">
        <h2 id="bd-grades" className="h-sec">ÉCHELLE DES GRADES</h2>
        <ol className="grade-ladder">
          {GRADES.map((g, i) => (
            <li key={g.name} aria-current={i === grade.index ? 'step' : undefined}>
              <span>{g.name}</span><span className="mono muted">{g.from} XP</span>{i === grade.index && <b className="lbl" style={{ color: 'var(--acc)' }}>VOUS ÊTES ICI</b>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
