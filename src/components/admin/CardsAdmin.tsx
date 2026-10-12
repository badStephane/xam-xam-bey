import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../AppContext'
import { ZONES } from '../../lib/constants'
import { adminError, deleteCard, listCards, saveCard, setCardStatus } from '../../lib/adminApi'
import { checkCard, WRONG_COUNT, type CardDraft } from '../../lib/cardRules'
import { p2, zoneColor } from '../../lib/format'
import type { CardRow, CardStatus } from '../../lib/types'

interface EditorState { id: string | null; documentId: number | null; src: string; draft: CardDraft; status: CardStatus }

const EMPTY_DRAFT: CardDraft = { q: '', a: '', ok: '', no: Array(WRONG_COUNT).fill(''), note: '' }

function fromRow(r: CardRow): EditorState {
  const qcm = (r.qcm || {}) as { ok?: string; no?: string[] }
  const no = Array.from({ length: WRONG_COUNT }, (_, i) => qcm.no?.[i] || '')
  return { id: r.id, documentId: r.document_id, src: r.src, status: r.status, draft: { q: r.q, a: r.a, ok: qcm.ok || '', no, note: r.note } }
}

function CardEditor({ zone, initial, onSaved, onCancel }: { zone: number; initial: EditorState; onSaved(): void; onCancel(): void }) {
  const { docs } = useApp()
  const [st, setSt] = useState<EditorState>(initial)
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const zoneDocs = docs.filter(d => d.th === zone)
  const check = checkCard(st.draft)
  const set = (patch: Partial<CardDraft>) => setSt(s => ({ ...s, draft: { ...s.draft, ...patch } }))
  const pickDoc = (id: number | null) => {
    const d = docs.find(x => x.id === id)
    setSt(s => ({ ...s, documentId: id, src: d ? d.fileName : s.src }))
  }
  const save = async (status: CardStatus) => {
    if (check.errors.length) { setMsg({ error: true, text: check.errors[0] }); return }
    setBusy(true)
    try {
      await saveCard(st.id, { zone, documentId: st.documentId, src: st.src, q: st.draft.q, a: st.draft.a, note: st.draft.note, qcm: { ok: st.draft.ok, no: st.draft.no }, status })
      onSaved()
    } catch (err) {
      setMsg({ error: true, text: err instanceof Error ? err.message : adminError(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="sheet r10 train" aria-labelledby="ed-h">
      <h2 id="ed-h">{st.id ? 'Modifier la question' : 'Nouvelle question'} · zone {p2(zone)}</h2>
      <div className="col g6">
        <label htmlFor="ed-doc" className="f-lbl">DOCUMENT SOURCE</label>
        <select id="ed-doc" className="field" value={st.documentId ?? ''} onChange={e => pickDoc(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Aucun document lié</option>
          {zoneDocs.map(d => <option key={d.id} value={d.id}>{d.cote} · {d.title}</option>)}
        </select>
      </div>
      <div className="col g6"><label htmlFor="ed-src" className="f-lbl">SOURCE AFFICHÉE</label><input id="ed-src" className="field" value={st.src} onChange={e => setSt({ ...st, src: e.target.value })} placeholder="Nom du ou des documents" /></div>
      <div className="col g6"><label htmlFor="ed-q" className="f-lbl">QUESTION</label><textarea id="ed-q" className="field" rows={2} value={st.draft.q} onChange={e => set({ q: e.target.value })} /></div>
      <div className="col g6"><label htmlFor="ed-a" className="f-lbl">RÉPONSE COMPLÈTE · **GRAS** POUR L’ESSENTIEL</label><textarea id="ed-a" className="field" rows={3} value={st.draft.a} onChange={e => set({ a: e.target.value })} /></div>
      <div className="col g6"><label htmlFor="ed-ok" className="f-lbl" style={{ color: 'var(--green)' }}>✓ BONNE RÉPONSE COURTE (QCM)</label><input id="ed-ok" className="field" value={st.draft.ok} onChange={e => set({ ok: e.target.value })} /></div>
      {st.draft.no.map((w, i) => (
        <div key={i} className="col g6"><label htmlFor={`ed-no-${i}`} className="f-lbl" style={{ color: 'var(--stamp)' }}>✕ MAUVAISE RÉPONSE {i + 1} · PLAUSIBLE, CLAIREMENT FAUSSE</label>
          <input id={`ed-no-${i}`} className="field" value={w} onChange={e => set({ no: st.draft.no.map((x, k) => (k === i ? e.target.value : x)) })} /></div>
      ))}
      <div className="col g6"><label htmlFor="ed-note" className="f-lbl">VIGILANCE · FACULTATIF (SOURCES EN DÉSACCORD)</label><textarea id="ed-note" className="field" rows={2} value={st.draft.note} onChange={e => set({ note: e.target.value })} /></div>
      {(check.errors.length > 0 || check.warnings.length > 0) && (
        <ul className="col g6" style={{ margin: 0, paddingLeft: 18, fontSize: 14 }} aria-live="polite">
          {check.errors.map(e => <li key={e} style={{ color: 'var(--stamp)' }}>{e}</li>)}
          {check.warnings.map(w => <li key={w} style={{ color: 'var(--ochre)' }}>{w}</li>)}
        </ul>
      )}
      {msg && <p role={msg.error ? 'alert' : 'status'} style={{ margin: 0, fontSize: 14, color: msg.error ? 'var(--stamp)' : 'var(--green)' }}>{msg.text}</p>}
      <div className="row">
        <button className="ink-btn big" disabled={busy || check.errors.length > 0} onClick={() => void save('published')}>Publier</button>
        <button className="ink-line big" disabled={busy || check.errors.length > 0} onClick={() => void save('draft')}>Enregistrer en brouillon</button>
        <button className="ink-line" onClick={onCancel}>Annuler</button>
      </div>
    </section>
  )
}

function CardItem({ r, docTitle, onEdit, onChanged }: { r: CardRow; docTitle: string; onEdit(): void; onChanged(): void }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const act = async (task: () => Promise<void>) => {
    try { await task(); onChanged() } catch (e) { setErr(e instanceof Error ? e.message : adminError(e)) }
  }
  const draft = r.status === 'draft'
  return (
    <li className="sheet punch doc">
      <div className="doc-top"><span className="cote">{r.id.toUpperCase()}</span><span className="stamp" style={draft ? { borderColor: 'var(--ochre)', color: 'var(--ochre)' } : { borderColor: 'var(--green)', color: 'var(--green)' }}>{draft ? 'BROUILLON' : 'PUBLIÉE'}</span></div>
      <span className="d-title" style={{ fontSize: 15.5 }}>{r.q}</span>
      <span className="d-meta">{docTitle || 'SANS DOCUMENT LIÉ'}</span>
      {err && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--stamp)' }}>{err}</p>}
      <div className="row">
        <button className="ink-line" onClick={onEdit}>Modifier</button>
        <button className="ink-line" onClick={() => void act(() => setCardStatus(r.id, draft ? 'published' : 'draft'))}>{draft ? 'Publier' : 'Repasser en brouillon'}</button>
        {!confirmDel
          ? <button className="ink-line" style={{ color: 'var(--stamp)', borderColor: 'var(--stamp)' }} onClick={() => setConfirmDel(true)}>Supprimer</button>
          : <><button className="ink-btn" style={{ background: 'var(--stamp)' }} onClick={() => void act(() => deleteCard(r.id))}>Confirmer</button><button className="ink-line" onClick={() => setConfirmDel(false)}>Garder</button></>}
      </div>
    </li>
  )
}

type Filter = 'all' | 'draft' | 'published'

export function CardsAdmin() {
  const { docs, cur } = useApp()
  const [zone, setZone] = useState(cur)
  const [docFilter, setDocFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<Filter>('all')
  const [rows, setRows] = useState<CardRow[]>([])
  const [load, setLoad] = useState<{ busy: boolean; error: string | null }>({ busy: true, error: null })
  const [editor, setEditor] = useState<EditorState | null>(null)

  const refresh = useCallback(async () => {
    setLoad({ busy: true, error: null })
    try { setRows(await listCards(zone)); setLoad({ busy: false, error: null }) } catch (e) { setLoad({ busy: false, error: e instanceof Error ? e.message : adminError(e) }) }
  }, [zone])
  useEffect(() => { setEditor(null); setDocFilter('all'); void refresh() }, [refresh])

  const titles = useMemo(() => new Map(docs.map(d => [d.id, `${d.cote} · ${d.title}`])), [docs])
  const shown = rows.filter(r => (docFilter === 'all' || r.document_id === docFilter) && (statusFilter === 'all' || r.status === statusFilter))
  const drafts = rows.filter(r => r.status === 'draft').length
  const zoneDocs = docs.filter(d => d.th === zone)
  const newCard = () => setEditor({ id: null, documentId: docFilter === 'all' ? null : docFilter, src: docFilter === 'all' ? '' : docs.find(d => d.id === docFilter)?.fileName || '', status: 'draft', draft: { ...EMPTY_DRAFT, no: [...EMPTY_DRAFT.no] } })

  return (
    <div className="col g16">
      <div className="chips" role="group" aria-label="Zone">
        {ZONES.map(([abbr], i) => (
          <button key={i} className="chip" aria-pressed={zone === i + 1} onClick={() => setZone(i + 1)}>
            <span aria-hidden="true" style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: zoneColor(i + 1) }} />{p2(i + 1)} {abbr.toUpperCase()}
          </button>
        ))}
      </div>
      {editor
        ? <CardEditor key={editor.id || 'new'} zone={zone} initial={editor} onCancel={() => setEditor(null)} onSaved={() => { setEditor(null); void refresh() }} />
        : (
          <section className="box" aria-labelledby="cards-h">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="cards-h" className="h-sec">ZONE {p2(zone)} · {rows.length} QUESTIONS{drafts ? ` · ${drafts} BROUILLON${drafts > 1 ? 'S' : ''}` : ''}</h2>
              <button className="btn acc" onClick={newCard}>+ NOUVELLE QUESTION</button>
            </div>
            <div className="row">
              <select className="field" aria-label="Filtrer par document" style={{ maxWidth: 420, background: 'var(--field)', color: 'var(--hud)', borderColor: 'var(--line)' }}
                value={docFilter} onChange={e => setDocFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">Tous les documents</option>
                {zoneDocs.map(d => <option key={d.id} value={d.id}>{d.cote} · {d.title} ({rows.filter(r => r.document_id === d.id).length})</option>)}
              </select>
              {(['all', 'draft', 'published'] as const).map(f => <button key={f} className="chip" aria-pressed={statusFilter === f} onClick={() => setStatusFilter(f)}>{f === 'all' ? 'TOUTES' : f === 'draft' ? 'BROUILLONS' : 'PUBLIÉES'}</button>)}
            </div>
            {load.busy && <p className="mono" role="status" style={{ color: 'var(--acc)' }}>CHARGEMENT…</p>}
            {load.error && <p role="alert" style={{ color: 'var(--err)' }}>{load.error}</p>}
            {!load.busy && !load.error && (shown.length
              ? <ul className="grid-docs" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{shown.map(r => <CardItem key={r.id} r={r} docTitle={r.document_id ? titles.get(r.document_id) || '' : ''} onEdit={() => setEditor(fromRow(r))} onChanged={() => void refresh()} />)}</ul>
              : <p className="muted" style={{ margin: 0 }}>Aucune question pour ce filtre.</p>)}
          </section>
        )}
    </div>
  )
}
