import { useEffect, useRef } from 'react'
import { useApp } from '../../AppContext'
import { GRADE_ASK, GRADE_SELF, MAX_LV, ZONES } from '../../lib/constants'
import { keyPoints, p2 } from '../../lib/format'
import { combo, gradeCounts, replayCount, suggestedGrade } from '../../lib/session'
import { cardLevel } from '../../lib/srs'
import type { Card, Grade } from '../../lib/types'
import { Md } from '../Md'

function Vigilance({ note, size }: { note: string; size: number }) {
  return <div className="vigil" role="note"><b>! VIGILANCE · SOURCES EN DÉSACCORD</b><span style={{ fontSize: size, lineHeight: 1.5 }}>{note}</span></div>
}

/** Panneau de l'examinateur (mode « J’interroge ») : réponse attendue, points clés cochables. */
function Examiner({ c, kps, checked }: { c: Card; kps: string[]; checked: number }) {
  const { ui, patch } = useApp()
  const sugg = suggestedGrade(kps.length, checked)
  return (
    <div className="examiner">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <span className="f-lbl" style={{ color: 'var(--green)' }}>RÉPONSE ATTENDUE · POUR VOUS SEUL</span>
        <button className="ink-line" style={{ minHeight: 36, padding: '0 10px', font: '700 10px/1 var(--f-mono)' }} onClick={() => patch({ hideAns: !ui.hideAns })} aria-pressed={ui.hideAns}>{ui.hideAns ? 'AFFICHER' : 'MASQUER'}</button>
      </div>
      {ui.hideAns
        ? <p style={{ margin: 0, fontSize: 14, color: 'var(--ink2)' }}>Réponse masquée. Touchez « Afficher » quand la personne ne voit plus l’écran.</p>
        : (
          <>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55 }}><Md text={c.a} /></p>
            {c.note && <Vigilance note={c.note} size={14} />}
            {kps.length > 0 && (
              <>
                <span className="f-lbl" style={{ color: 'var(--ink2)', paddingTop: 4 }}>POINTS CLÉS CITÉS</span>
                <div className="col" style={{ gap: 4 }}>
                  {kps.map((t, k) => (
                    <button key={k} className="kp" role="checkbox" aria-checked={!!ui.checks[k]} onClick={() => patch({ checks: { ...ui.checks, [k]: !ui.checks[k] } })}>
                      <i aria-hidden="true">{ui.checks[k] ? '✓' : ''}</i>{t}
                    </button>
                  ))}
                </div>
                <span className="d-meta">{checked} POINT{checked > 1 ? 'S' : ''} SUR {kps.length} · SUGGESTION : {sugg === null ? '' : GRADE_ASK[sugg][0].slice(2)}</span>
              </>
            )}
          </>
        )}
    </div>
  )
}

