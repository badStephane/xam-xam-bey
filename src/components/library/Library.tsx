import { useApp } from '../../AppContext'
import { GROUP_CAP_DESKTOP, GROUP_CAP_MOBILE, TYPE_OPTS, ZONES } from '../../lib/constants'
import { catalogStats, isFiltering, matchDoc, zoneCounts, type LibFilters } from '../../lib/catalog'
import { p2, plural, zoneColor } from '../../lib/format'
import { PARAMS } from '../../lib/params'
import type { Doc } from '../../lib/types'
import { DocCard } from './DocCard'
import { PreviewPanel } from './PreviewPanel'
import { ZoneCard } from './ZoneCard'
import { ZoneRoute } from './ZoneRoute'

const SUGGESTIONS = ['camp', 'statuts', 'secourisme']
const SKELETON_WIDTHS = ['70%', '55%', '62%', '48%']

function SearchBar() {
  const { ui, patch } = useApp()
  return (
    <div className="col g8">
      <label htmlFor="q" className="sr">Rechercher par titre, dossier ou cote</label>
      <div className="search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
        <input id="q" type="search" value={ui.q} onChange={e => patch({ q: e.target.value })} placeholder="Titre, dossier ou cote" autoComplete="off" />
        {ui.q && <button className="clear" onClick={() => { patch({ q: '' }); document.getElementById('q')?.focus() }} aria-label="Effacer la recherche">✕</button>}
      </div>
      <div className="chips" role="group" aria-label="Filtrer par type">
        {TYPE_OPTS.map(([k, label]) => <button key={k} className="chip" onClick={() => patch({ type: k })} aria-pressed={ui.type === k}>{label}</button>)}
        <button className="chip" onClick={() => patch({ ess: !ui.ess })} aria-pressed={ui.ess}>◆ ESSENTIELS DU MOIS</button>
      </div>
    </div>
  )
}

function Results({ items, filtering }: { items: Doc[]; filtering: boolean }) {
  const { ui, mobile, patch } = useApp()
  if (PARAMS.lib === 'loading') {
    return (
      <div className="col g8" aria-busy="true" aria-label="Chargement de l’inventaire">
        <span className="mono" style={{ fontSize: 11, color: 'var(--acc)', animation: 'xxbPulse 1.2s ease-in-out infinite' }}>CHARGEMENT DE L’INVENTAIRE…</span>
        {SKELETON_WIDTHS.map(w => <div key={w} className="skel"><span style={{ width: 60 }} /><span style={{ width: w, height: 14 }} /><span style={{ width: '45%' }} /></div>)}
      </div>
    )
  }
  if (!items.length) {
    const q = ui.q.trim()
    return (
      <div className="empty">
        <span className="f-lbl" style={{ color: 'var(--amber)' }}>AUCUNE PIÈCE TROUVÉE</span>
        <h3>{q ? `Rien pour « ${q} »` : 'Aucune pièce avec ces filtres'}</h3>
        <p style={{ margin: 0, fontSize: 15 }} className="muted">Essayez un mot plus court, ou l’un de ceux-ci :</p>
        <div className="row" style={{ gap: 6 }}>
          {SUGGESTIONS.map(w => <button key={w} className="chip" onClick={() => patch({ q: w, type: 'all', ess: false, month: null })}>{w.toUpperCase()}</button>)}
        </div>
      </div>
    )
  }
  const cap = filtering ? Infinity : mobile ? GROUP_CAP_MOBILE : GROUP_CAP_DESKTOP
  return (
    <div className="col g22">
      {ZONES.map(([, , theme], i) => {
        const n = i + 1
        const its = items.filter(d => d.th === n)
        if (!its.length) return null
        return (
          <section key={n} className="col g8">
            <div className="grp-h">
              <span className="diamond" aria-hidden="true" style={{ background: zoneColor(n) }} />
              <h3>Zone {p2(n)} · {theme}</h3>
              <span className="mono muted" style={{ fontSize: 11 }}>{plural(its.length, 'PIÈCE', 'PIÈCES')}</span>
            </div>
            <div className="grid-docs">{its.slice(0, cap).map(d => <DocCard key={d.id} d={d} />)}</div>
            {its.length > cap && <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => patch({ month: n })}>VOIR LES {its.length} PIÈCES DE LA ZONE</button>}
          </section>
        )
      })}
    </div>
  )
}

export function Library() {
  const { ui, mobile, offline, patch, docs, docById, catalogStatus } = useApp()
  const stats = catalogStats(docs)
  const filters: LibFilters = { q: ui.q, type: ui.type, ess: ui.ess, month: ui.month }
  const filtering = isFiltering(filters)
  const items = docs.filter(d => matchDoc(d, filters))
  const sel = docById(ui.sel)
  return (
    <div className="col g16">
      <div className="col g8" style={{ maxWidth: 720 }}>
        <h1 className="intro-h">Toutes les ressources du mouvement.</h1>
        <p style={{ margin: 0, fontSize: 15.5 }} className="muted">Trouvez un document en quelques secondes. Révisez une zone par mois, toute l’année.</p>
      </div>
      <dl className="stats">
        {[[stats.count, 'PIÈCES'], [ZONES.length, 'ZONES'], [stats.ess, 'ESSENTIELS'], [stats.mo, 'MO']].map(([v, l]) => <div key={l}><dd>{v}</dd><dt>{l}</dt></div>)}
      </dl>
      {catalogStatus === 'cached' && !offline && <div className="banner" role="status"><b>CATALOGUE HORS LIGNE</b><span style={{ fontSize: 14 }}>La liste affichée est la dernière enregistrée sur cet appareil ; les nouveaux documents apparaîtront au retour de la connexion.</span></div>}
      {offline && <div className="banner" role="status"><b>HORS RÉSEAU</b><span style={{ fontSize: 14 }}>Les pièces déjà consultées restent lisibles. Les autres s’ouvriront au retour de la connexion.</span></div>}
      <ZoneRoute counts={zoneCounts(docs, filters)} />
      <div className="lib-cols">
        <div className="lib-main">
          {!filtering && PARAMS.lib !== 'loading' && <ZoneCard />}
          <SearchBar />
          {filtering && (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span role="status" className="mono muted" style={{ fontSize: 12 }}>{plural(items.length, 'PIÈCE', 'PIÈCES')}</span>
              <button className="link" onClick={() => patch({ q: '', type: 'all', ess: false, month: null })}>EFFACER LES FILTRES</button>
            </div>
          )}
          <Results items={items} filtering={filtering} />
        </div>
        {!mobile && sel && <PreviewPanel d={sel} />}
      </div>
    </div>
  )
}

