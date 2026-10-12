import { useApp } from '../../AppContext'
import { ZONES } from '../../lib/constants'
import { p2, plain, zoneColor, zoneYear } from '../../lib/format'
import { zoneStats } from '../../lib/srs'
import { Segments } from '../Segments'

function cadenceItem(t: string): { h: string; t: string } {
  const s = plain(t)
  const ix = s.indexOf(':')
  if (ix <= 0) return { h: s, t: '' }
  const rest = s.slice(ix + 1).trim()
  return { h: s.slice(0, ix).trim(), t: rest.charAt(0).toUpperCase() + rest.slice(1) }
}

export function Plan() {
  const { rev, cur } = useApp()
  const months = rev.content.plan?.months || []
  const cadence = rev.content.plan?.cadence || []
  return (
    <div className="col g16">
      <div className="head">
        <span className="eyebrow">{ZONES[0][1].toUpperCase()} {zoneYear(1)} → {ZONES[11][1].toUpperCase()} {zoneYear(12)}</span>
        <h1 className="h-screen">Plan annuel</h1>
        <p style={{ margin: 0, maxWidth: 600 }} className="muted">Une zone par mois. Les cartes acquises restent en révision toute l’année.</p>
      </div>
      <ol className="months">
        {ZONES.map(([, month, theme], i) => {
          const n = i + 1
          const st = zoneStats(rev.content.cards[n], rev.prog)
          const isCur = n === cur
          return (
            <li key={n} className={`month${isCur ? ' cur' : ''}`} aria-current={isCur ? 'step' : undefined}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="diamond" aria-hidden="true" style={{ background: zoneColor(n) }} />
                <span className="f-lbl" style={{ fontSize: 11, letterSpacing: 0 }}>ZONE {p2(n)} · {month.toUpperCase()} {zoneYear(n)}</span>
                {isCur && <span className="stamp" style={{ marginLeft: 'auto' }}>EN COURS</span>}
              </div>
              <h2>{theme}</h2>
              <p>{plain(months.find(m => m.n === n)?.o)}</p>
              <div className="col" style={{ gap: 5 }}>
                <Segments className="bar10" count={10} on={st.cards ? Math.round(10 * st.acq / st.cards) : 0} />
                <span className="mono" style={{ fontSize: 11, opacity: 0.85 }}>{st.cards ? `${st.acq} / ${st.cards} CARTES ACQUISES` : `CARTES PUBLIÉES EN ${month.toUpperCase()}`}</span>
              </div>
            </li>
          )
        })}
      </ol>
      {cadence.length > 0 && (
        <section className="box" aria-labelledby="t-cad">
          <h2 id="t-cad" className="h-sec" style={{ fontSize: 19 }}>RYTHME CONSEILLÉ</h2>
          <div className="cadence">{cadence.map(cadenceItem).map(c => <div key={c.h}><strong>{c.h}</strong>{c.t && <span>{c.t}</span>}</div>)}</div>
        </section>
      )}
    </div>
  )
}
