import { useApp } from '../../AppContext'
import { docById } from '../../lib/docs'
import { docFormat } from './PreviewPanel'
import { share } from '../../lib/share'
import { PdfViewer } from './PdfViewer'

/** Aperçu plein écran (mobile). */
export function Apercu() {
  const { ui, go, patch } = useApp()
  const d = docById(ui.sel)
  if (!d) return null
  const url = new URL(d.file, location.href).href
  return (
    <div className="col" style={{ minHeight: '100vh' }}>
      <div className="ap-bar">
        <button className="btn-mono" onClick={() => go('bibliotheque')}>← RETOUR</button>
        <span className="cote" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--acc)' }}>{d.cote}</span>
      </div>
      <div className="col g14" style={{ padding: 16, flex: 1 }}>
        <div className="col g6">
          <h1 style={{ margin: 0, font: '800 26px/1.1 var(--f-doc)' }}>{d.title}</h1>
          <span className="mono muted" style={{ fontSize: 11, lineHeight: 1.4 }}>{docFormat(d).toUpperCase()} · {d.folder.toUpperCase()}</span>
        </div>
        <div className="viewer"><PdfViewer file={d.file} title={d.title} /></div>
        <div className="two">
          <a className="btn tall" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none', color: 'var(--hud)' }} href={d.file} download>TÉLÉCHARGER</a>
          <button className="btn tall acc" onClick={() => share({ title: d.title, url }, url, () => patch({ shared: true }))}>{ui.shared ? 'LIEN COPIÉ ✓' : 'PARTAGER'}</button>
        </div>
      </div>
    </div>
  )
}
