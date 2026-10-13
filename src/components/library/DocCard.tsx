import { useApp } from '../../AppContext'
import { TYPE_COLOR } from '../../lib/constants'
import { mo } from '../../lib/format'
import type { Doc } from '../../lib/types'

export function DocCard({ d }: { d: Doc }) {
  const { ui, mobile, openDoc, markSeen } = useApp()
  const seen = ui.seen.includes(d.id)
  // Hors réseau, « consultée » ne veut pas dire « gardée » (FE-6, D5) : aucune pièce n'est grisée selon cet indicateur.
  const cls = ['sheet', 'punch', 'doc', ui.sel === d.id && !mobile ? 'sel' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <div className="doc-top">
        <span className="cote">{d.cote}</span>
        <span className="row" style={{ gap: 6 }}>
          {d.ess && <span className="tag-ess">★ ESSENTIEL</span>}
          {d.scan && <span className="tag-scan" title="PDF numérisé, texte non sélectionnable">SCAN</span>}
          {seen && <span className="tag-ess" style={{ color: 'var(--green)' }} title="Déjà consultée">✓</span>}
        </span>
      </div>
      <span className="d-title">{d.title}</span>
      <div className="doc-bot">
        <span className="d-meta"><b style={{ color: TYPE_COLOR[d.ty] }}>{d.ty}</b> · {d.pages ? `${d.pages} P. · ` : ''}{mo(d.size)} MO · {d.folder.toUpperCase()}</span>
        {mobile
          // Sur téléphone, le lecteur PDF natif (nouvel onglet) est plus confortable qu'un lecteur intégré.
          ? <a className="ink-btn" href={d.file} target="_blank" rel="noopener" onClick={() => markSeen(d.id)} aria-label={`Ouvrir ${d.title} dans un nouvel onglet`}>Ouvrir ↗</a>
          : <button className="ink-btn" onClick={() => openDoc(d.id)} aria-label={`Ouvrir ${d.title}`}>Ouvrir</button>}
      </div>
    </div>
  )
}
