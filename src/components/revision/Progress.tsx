import { useApp } from '../../AppContext'
import { ACQUIRED_LV, ASK_COUNTS, CHART_DAYS, LEVEL_LABELS, ZONES } from '../../lib/constants'
import { dayDate, p2, shortDate, zoneColor } from '../../lib/format'
import { ALL_ZONES, selectCards, zoneReport } from '../../lib/practice'
import { allCards, bestStreak, levelBuckets, seenCurve, streak, xpLevel, zoneStats } from '../../lib/srs'
import { Segments } from '../Segments'

const CHART_W = 320
const CHART_H = 110
const lvColor = (i: number) => (i === 0 ? 'transparent' : `color-mix(in oklch, var(--acc) ${Math.round(i / (LEVEL_LABELS.length - 1) * 100)}%, var(--bg))`)

function ChartBox() {
  const { rev, today } = useApp()
  const days = seenCurve(rev.prog, today, CHART_DAYS)
  const max = Math.max(1, days[days.length - 1].v)
  const nOn = days.filter(d => d.on).length
  const line = days.map((p, i) => `${i ? 'L' : 'M'}${(i * CHART_W / (CHART_DAYS - 1)).toFixed(1)} ${(104 - p.v / max * 96).toFixed(1)}`).join('')
  return (
    <section className="box" style={{ gap: 8 }} aria-labelledby="t-curve">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 id="t-curve" className="h-sec">JOURS DE RÉVISION</h2>
        <span className="lbl">{shortDate(days[0].d).toUpperCase()} → {shortDate(today).toUpperCase()}</span>
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" role="img" style={{ width: '100%', height: 120, display: 'block' }}
        aria-label={`Cartes vues cumulées sur ${CHART_DAYS} jours, jusqu’à ${max}. Révision ${nOn} jours sur ${CHART_DAYS}.`}>
        <path d={`${line}L${CHART_W} ${CHART_H}L0 ${CHART_H}Z`} style={{ fill: 'var(--acc-soft)' }} />
        <path d={line} style={{ fill: 'none', stroke: 'var(--acc)', strokeWidth: 2.5, strokeLinejoin: 'round' }} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="days" aria-hidden="true">{days.map(p => <span key={p.d} className={p.on ? 'on' : undefined}>{dayDate(p.d).getUTCDate()}</span>)}</div>
      <span className="lbl" style={{ fontSize: 10.5 }}>COURBE : CARTES VUES (CUMUL) · CASES : JOURS RÉVISÉS ({nOn} SUR {CHART_DAYS})</span>
    </section>
  )
}

function ExamsBox() {
  const { rev } = useApp()
  const exams = rev.prog.sessions.filter(s => s.k === 'exam').slice(-3).reverse()
  return (
    <section className="box" style={{ gap: 6 }} aria-labelledby="t-exam">
      <h2 id="t-exam" className="h-sec" style={{ marginBottom: 4 }}>MINI-EXAMENS</h2>
      {exams.length ? exams.map((s, i) => {
        const r = s.n ? s.ok / s.n : 0
        return (
          <div key={i} className="exam">
            <span className="mono muted" style={{ fontSize: 11 }}>{shortDate(s.d)}</span>
            <span style={{ fontSize: 14 }}>{s.l || 'Mini-examen'}</span>
            <strong style={{ font: '700 18px/1 var(--f-hud)', color: r >= 0.8 ? 'var(--acc)' : r >= 0.6 ? 'var(--hud)' : 'var(--err)' }}>{s.ok}<span style={{ fontSize: 12, color: 'var(--hud2)' }}>/{s.n}</span></strong>
          </div>
        )
      }) : <p className="muted" style={{ margin: 0, fontSize: 14 }}>Aucun mini-examen pour le moment.</p>}
    </section>
  )
}

const GAP_SESSION_SIZE = ASK_COUNTS[ASK_COUNTS.length - 1]
const pct = (r: number | null) => (r === null ? '–' : `${Math.round(r * 100)} %`)
const rateColor = (r: number | null) => (r === null ? 'var(--hud2)' : r >= 0.8 ? 'var(--acc)' : r >= 0.6 ? 'var(--amber)' : 'var(--err)')

