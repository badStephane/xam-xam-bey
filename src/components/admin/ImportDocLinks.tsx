import { docLinkText, docSummaryText, summarizeDocs } from '../../lib/cardImportDocs'
import type { ImportCard } from '../../lib/cardImport'
import { p2 } from '../../lib/format'

/** Au-delà, le détail par ligne est replié (il reste à un clic) pour garder l'aperçu lisible sur mobile. */
const OPEN_MAX_LINES = 50

/** E4 : document relié à chaque ligne valide dont la colonne Source est remplie, et résumé. */
export function ImportDocLinks({ cards }: { cards: readonly ImportCard[] }) {
  const withSrc = cards.filter(c => c.doc.kind !== 'none')
  const summary = summarizeDocs(cards.map(c => c.doc))
  if (!withSrc.length) return null
  return (
    <div className="col g6">
      <h3 id="imp-doc-h" className="f-lbl" style={{ margin: 0 }}>DOCUMENTS RELIÉS · {summary.linked} SUR {cards.length}</h3>
      <p style={{ margin: 0, fontSize: '0.875rem' }}>{docSummaryText(summary)}</p>
      {summary.ambiguous > 0 && (
        <p className="note-box" role="note">Plusieurs documents de la zone portent le nom indiqué dans certaines lignes : ces questions sont importées sans document, à relier dans l’éditeur.</p>
      )}
      <details open={withSrc.length <= OPEN_MAX_LINES}>
        <summary style={{ cursor: 'pointer', fontSize: '0.875rem', minHeight: 44, display: 'flex', alignItems: 'center' }}>Détail par ligne ({withSrc.length})</summary>
        <ul aria-labelledby="imp-doc-h" className="col g6" style={{ margin: 0, paddingLeft: 18, fontSize: '0.875rem' }}>
          {withSrc.map(c => (
            <li key={c.line}>
              <strong>Ligne {c.line}</strong> · zone {p2(c.zone)} : {c.doc.kind === 'linked' ? docLinkText(c.doc, c.src) : <em>{docLinkText(c.doc, c.src)}</em>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
