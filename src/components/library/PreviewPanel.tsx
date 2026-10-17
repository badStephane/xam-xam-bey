import { useApp } from '../../AppContext'
import { TYPE_NAME, ZONES } from '../../lib/constants'
import { mo, p2 } from '../../lib/format'
import type { Doc } from '../../lib/types'
import { LazyPdfViewer } from './LazyPdfViewer'

export const docFormat = (d: Doc): string => `${TYPE_NAME[d.ty]} · ${d.pages ? `${d.pages} p. · ` : ''}${mo(d.size)} Mo`

/** Aperçu latéral (ordinateur). */
export function PreviewPanel({ d }: { d: Doc }) {
  const { patch, offline, pages, go } = useApp()
  return (
    <aside className="panel" aria-label="Aperçu de la pièce">
      <div className="sheet r10">
        <div className="panel-h"><span>{d.cote}</span><button onClick={() => patch({ sel: null })} aria-label="Fermer l’aperçu">✕</button></div>
        <div className="col g12" style={{ padding: 14 }}>
          <h2 style={{ margin: 0, font: '800 1.3125rem/1.15 var(--f-doc)' }}>{d.title}</h2>
          {pages.ids.has(d.id) && <button className="ink-btn" onClick={() => go('page', { sel: d.id })}>Page de révision</button>}
          <div className="pdf-thumb"><LazyPdfViewer key={d.id} file={d.file} title={d.title} maxPages={1} /></div>
          <dl className="facts">
            <dt>FONDS</dt><dd>{d.folder}</dd>
            <dt>FORMAT</dt><dd>{docFormat(d)}</dd>
            <dt>ZONE</dt><dd>{p2(d.th)} · {ZONES[d.th - 1][2]}</dd>
          </dl>
          {/* Hors réseau, ces liens partent vers le stockage et seraient morts (E3). */}
          {!offline && (
            <div className="two">
              <a className="ink-line" href={d.download} download>Télécharger</a>
              <a className="ink-btn" href={d.file} target="_blank" rel="noopener">Plein écran</a>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
