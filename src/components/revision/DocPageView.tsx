import { useEffect, useState } from 'react'
import { useApp } from '../../AppContext'
import { ZONES } from '../../lib/constants'
import type { DocPage, DocSection } from '../../lib/docPage'
import { p2, plural } from '../../lib/format'
import { allCards } from '../../lib/srs'
import { Md } from '../Md'

type Load = 'loading' | 'ok' | 'missing' | 'error'

function Box({ kind, items }: { kind: 'retenir' | 'attention'; items: readonly string[] }) {
  if (!items.length) return null
  const retenir = kind === 'retenir'
  return (
    <div className={retenir ? 'ret' : 'vg'} role="note">
      <strong className="f-lbl" style={{ fontSize: '0.6875rem', color: retenir ? 'var(--green)' : 'var(--stamp)' }}>{retenir ? '★ À RETENIR' : '! ATTENTION'}</strong>
      <ul>{items.map((t, k) => <li key={k}><Md text={t} /></li>)}</ul>
    </div>
  )
}

function Section({ s, n }: { s: DocSection; n: number }) {
  return (
    <section className="dash">
      <h3><span className="mono" style={{ color: 'var(--acc)', marginRight: 8 }}>{p2(n)}</span>{s.h}</h3>
      <ul>{s.items.map((it, k) => <li key={k}><Md text={it} /></li>)}</ul>
      <Box kind="retenir" items={s.retenir} />
      <Box kind="attention" items={s.attention} />
      {s.src && <span className="d-meta" style={{ fontSize: '0.6875rem', lineHeight: 1.5 }}>DANS LE DOCUMENT · {s.src.toUpperCase()}</span>}
    </section>
  )
}

/** Objectifs et sections d'une page (aussi l'aperçu de l'éditeur Admin). */
export function PageContent({ page }: { page: DocPage }) {
  return (
    <>
      {!!page.objectifs.length && (
        <div className="ret" role="note">
          <strong className="f-lbl" style={{ fontSize: '0.6875rem', color: 'var(--green)' }}>OBJECTIFS · APRÈS CETTE PAGE, TU SAIS…</strong>
          <ul>{page.objectifs.map((o, k) => <li key={k}><Md text={o} /></li>)}</ul>
        </div>
      )}
      {page.sections.map((s, i) => <Section key={i} s={s} n={i + 1} />)}
    </>
  )
}

/** Page de révision d'un document (2026-10-18) : objectifs, sections guidées, puis les questions reliées au document. */
export function DocPageView() {
  const { ui, rev, pages, docById, offline, go, openCardDoc, startSession } = useApp()
  const id = ui.sel ?? 0
  const d = docById(id)
  const page = pages.page(id)
  // L'affichage suit la page présente (copie locale ou base) ; `load` ne dit que ce qui se passe quand il n'y en a pas.
  const [load, setLoad] = useState<Load>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (offline) { setLoad('missing'); return }
    let alive = true
    setLoad('loading')
    pages.load(id).then(r => { if (alive) setLoad(r) })
    return () => { alive = false }
  }, [id, offline, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => go('fiches', d ? { fiche: d.th } : {})
  const cards = allCards(rev.content).filter(c => c.doc === id)
  if (!d) return <p className="note-box">Ce document n’est plus dans la bibliothèque.</p>
  return (
    <div className="col g16">
      <button className="btn-mono" style={{ alignSelf: 'flex-start' }} onClick={back}>← FICHES DE LA ZONE {p2(d.th)}</button>
      <article className="sheet r10 fiche">
        <div className="band" style={{ background: 'var(--green)', padding: '10px 16px', letterSpacing: 0 }}>
          <span>PAGE DE RÉVISION · ZONE {p2(d.th)} · {ZONES[d.th - 1][1].toUpperCase()}</span>
          <span>{page ? plural(page.sections.length, 'SECTION', 'SECTIONS') : ''}</span>
        </div>
        <div className="fiche-body">
          <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <h2>{d.title}</h2>
            {page && <button className="ink-line no-print" onClick={() => window.print()}>Imprimer / PDF</button>}
          </div>
          {!page && load === 'loading' && <p className="mono" role="status" style={{ color: 'var(--acc)' }}>CHARGEMENT…</p>}
          {!page && load === 'error' && (
            <p className="warn-inline" role="alert" style={{ margin: 0 }}>
              <span>La page n’a pas pu être chargée. Vérifiez la connexion.</span>
              <button className="btn-mono" onClick={() => setAttempt(a => a + 1)}>RÉESSAYER</button>
            </p>
          )}
          {!page && load === 'missing' && (
            <p className="note-box" role="status">{offline
              ? 'Cette page n’a pas encore été ouverte sur cet appareil : elle sera lisible hors réseau une fois ouverte en ligne.'
              : 'Ce document n’a pas encore de page de révision. Le document lui-même reste lisible.'}</p>
          )}
          {page && <PageContent page={page} />}
          <div className="two no-print">
            <button className="ink-line big" onClick={() => openCardDoc(id)}>Lire le document</button>
            {cards.length > 0 && (
              <button className="ink-btn big" onClick={() => startSession('self', 'theme', `Page · ${d.title}`, cards)}>
                S’auto-tester · {plural(cards.length, 'question', 'questions')}
              </button>
            )}
          </div>
        </div>
      </article>
    </div>
  )
}