export function Session() {
  const { ui, rev, mobile, reveal, answer, quitSession } = useApp()
  const s = ui.session
  if (!s) return null
  const ask = s.mode === 'ask'
  const it = s.queue[Math.min(s.i, s.queue.length - 1)]
  const c = it.c
  const lv = cardLevel(rev.prog, c.id)
  const cnt = gradeCounts(s.res)
  const kps = ask ? keyPoints(c.a) : []
  const checked = kps.filter((_, k) => ui.checks[k]).length
  const sugg = suggestedGrade(kps.length, checked)
  const hot = (g: Grade) => (ask ? sugg === g && g > 0 : g === 2)
  const questionRef = useRef<HTMLHeadingElement>(null)
  const answerRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { questionRef.current?.focus({ preventScroll: true }) }, [s.i])
  useEffect(() => { if (s.rev && !ask) answerRef.current?.focus({ preventScroll: true }) }, [s.rev, ask])
  return (
    <div className="sess">
      <div className="sess-top">
        <button className="btn-mono" onClick={quitSession}>{ask ? 'TERMINER' : '✕ QUITTER'}</button>
        <div className="segs" role="progressbar" aria-label="Progression" aria-valuemin={0} aria-valuemax={s.queue.length} aria-valuenow={s.i}>
          {s.queue.map((_, k) => <span key={k} className={k < s.i ? 'done' : k === s.i ? 'now' : undefined} />)}
        </div>
        <span className="mono" role="status" aria-label={`Carte ${Math.min(s.i + 1, s.queue.length)} sur ${s.queue.length}`} style={{ fontSize: 12, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{p2(Math.min(s.i + 1, s.queue.length))}/{p2(s.queue.length)}</span>
      </div>
      {ask
        ? (
          <div className="askbar">
            <span style={{ font: '700 13px/1 var(--f-hud)', letterSpacing: '.08em' }}>J’INTERROGE · {(s.name || 'la personne').toUpperCase()}</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}><span style={{ color: 'var(--acc)' }}>{cnt[2]}</span> JUSTES · <span style={{ color: 'var(--amber)' }}>{cnt[1]}</span> PARTIELS · <span style={{ color: 'var(--err)' }}>{cnt[0]}</span> FAUX</span>
          </div>
        )
        : <div className="combo"><span style={{ color: 'var(--amber)' }}>COMBO ×{combo(s)}</span><span style={{ color: 'var(--acc)' }}>+{s.xp} XP</span><span className="muted">À REJOUER {replayCount(s)}</span></div>}
      <div className="qwrap stack">
        <article className="qcard">
          <div className="band" style={{ background: ask ? 'var(--ink)' : 'var(--stamp)' }}><span>ZONE {p2(c.th)} · {ZONES[c.th - 1][2].toUpperCase()}</span><span>{c.id.toUpperCase()}</span></div>
          <div className="qbody">
            <div className="row" style={{ gap: 10 }}>
              {ask
                ? <span className="f-lbl" style={{ padding: '6px 9px', background: 'var(--ink)', color: '#F3AE45' }}>À LIRE À VOIX HAUTE</span>
                : <span className="row f-lbl" style={{ gap: 8, letterSpacing: 0 }}>MAÎTRISE<span className="pips" aria-hidden="true">{Array.from({ length: MAX_LV }, (_, k) => <i key={k} className={k < lv ? 'on' : undefined} />)}</span>{lv} SUR {MAX_LV}</span>}
              {it.second && <span className="stamp" style={{ marginLeft: 'auto', padding: '5px 7px' }}>DEUXIÈME CHANCE</span>}
            </div>
            <h1 ref={questionRef} tabIndex={-1}>{c.q}</h1>
            {ask && <Examiner c={c} kps={kps} checked={checked} />}
            {!ask && !s.rev && <button className="flip" onClick={reveal}>Retourner la carte<kbd>ESPACE</kbd></button>}
            {!ask && s.rev && (
              <>
                <div className="verso"><i />VERSO<i /></div>
                <p className="answer" ref={answerRef} tabIndex={-1}><Md text={c.a} /></p>
                {c.note && <Vigilance note={c.note} size={14.5} />}
                {c.src && <span className="src">SOURCE · {c.src}</span>}
              </>
            )}
          </div>
        </article>
      </div>
      {(ask || s.rev) && (
        <div className="rates" role="group" aria-label={ask ? 'Notez la réponse' : 'Évaluez votre réponse'}>
          {(ask ? GRADE_ASK : GRADE_SELF).map(([label, hint], g) => (
            <button key={g} className={`rate r${g}${hot(g as Grade) ? ' hot' : ''}`} style={ask ? { minHeight: 68 } : undefined}
              onClick={() => answer(g as Grade)} aria-label={`${label.slice(2).toLowerCase()}, touche ${g + 1}`}>{label}<span>{hint}</span></button>
          ))}
        </div>
      )}
      {!mobile && <p className="kbd-hint">{ask ? '1 FAUX · 2 PARTIEL · 3 JUSTE · ÉCHAP : TERMINER' : 'ESPACE : RETOURNER · 1 RATÉ · 2 HÉSITANT · 3 SU · ÉCHAP : QUITTER'}</p>}
    </div>
  )
}
