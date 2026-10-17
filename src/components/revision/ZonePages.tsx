import { useApp } from '../../AppContext'

/** Pages de révision publiées pour les documents de la zone (2026-10-18), sous la fiche. Rien si aucune. */
export function ZonePages({ zone }: { zone: number }) {
  const { docs, pages, go } = useApp()
  const list = docs.filter(d => d.th === zone && pages.ids.has(d.id))
  if (!list.length) return null
  return (
    <section className="col g10" aria-labelledby="zone-pages-h">
      <h2 id="zone-pages-h" className="h-screen" style={{ fontSize: '1.25rem' }}>Pages de révision des documents</h2>
      <ul className="col g6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {list.map(d => (
          <li key={d.id}>
            <button className="mode-btn" style={{ width: '100%', textAlign: 'left' }} onClick={() => go('page', { sel: d.id })}>
              <strong>{d.title}</strong>
              <span>{d.cote} · page guidée, puis questions du document</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
