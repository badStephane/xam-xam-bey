import { useApp } from '../../AppContext'
import { TYPE_NAME, ZONES } from '../../lib/constants'
import { mo, p2 } from '../../lib/format'
import type { Doc } from '../../lib/types'

export const docFormat = (d: Doc): string => `${TYPE_NAME[d.ty]} · ${d.pages ? `${d.pages} p. · ` : ''}${mo(d.size)} Mo`

/** Aperçu latéral (ordinateur). */
export function PreviewPanel({ d }: { d: Doc }) {
  const { patch } = useApp()
  return (
    <aside className="panel" aria-label="Aperçu de la pièce">
      <div className="sheet r10">
        <div className="panel-h"><span>{d.cote}</span><button onClick={() => patch({ sel: null })} aria-label="Fermer l’aperçu">✕</button></div>
        <div className="col g12" style={{ padding: 14 }}>
          <h2 style={{ margin: 0, font: '800 21px/1.15 var(--f-doc)' }}>{d.title}</h2>
          <div className="pdf-thumb"><iframe key={d.id} src={`${d.file}#page=1&toolbar=0&view=FitH`} title={`Aperçu de ${d.title}`} loading="lazy" /></div>
          <dl className="facts">
            <dt>FONDS</dt><dd>{d.folder}</dd>
            <dt>FORMAT</dt><dd>{docFormat(d)}</dd>
            <dt>ZONE</dt><dd>{p2(d.th)} · {ZONES[d.th - 1][2]}</dd>
          </dl>
          <div className="two">
            <a className="ink-line" href={d.file} download>Télécharger</a>
            <a className="ink-btn" href={d.file} target="_blank" rel="noopener">Plein écran</a>
          </div>
        </div>
      </div>
    </aside>
  )
}
