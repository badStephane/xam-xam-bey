import { useState } from 'react'
import { useRevisionOffline } from '../revision/OfflineNotice'
import { pseudoHue, rowName, TOP_TIER, type LeagueRow, type LeagueState, type Zone } from '../../lib/league'
import { reportPseudo } from '../../lib/leagueApi'

const ZONE_LABEL: Record<Zone, string> = { up: '▲ ZONE DE MONTÉE', stay: '— ZONE DE MAINTIEN —', down: '▼ ZONE DE DESCENTE' }
const PODIUM = 3

interface Block { label: string; zone: Zone; rows: LeagueRow[] }

/** Classement découpé par zone ; Étoile polaire : podium à la place de la zone de montée ; Piste : pas de zone de descente. */
export function boardBlocks(s: Pick<LeagueState, 'group' | 'tier'>): Block[] {
  const zoneOf = (r: LeagueRow): Zone => (r.zone === 'down' && s.tier <= 1 ? 'stay' : r.zone === 'up' && s.tier >= TOP_TIER ? 'stay' : r.zone)
  const labelOf = (r: LeagueRow, z: Zone): string => (s.tier >= TOP_TIER && r.rank <= PODIUM ? '★ PODIUM' : ZONE_LABEL[z])
  return s.group.reduce<Block[]>((acc, r) => {
    const z = zoneOf(r)
    const label = labelOf(r, z)
    const last = acc[acc.length - 1]
    return last && last.label === label ? [...acc.slice(0, -1), { ...last, rows: [...last.rows, r] }] : [...acc, { label, zone: z, rows: [r] }]
  }, [])
}

function Report({ row }: { row: LeagueRow }) {
  const offline = useRevisionOffline()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'limit' | 'error'>('idle')
  const send = async () => {
    setState('busy')
    const r = await reportPseudo(row.id)
    setState(r.ok ? 'done' : r.error.message === 'RATE_LIMITED' ? 'limit' : 'error')
  }
  if (state === 'done') return <p className="lg-note" role="status">Signalé. Un responsable va vérifier.</p>
  return (
    <div className="col g6 lg-note">
      <button className="btn-mono" onClick={send} disabled={offline || state === 'busy'}>SIGNALER CE PSEUDO</button>
      {offline && <span className="muted" style={{ fontSize: '0.8125rem' }}>Le signalement demande du réseau.</span>}
      {state === 'limit' && <span role="alert" className="field-err">Trop de signalements aujourd’hui. Réessayez demain.</span>}
      {state === 'error' && <span role="alert" className="field-err">Le signalement n’a pas pu être envoyé. Réessayez.</span>}
    </div>
  )
}

function Row({ row, open, toggle }: { row: LeagueRow; open: boolean; toggle(): void }) {
  const body = (
    <>
      <span className="lg-rank mono">{row.rank}</span>
      <span className="lg-ava" aria-hidden="true" style={{ background: `oklch(0.62 0.1 ${pseudoHue(row.pseudo)})` }}>{[...row.pseudo][0]?.toUpperCase()}</span>
      <span className="lg-name">{row.pseudo}</span>
      <span className="lg-xp mono">{row.xp} XP{row.isMe && <b className="lg-me"> VOUS</b>}</span>
    </>
  )
  if (row.isMe) return <li className="lg-row me" aria-label={rowName(row)}>{body}</li>
  return (
    <li className="lg-item">
      <button className="lg-row" aria-expanded={open} aria-label={rowName(row)} onClick={toggle}>{body}</button>
      {open && <Report row={row} />}
    </li>
  )
}

/** Classement du groupe (16-design §4.1) : lignes de 48 px, zones avec icône et texte, jamais la couleur seule. */
export function LeagueBoard({ state, canReport }: { state: LeagueState; canReport: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="col g6">
      {boardBlocks(state).map(b => (
        <section key={`${b.label}-${b.rows[0].rank}`} className={`lg-zone ${b.zone}`} aria-label={b.label.replace(/[▲▼★—]/g, '').trim()}>
          <p className="lbl lg-sep" aria-hidden="true">{b.label}</p>
          <ol className="lg-list" start={b.rows[0].rank}>
            {b.rows.map(r => <Row key={r.id} row={r} open={canReport && open === r.id} toggle={() => setOpen(o => (o === r.id || !canReport ? null : r.id))} />)}
          </ol>
        </section>
      ))}
    </div>
  )
}