/** Où sont mes lacunes : réussite et cartes faibles par zone, avec un raccourci pour les retravailler. */
function GapsBox() {
  const { rev, startSession } = useApp()
  const cards = allCards(rev.content)
  const all = zoneReport(cards, rev.prog, ALL_ZONES)
  const rows = ZONES.map((_, i) => zoneReport(cards, rev.prog, i + 1)).filter(r => r.cards > 0)
  const revise = (zone: number) => startSession('self', 'gaps', `Lacunes · ${zone === ALL_ZONES ? 'Toutes les zones' : `Zone ${p2(zone)}`}`,
    selectCards(cards, rev.prog, zone, 'gaps', GAP_SESSION_SIZE))
  return (
    <section className="box" aria-labelledby="t-gaps">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="t-gaps" className="h-sec">MES LACUNES</h2>
        <span className="lbl">RÉUSSITE GLOBALE <b style={{ color: rateColor(all.rate) }}>{pct(all.rate)}</b></span>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Une lacune est une carte ratée récemment, ou réussie moins de 6 fois sur 10.</p>
      {all.gaps > 0 && <button className="go" style={{ minHeight: 56 }} onClick={() => revise(ALL_ZONES)}><b>RÉVISER MES {all.gaps} LACUNES</b><span>TOUTES ZONES · {Math.min(all.gaps, GAP_SESSION_SIZE)} QUESTIONS AU PLUS</span></button>}
      {!all.seen && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Répondez à quelques cartes : vos lacunes apparaîtront ici, zone par zone.</p>}
      <ul className="col g8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map(r => (
          <li key={r.zone} className="gap-row">
            <span className="row mono" style={{ gap: 6, fontWeight: 700, fontSize: 10.5, flexWrap: 'nowrap' }}><span aria-hidden="true" style={{ width: 8, height: 8, transform: 'rotate(45deg)', background: zoneColor(r.zone) }} />{p2(r.zone)} {ZONES[r.zone - 1][0].toUpperCase()}</span>
            <span className="mono muted" style={{ fontSize: 11 }}>{r.seen}/{r.cards} VUES</span>
            <b className="mono" style={{ fontSize: 13, color: rateColor(r.rate) }}>{pct(r.rate)}</b>
            {r.gaps > 0
              ? <button className="btn-mono" onClick={() => revise(r.zone)} aria-label={`Réviser les ${r.gaps} lacunes de la zone ${r.zone}`}>{r.gaps} LACUNE{r.gaps > 1 ? 'S' : ''} →</button>
              : <span className="mono muted" style={{ fontSize: 11, textAlign: 'right' }}>{r.seen ? 'AUCUNE' : '—'}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Progress() {
  const { rev, today } = useApp()
  const cards = allCards(rev.content)
  const lvl = xpLevel(rev.prog.xp)
  const buckets = levelBuckets(cards, rev.prog)
  const acq = buckets.slice(ACQUIRED_LV + 1).reduce((a, b) => a + b, 0)
  const total = cards.length || 1
  return (
    <div className="col g16">
      <div className="head">
        <span className="eyebrow">NIV. {lvl.lv} · {lvl.rank.toUpperCase()} · {lvl.xp} XP</span>
        <h1 className="h-screen">Progression</h1>
        <p style={{ margin: 0 }} className="muted">{acq} cartes acquises sur {cards.length} publiées. Une carte est acquise au niveau {ACQUIRED_LV}.</p>
      </div>
      <div className="kpis k4">
        <div className="kpi"><b style={{ color: 'var(--amber)' }}>{streak(rev.prog, today)}</b><span>SÉRIE ACTUELLE</span></div>
        <div className="kpi"><b>{bestStreak(rev.prog)}</b><span>MEILLEURE SÉRIE</span></div>
        <div className="kpi"><b style={{ color: 'var(--acc)' }}>{acq}</b><span>CARTES ACQUISES</span></div>
        <div className="kpi"><b>{lvl.xp}</b><span>XP TOTAL</span></div>
      </div>
      <GapsBox />
      <div className="duo">
        <section className="box" style={{ gap: 10 }} aria-labelledby="t-acq">
          <h2 id="t-acq" className="h-sec">CARTES ACQUISES PAR ZONE</h2>
          <ul className="col g8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {ZONES.map(([abbr], i) => {
              const n = i + 1
              const st = zoneStats(rev.content.cards[n], rev.prog)
              return (
                <li key={n} className="zrow">
                  <span className="row mono" style={{ gap: 6, fontWeight: 700, fontSize: 10.5, flexWrap: 'nowrap' }}><span aria-hidden="true" style={{ width: 8, height: 8, transform: 'rotate(45deg)', background: zoneColor(n) }} />{p2(n)} {abbr.toUpperCase()}</span>
                  <Segments className="bar10" count={10} on={st.cards ? Math.round(10 * st.acq / st.cards) : 0} colorOn={zoneColor(n)} />
                  <span className="mono muted" style={{ fontSize: 11, textAlign: 'right' }}>{st.cards ? `${st.acq}/${st.cards}` : 'à venir'}</span>
                </li>
              )
            })}
          </ul>
        </section>
        <div className="col g14"><ChartBox /><ExamsBox /></div>
      </div>
      <section className="box" aria-labelledby="t-lvl">
        <h2 id="t-lvl" className="h-sec">NIVEAUX DE MAÎTRISE · {cards.length} CARTES</h2>
        <div className="levels" role="img" aria-label={`Répartition : ${LEVEL_LABELS.map((l, i) => `${l.toLowerCase()} ${buckets[i]}`).join(', ')}`}>
          {buckets.map((b, i) => (b ? <span key={i} style={{ width: `${(b / total * 100).toFixed(1)}%`, background: lvColor(i) }} /> : null))}
        </div>
        <ul className="lv-legend">
          {buckets.map((b, i) => (
            <li key={i}>
              <span className="row mono muted" style={{ gap: 6, fontSize: 10, fontWeight: 700 }}><span aria-hidden="true" style={{ width: 10, height: 10, background: lvColor(i), border: '1px solid var(--line)' }} />{i ? `NIV. ${i - 1}` : 'NON VUES'}</span>
              <b style={{ font: '700 20px/1 var(--f-hud)' }}>{b}</b>
              <span className="muted" style={{ fontSize: 12 }}>{LEVEL_LABELS[i]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
