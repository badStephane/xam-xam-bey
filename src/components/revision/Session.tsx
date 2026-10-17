import { useEffect, useRef } from 'react'
import { useApp } from '../../AppContext'
import { GRADE_ASK, MAX_LV, ZONES } from '../../lib/constants'
import { keyPoints, p2 } from '../../lib/format'
import { combo, gradeCounts, positionXp, replayCount, suggestedGrade } from '../../lib/session'
import { isSelfCheck } from '../../lib/qcm'
import { cardLevel } from '../../lib/srs'
import type { Card, Choices, Grade } from '../../lib/types'
import { Md } from '../Md'
import { CardDocLink } from './CardDocLink'
import { ForcedOutNotice, OfflineNotice } from './OfflineNotice'

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
        <button className="ink-line" style={{ padding: '0 10px', font: '700 0.6875rem/1 var(--f-mono)' }} onClick={() => patch({ hideAns: !ui.hideAns })} aria-pressed={ui.hideAns}>{ui.hideAns ? 'AFFICHER' : 'MASQUER'}</button>
      </div>
      {ui.hideAns
        ? <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--ink2)' }}>Réponse masquée. Touchez « Afficher » quand la personne ne voit plus l’écran.</p>
        : (
          <>
            <p style={{ margin: 0, fontSize: '0.96875rem', lineHeight: 1.55 }}><Md text={c.a} /></p>
            {c.note && <Vigilance note={c.note} size={14} />}
            <CardDocLink card={c} />
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

const LETTERS = ['A', 'B', 'C', 'D']

/** QCM du mode « Je réponds » : choisir, valider, puis voir la correction et la réponse complète. */
function QcmBlock({ c, ch }: { c: Card; ch: Choices }) {
  const { ui, pick, validate } = useApp()
  const s = ui.session!
  const right = s.rev && s.picked === ch.correct
  const state = (k: number) => (!s.rev ? (s.picked === k ? 'sel' : '') : k === ch.correct ? 'ok' : k === s.picked ? 'ko' : 'dim')
  return (
    <>
      <div className="qcm" role="radiogroup" aria-label="Propositions">
        {ch.options.map((o, k) => (
          <button key={k} className={`opt ${state(k)}`} role="radio" aria-checked={s.picked === k} disabled={s.rev} onClick={() => pick(k)}>
            <i aria-hidden="true">{s.rev && k === ch.correct ? '✓' : s.rev && k === s.picked ? '✕' : LETTERS[k]}</i>
            <span>{o}</span>
          </button>
        ))}
      </div>
      {!s.rev && <button className="flip" onClick={validate} disabled={s.picked === null}>Valider<kbd>ENTRÉE</kbd></button>}
      {s.rev && (
        <>
          <div className={`verdict ${right ? 'ok' : 'ko'}`} role="status">{right ? `✓ BONNE RÉPONSE${positionXp(s) ? ` · +${positionXp(s)} XP` : ''}` : '✕ MAUVAISE RÉPONSE · LA CARTE REVIENDRA'}</div>
          <div className="verso"><i />RÉPONSE<i /></div>
          <p className="answer" tabIndex={-1}><Md text={c.a} /></p>
          {c.note && <Vigilance note={c.note} size={14.5} />}
          {c.src && <span className="src">SOURCE · {c.src}</span>}
          <CardDocLink card={c} />
        </>
      )}
    </>
  )
}

/**
 * Auto-évaluation (IM-6) : aucune mauvaise proposition disponible, donc pas de QCM à une seule réponse.
 * On répond de tête, on découvre la réponse, puis on se note honnêtement.
 */
function SelfCheckBlock({ c }: { c: Card }) {
  const { ui, reveal, answer } = useApp()
  const s = ui.session!
  const knewRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (s.rev) knewRef.current?.focus({ preventScroll: true }) }, [s.rev])
  if (!s.rev) {
    return (
      <>
        <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--ink2)' }}>Pas de propositions pour cette question : répondez de tête, puis vérifiez.</p>
        <button className="flip" onClick={reveal}>Voir la réponse</button>
      </>
    )
  }
  return (
    <>
      <div className="verso"><i />RÉPONSE<i /></div>
      <p className="answer" tabIndex={-1}><Md text={c.a} /></p>
      {c.note && <Vigilance note={c.note} size={14.5} />}
      {c.src && <span className="src">SOURCE · {c.src}</span>}
      <CardDocLink card={c} />
      <div className="row" role="group" aria-label="Notez-vous">
        <button ref={knewRef} className="ink-btn big" onClick={() => answer(2)}>✓ Je savais</button>
        <button className="ink-line big" onClick={() => answer(0)}>✕ Je ne savais pas</button>
      </div>
    </>
  )
}

const QUIT_TEXT = {
  self: { q: 'Quitter ? Vos réponses déjà données sont gardées.', yes: 'QUITTER' },
  ask: { q: 'Terminer l’interrogation ? Les réponses déjà notées sont gardées.', yes: 'TERMINER' },
}

/**
 * Confirmation légère en ligne avant de quitter (UX-14), pas de modale. Le retour Android termine la séance sans
 * la demander (comportement du lot 2) : une seule confirmation, jamais deux.
 */
