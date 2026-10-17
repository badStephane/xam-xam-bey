import { useApp } from '../../AppContext'
import { docFormat } from './PreviewPanel'
import { share } from '../../lib/share'
import { LazyPdfViewer } from './LazyPdfViewer'

/** Aperçu plein écran (mobile). */
export function Apercu() {
  const { ui, go, patch, docById, offline, pages } = useApp()
  const d = docById(ui.sel)
  if (!d) return null
  const url = new URL(d.download, location.href).href
  return (
    <div className="col" style={{ minHeight: '100vh' }}>
      <div className="ap-bar">
        <button className="btn-mono" onClick={() => go('bibliotheque')}>← RETOUR</button>
        <span className="cote" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--acc)' }}>{d.cote}</span>
      </div>
      <div className="col g14" style={{ padding: 16, flex: 1 }}>
        <div className="col g6">
          <h1 style={{ margin: 0, font: '800 1.625rem/1.1 var(--f-doc)' }}>{d.title}</h1>
          <span className="mono muted" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>{docFormat(d).toUpperCase()} · {d.folder.toUpperCase()}</span>
        </div>
        {pages.ids.has(d.id) && <button className="ink-btn big" onClick={() => go('page', { sel: d.id })}>Page de révision de ce document</button>}
        <div className="viewer"><LazyPdfViewer file={d.file} title={d.title} /></div>
        <div className="two">
          {/* Hors réseau, le lien de téléchargement serait mort (E3) : seul l'aperçu, lu depuis l'appareil, reste. */}
          {!offline && <a className="btn tall" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none', color: 'var(--hud)' }} href={d.download} download>TÉLÉCHARGER</a>}
          <button className="btn tall acc" onClick={() => share({ title: d.title, url }, url, () => patch({ shared: true }))}>{ui.shared ? 'LIEN COPIÉ ✓' : 'PARTAGER'}</button>
        </div>
      </div>
    </div>
  )
}
