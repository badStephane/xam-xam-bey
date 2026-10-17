import { useApp } from '../../AppContext'
import { ZONES } from '../../lib/constants'
import { p2, plural, zoneColor } from '../../lib/format'
import { Md } from '../Md'
import { CitedDocs } from './CitedDocs'
import { ZonePages } from './ZonePages'

export function Fiches() {
  const { ui, rev, patch, go } = useApp()
  const n = ui.fiche
  const [, month, theme] = ZONES[n - 1]
  const f = rev.content.fiches[n]
  return (
    <div className="col g16">
      <div className="col g10">
        <h1 className="h-screen">Fiches</h1>
        <div className="chips" role="group" aria-label="Choisir une zone">
          {ZONES.map(([abbr, m, t], i) => (
            <button key={i} className="chip" style={{ minWidth: 56, padding: '0 10px' }} onClick={() => patch({ fiche: i + 1 })} aria-pressed={n === i + 1} aria-label={`${m}, ${t}`}>
              <span aria-hidden="true" style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: zoneColor(i + 1) }} />{p2(i + 1)} {abbr.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <article className="sheet r10 fiche">
        <div className="band" style={{ background: 'var(--green)', padding: '10px 16px', letterSpacing: 0 }}>
          <span>FICHE · ZONE {p2(n)} · {month.toUpperCase()}</span>
          <span>{f ? plural((f.sections || []).length, 'SECTION', 'SECTIONS') : 'À PARAÎTRE'}</span>
        </div>
        <div className="fiche-body">
          <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <h2>{f?.titre || theme}</h2>
            {f && <button className="ink-line no-print" onClick={() => window.print()}>Imprimer / PDF</button>}
          </div>
          {!f && (
            <>
              <p style={{ margin: 0, fontSize: '1rem', color: 'var(--ink2)' }}>Cette fiche sera publiée au début du mois de {month.toLowerCase()}. Les pièces de la zone sont déjà dans la bibliothèque.</p>
              <button className="ink-btn big" style={{ alignSelf: 'flex-start' }} onClick={() => go('bibliotheque', { month: n, q: '', type: 'all', ess: false })}>Voir les pièces de la zone</button>
            </>
          )}
          {f?.intro && <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, color: 'var(--ink2)' }}>{f.intro}</p>}
          {f?.sections?.map((s, i) => (
            <section key={i} className="dash">
              <h3>{s.h}</h3>
              <ul>{(s.items || []).map((it, k) => <li key={k}><Md text={it} /></li>)}</ul>
              {s.src && <span className="d-meta" style={{ fontSize: '0.6875rem', lineHeight: 1.5 }}>SOURCES · {s.src}</span>}
            </section>
          ))}
          {!!f?.vigilance?.length && (
            <div className="vg" role="note">
              <strong className="f-lbl" style={{ fontSize: '0.6875rem', color: 'var(--stamp)' }}>! POINTS DE VIGILANCE · LES SOURCES SE CONTREDISENT</strong>
              <ul>{f.vigilance.map((v, k) => <li key={k}><Md text={v} /></li>)}</ul>
            </div>
          )}
        </div>
      </article>
      <ZonePages zone={n} />
      <CitedDocs zone={n} />
    </div>
  )
}
