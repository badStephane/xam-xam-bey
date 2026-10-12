import { useState, type FormEvent } from 'react'
import { useApp } from '../../AppContext'
import { ZONES } from '../../lib/constants'
import { adminError, deleteDocument, updateDocument, uploadDocument, type DocumentMeta } from '../../lib/adminApi'
import { checkUpload } from '../../lib/cardRules'
import { mo, p2, plural, zoneColor } from '../../lib/format'
import type { Doc } from '../../lib/types'

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'ok'; text: string } | { kind: 'error'; text: string }

function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'idle') return null
  const color = status.kind === 'error' ? 'var(--stamp)' : status.kind === 'ok' ? 'var(--green)' : 'var(--ink2)'
  return <p role={status.kind === 'error' ? 'alert' : 'status'} style={{ margin: 0, fontSize: 14, color }}>{status.text}</p>
}

function ZoneSelect({ id, value, onChange }: { id: string; value: number; onChange(z: number): void }) {
  return (
    <select id={id} className="field" value={value} onChange={e => onChange(Number(e.target.value))}>
      {ZONES.map(([, month, theme], i) => <option key={i} value={i + 1}>Zone {p2(i + 1)} · {month} · {theme}</option>)}
    </select>
  )
}

const titleFromFile = (name: string) => name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim()

function UploadForm() {
  const { cur, reloadCatalog } = useApp()
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<DocumentMeta>({ title: '', zone: cur, folder: '', essential: false })
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const pick = (f: File | null) => {
    setFile(f)
    if (!f) return
    const invalid = checkUpload(f)
    setStatus(invalid ? { kind: 'error', text: invalid } : { kind: 'idle' })
    if (!meta.title.trim()) setMeta(m => ({ ...m, title: titleFromFile(f.name) }))
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || !meta.title.trim()) { setStatus({ kind: 'error', text: 'Choisissez un PDF et donnez-lui un titre.' }); return }
    setStatus({ kind: 'busy', text: 'Envoi en cours…' })
    try {
      const row = await uploadDocument(file, meta)
      await reloadCatalog()
      setStatus({ kind: 'ok', text: `« ${row.title} » est en ligne dans la zone ${p2(row.zone)} (${plural(row.pages || 0, 'page', 'pages')}).` })
      setFile(null)
      setMeta(m => ({ ...m, title: '', essential: false }))
      ;(e.target as HTMLFormElement).reset()
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : adminError(err) })
    }
  }
  return (
    <form className="sheet r10 train" onSubmit={submit} aria-labelledby="up-h">
      <h2 id="up-h">Ajouter un document</h2>
      <div className="col g6">
        <label htmlFor="up-file" className="f-lbl">FICHIER PDF · 50 MO AU PLUS</label>
        <input id="up-file" className="field" type="file" accept="application/pdf,.pdf" onChange={e => pick(e.target.files?.[0] || null)} style={{ paddingTop: 10 }} />
      </div>
      <div className="col g6"><label htmlFor="up-title" className="f-lbl">TITRE</label><input id="up-title" className="field" value={meta.title} maxLength={200} onChange={e => setMeta({ ...meta, title: e.target.value })} /></div>
      <div className="two">
        <div className="col g6"><label htmlFor="up-zone" className="f-lbl">ZONE</label><ZoneSelect id="up-zone" value={meta.zone} onChange={zone => setMeta({ ...meta, zone })} /></div>
        <div className="col g6"><label htmlFor="up-folder" className="f-lbl">DOSSIER · FACULTATIF</label><input id="up-folder" className="field" value={meta.folder} maxLength={200} placeholder="Ex. Bases Générales" onChange={e => setMeta({ ...meta, folder: e.target.value })} /></div>
      </div>
      <label className="row" style={{ gap: 10, fontSize: 15 }}><input type="checkbox" checked={meta.essential} onChange={e => setMeta({ ...meta, essential: e.target.checked })} style={{ width: 20, height: 20 }} />Essentiel du mois</label>
      <StatusLine status={status} />
      <button type="submit" className="ink-btn big" style={{ alignSelf: 'flex-start', minHeight: 50 }} disabled={status.kind === 'busy'}>{status.kind === 'busy' ? 'Envoi…' : 'Envoyer le document'}</button>
    </form>
  )
}