function QuitConfirm({ ask }: { ask: boolean }) {
  const { ui, cancelQuit, confirmQuit } = useApp()
  const stayRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (ui.quitAsk) stayRef.current?.focus({ preventScroll: true }) }, [ui.quitAsk])
  const t = QUIT_TEXT[ask ? 'ask' : 'self']
  return (
    <div id="quit-confirm" aria-live="polite">
      {ui.quitAsk && (
        <div className="warn-inline" role="group" aria-labelledby="quit-q" style={{ margin: 0, borderColor: 'var(--amber)', background: 'var(--amber-soft)' }}>
          <span id="quit-q">{t.q}</span>
          <div className="row" style={{ gap: 8 }}>
            <button ref={stayRef} className="btn-mono" onClick={cancelQuit}>CONTINUER</button>
            <button className="btn-mono" onClick={confirmQuit}>{t.yes}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Aide clavier (bureau) : seulement les touches qui agissent sur la carte affichée (IM-11). */
function kbdHint(ask: boolean, selfCheck: boolean): string {
  if (ask) return '1 FAUX · 2 PARTIEL · 3 JUSTE · ÉCHAP : TERMINER'
  if (selfCheck) return 'ÉCHAP : QUITTER'
  return '1 À 4 : CHOISIR · ENTRÉE : VALIDER PUIS CONTINUER · ÉCHAP : QUITTER'
}

export function Session() {
  const { ui, rev, mobile, answer, next, quitSession } = useApp()
  const s = ui.session
  // Règle des hooks (FE-12) : tous les hooks avant le retour anticipé.
  const questionRef = useRef<HTMLHeadingElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const quitRef = useRef<HTMLButtonElement>(null)
  const quitAsked = useRef(ui.quitAsk)
  const index = s?.i
  const current = s ? s.queue[Math.min(s.i, s.queue.length - 1)] : undefined
  const selfCheck = !!current?.ch && isSelfCheck(current.ch)
  const revealedSelf = !!s && s.rev && s.mode !== 'ask' && !selfCheck
  useEffect(() => { if (index !== undefined) questionRef.current?.focus({ preventScroll: true }) }, [index])
  useEffect(() => { if (revealedSelf) nextRef.current?.focus({ preventScroll: true }) }, [revealedSelf])
  // « Continuer » ou Échap : le focus revient au bouton QUITTER, sauf s'il est déjà ailleurs dans la carte.
  useEffect(() => {
    const closed = quitAsked.current && !ui.quitAsk
    quitAsked.current = ui.quitAsk
    if (closed && (!document.activeElement || document.activeElement === document.body || document.activeElement.closest('#quit-confirm'))) quitRef.current?.focus({ preventScroll: true })
  }, [ui.quitAsk])
  if (!s) return null
  const ask = s.mode === 'ask'
  const it = s.queue[Math.min(s.i, s.queue.length - 1)]
  const c = it.c
  const lv = cardLevel(rev.prog, c.id)
  const cnt = gradeCounts(s.res)
  const kps = ask ? keyPoints(c.a) : []
  const checked = kps.filter((_, k) => ui.checks[k]).length
  const sugg = suggestedGrade(kps.length, checked)
  const hot = (g: Grade) => sugg === g && g > 0
  return (
    <div className="sess">
      <div className="sess-top">
        <button ref={quitRef} className="btn-mono" onClick={quitSession} aria-expanded={ui.quitAsk} aria-controls="quit-confirm">{ask ? 'TERMINER' : '✕ QUITTER'}</button>
        <div className="segs" role="progressbar" aria-label="Progression" aria-valuemin={0} aria-valuemax={s.queue.length} aria-valuenow={s.i}>
          {s.queue.map((_, k) => <span key={k} className={k < s.i ? 'done' : k === s.i ? 'now' : undefined} />)}
        </div>
        <span className="mono" role="status" aria-label={`Carte ${Math.min(s.i + 1, s.queue.length)} sur ${s.queue.length}`} style={{ fontSize: '0.75rem', fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{p2(Math.min(s.i + 1, s.queue.length))}/{p2(s.queue.length)}</span>
      </div>
      <QuitConfirm ask={ask} />
      <OfflineNotice />
      {!ask && <ForcedOutNotice />}
      {ask
        ? (
          <div className="askbar">
            <span style={{ font: '700 0.8125rem/1 var(--f-hud)', letterSpacing: '.08em' }}>J’INTERROGE · {(s.name || 'la personne').toUpperCase()}</span>
            <span className="mono" style={{ fontSize: '0.75rem', fontWeight: 700 }}><span style={{ color: 'var(--acc)' }}>{cnt[2]}</span> JUSTES · <span style={{ color: 'var(--amber)' }}>{cnt[1]}</span> PARTIELS · <span style={{ color: 'var(--err)' }}>{cnt[0]}</span> FAUX</span>
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
            {!ask && it.ch && (selfCheck ? <SelfCheckBlock c={c} /> : <QcmBlock c={c} ch={it.ch} />)}
          </div>
        </article>
      </div>
      {ask && (
        <div className="rates" role="group" aria-label="Notez la réponse">
          {GRADE_ASK.map(([label, hint], g) => (
            <button key={g} className={`rate r${g}${hot(g as Grade) ? ' hot' : ''}`} style={{ minHeight: 68 }}
              onClick={() => answer(g as Grade)} aria-label={`${label.slice(2).toLowerCase()}, touche ${g + 1}`}>{label}<span>{hint}</span></button>
          ))}
        </div>
      )}
      {!ask && s.rev && !selfCheck && <button ref={nextRef} className="go" style={{ minHeight: 64 }} onClick={next}><b>{s.i + 1 < s.queue.length ? 'CARTE SUIVANTE →' : 'VOIR LE BILAN →'}</b></button>}
      {!mobile && <p className="kbd-hint">{kbdHint(ask, selfCheck)}</p>}
    </div>
  )
}
