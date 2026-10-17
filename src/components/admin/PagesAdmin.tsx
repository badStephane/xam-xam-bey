import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { useApp } from '../../AppContext'
import { ZONES } from '../../lib/constants'
import { validDocPage } from '../../lib/docPage'
import { matchPages, type PageImport } from '../../lib/docPageImport'
import { insertPages, listPageRows, type PageRow } from '../../lib/docPagesAdminApi'
import { p2, plural } from '../../lib/format'
import { PageEditor } from './PageEditor'

const MAX_FILE = 2 * 1024 * 1024
const errorText = (e: unknown): string => (e instanceof Error ? e.message : 'Action impossible. Réessayez.')
const STATUS_LABEL = { none: 'SANS PAGE', draft: 'BROUILLON', published: 'PUBLIÉE' } as const

type ImportState = { kind: 'idle' } | { kind: 'error'; text: string } | { kind: 'preview'; fileName: string; result: PageImport; saving: boolean } | { kind: 'done'; text: string }

function ImportBox({ rows, onDone }: { rows: readonly PageRow[]; onDone(): void }) {
  const { docs } = useApp()
  const [st, setSt] = useState<ImportState>({ kind: 'idle' })
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE) { setSt({ kind: 'error', text: 'Fichier trop lourd (2 Mo au plus).' }); return }
    try {
      const raw: unknown = JSON.parse(await file.text())
      if (!Array.isArray(raw)) throw new Error('Le fichier doit contenir une liste de pages (tableau JSON).')
      const result = matchPages(raw, docs.map(d => ({ id: d.id, th: d.th, title: d.title, fileName: d.fileName })), new Set(rows.map(r => r.document_id)))
      setSt({ kind: 'preview', fileName: file.name, result, saving: false })
    } catch (err) {
      setSt({ kind: 'error', text: err instanceof SyntaxError ? 'Ce fichier n’est pas un JSON lisible.' : errorText(err) })
    }
  }
  const confirm = async () => {
    if (st.kind !== 'preview') return
    setSt({ ...st, saving: true })
    try {
      const n = await insertPages(st.result.ready.map(r => ({ docId: r.docId, page: r.page })))
      setSt({ kind: 'done', text: `${plural(n, 'page importée', 'pages importées')} en brouillon. Relisez-les puis publiez-les.` })
      onDone()
    } catch (err) {
      setSt({ kind: 'error', text: `${errorText(err)} Aucune page n’a été importée.` })
    }
  }
  return (
    <section className="sheet r10 col g10" style={{ padding: 14 }} aria-labelledby="pg-imp-h">
      <h2 id="pg-imp-h" className="f-lbl" style={{ margin: 0 }}>IMPORTER DES PAGES (JSON)</h2>
      <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Une page par document, désigné par <code>zone</code> et <code>file</code> (nom du fichier). Les documents qui ont déjà une page sont sautés.</p>
      <input type="file" accept="application/json,.json" onChange={e => void onFile(e)} aria-label="Fichier de pages" />
      {st.kind === 'error' && <p className="warn-inline" role="alert" style={{ margin: 0 }}>{st.text}</p>}
      {st.kind === 'done' && <p className="note-box" role="status">{st.text}</p>}
      {st.kind === 'preview' && (
        <div className="col g8" role="status">
          <p style={{ margin: 0 }}><strong>{st.fileName}</strong> : {plural(st.result.ready.length, 'page prête', 'pages prêtes')}, {plural(st.result.skipped.length, 'déjà présente (sautée)', 'déjà présentes (sautées)')}, {plural(st.result.errors.length, 'erreur', 'erreurs')}.</p>
          {!!st.result.errors.length && <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.875rem', color: 'var(--stamp)' }}>{st.result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          <div className="two">
            <button className="ink-btn" disabled={!st.result.ready.length || st.saving} onClick={() => void confirm()}>{st.saving ? 'IMPORT…' : `Importer ${plural(st.result.ready.length, 'page', 'pages')}`}</button>
            <button className="ink-line" disabled={st.saving} onClick={() => setSt({ kind: 'idle' })}>Annuler</button>
          </div>
        </div>
      )}
    </section>
  )
}

/** Onglet Pages (2026-10-18) : pages de révision des documents, par zone ; import JSON, édition, publication. */
export function PagesAdmin() {
  const { docs } = useApp()
  const [zone, setZone] = useState(1)
  const [rows, setRows] = useState<PageRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const refresh = useCallback(async () => {
    try { setRows(await listPageRows()); setError(null) } catch (err) { setError(errorText(err)) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const byDoc = new Map((rows || []).map(r => [r.document_id, r]))
  const zoneDocs = docs.filter(d => d.th === zone).sort((a, b) => Number(b.ess) - Number(a.ess) || a.title.localeCompare(b.title, 'fr'))
  const edited = editing === null ? null : docs.find(d => d.id === editing) || null
  if (edited) {
    const row = byDoc.get(edited.id)
    return <PageEditor doc={edited} initial={row ? validDocPage(row.data) : null} status={row?.status ?? null} onClose={() => { setEditing(null); void refresh() }} />
  }
  return (
    <div className="col g14">
      {rows ? <ImportBox rows={rows} onDone={() => void refresh()} /> : null}
      <div className="col g6">
        <label htmlFor="pg-zone" className="f-lbl">ZONE</label>
        <select id="pg-zone" className="field" value={zone} onChange={e => setZone(Number(e.target.value))}>
          {ZONES.map(([, , theme], i) => {
            const n = docs.filter(d => d.th === i + 1 && byDoc.has(d.id)).length
            return <option key={i} value={i + 1}>Zone {p2(i + 1)} · {theme} · {plural(n, 'page', 'pages')}</option>
          })}
        </select>
      </div>
      {error && <p className="warn-inline" role="alert" style={{ margin: 0 }}>{error} <button className="btn-mono" onClick={() => void refresh()}>RÉESSAYER</button></p>}
      {!rows && !error && <p className="mono" role="status">CHARGEMENT…</p>}
      {rows && (
        <ul className="col g6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {zoneDocs.map(d => {
            const st = byDoc.get(d.id)?.status ?? 'none'
            return (
              <li key={d.id}>
                <button className="mode-btn" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditing(d.id)}>
                  <strong>{d.title}{d.ess ? ' · ESSENTIEL' : ''}</strong>
                  <span style={{ color: st === 'published' ? 'var(--green)' : st === 'draft' ? 'var(--ochre)' : undefined }}>{STATUS_LABEL[st]} · {st === 'none' ? 'Créer la page' : 'Modifier'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