function DocRow({ d }: { d: Doc }) {
  const { reloadCatalog } = useApp()
  const [edit, setEdit] = useState<DocumentMeta | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  /** Exécute une action ; renvoie true si elle a réussi (le formulaire ne se ferme qu'en cas de succès). */
  const run = async (task: () => Promise<void>, done: string): Promise<boolean> => {
    setStatus({ kind: 'busy', text: 'Enregistrement…' })
    try {
      await task()
      await reloadCatalog()
      setStatus({ kind: 'ok', text: done })
      return true
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : adminError(err) })
      return false
    }
  }
  if (edit) {
    return (
      <li className="sheet punch col g8" style={{ padding: '12px 12px 12px 30px' }}>
        <span className="cote">{d.cote} · MODIFIER</span>
        <input className="field" aria-label="Titre" value={edit.title} maxLength={200} onChange={e => setEdit({ ...edit, title: e.target.value })} />
        <div className="two"><ZoneSelect id={`z-${d.id}`} value={edit.zone} onChange={zone => setEdit({ ...edit, zone })} /><input className="field" aria-label="Dossier" value={edit.folder} onChange={e => setEdit({ ...edit, folder: e.target.value })} /></div>
        <label className="row" style={{ gap: 10, fontSize: 14 }}><input type="checkbox" checked={edit.essential} onChange={e => setEdit({ ...edit, essential: e.target.checked })} />Essentiel du mois</label>
        <StatusLine status={status} />
        <div className="row">
          <button className="ink-btn" disabled={!edit.title.trim() || status.kind === 'busy'} onClick={() => run(() => updateDocument(d.id, edit), 'Modifications enregistrées.').then(ok => { if (ok) setEdit(null) })}>Enregistrer</button>
          <button className="ink-line" onClick={() => { setEdit(null); setStatus({ kind: 'idle' }) }}>Annuler</button>
        </div>
      </li>
    )
  }
  return (
    <li className="sheet punch doc">
      <div className="doc-top"><span className="cote">{d.cote}</span>{d.ess && <span className="tag-ess">★ ESSENTIEL</span>}</div>
      <span className="d-title">{d.title}</span>
      <span className="d-meta">{d.pages ? `${d.pages} P. · ` : ''}{mo(d.size)} MO{d.folder ? ` · ${d.folder.toUpperCase()}` : ''}</span>
      <StatusLine status={status} />
      <div className="row">
        <a className="ink-line" href={d.file} target="_blank" rel="noopener">Voir</a>
        <button className="ink-line" onClick={() => setEdit({ title: d.title, zone: d.th, folder: d.folder, essential: d.ess })}>Modifier</button>
        {!confirmDel
          ? <button className="ink-line" style={{ color: 'var(--stamp)', borderColor: 'var(--stamp)' }} onClick={() => setConfirmDel(true)}>Supprimer</button>
          : <>
            <button className="ink-btn" style={{ background: 'var(--stamp)' }} onClick={() => run(() => deleteDocument(d.id, d.storagePath), 'Document supprimé.')}>Confirmer la suppression</button>
            <button className="ink-line" onClick={() => setConfirmDel(false)}>Garder</button>
          </>}
      </div>
    </li>
  )
}

export function DocsAdmin() {
  const { docs, cur } = useApp()
  const [zone, setZone] = useState(cur)
  const list = docs.filter(d => d.th === zone)
  return (
    <div className="col g16">
      <UploadForm />
      <section className="box" aria-labelledby="docs-h">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="docs-h" className="h-sec">DOCUMENTS EN LIGNE · {docs.length}</h2>
          <span className="lbl">LE NUMÉRO DE COTE SUIT L’ORDRE D’AJOUT DANS LA ZONE</span>
        </div>
        <div className="chips" role="group" aria-label="Zone">
          {ZONES.map(([abbr], i) => (
            <button key={i} className="chip" aria-pressed={zone === i + 1} onClick={() => setZone(i + 1)}>
              <span aria-hidden="true" style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: zoneColor(i + 1) }} />{p2(i + 1)} {abbr.toUpperCase()} · {docs.filter(d => d.th === i + 1).length}
            </button>
          ))}
        </div>
        {list.length ? <ul className="grid-docs" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{list.map(d => <DocRow key={d.id} d={d} />)}</ul> : <p className="muted" style={{ margin: 0 }}>Aucun document dans cette zone.</p>}
      </section>
    </div>
  )
}
