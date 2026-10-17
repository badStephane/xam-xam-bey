import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../AppContext'
import { ZONES } from '../../lib/constants'
import { adminError, deleteCard, listCards, saveCard, setCardStatus } from '../../lib/adminApi'
import { createRequestCounter, runLatest } from '../../lib/adminFlow'
import { editorFromRow, isEditorDirty, newEditor, publishError, type EditorState } from '../../lib/cardEditor'
import { checkCard, readQcm, type CardDraft } from '../../lib/cardRules'
import { TemplateLink } from './TemplateLink'
import { LIST_PAGE_SIZE, moreLabel, nextLimit } from '../../lib/listPage'

/** Import Excel chargé à la demande : ni sa logique ni la bibliothèque .xlsx n'entrent dans le bundle initial. */
const CardsImport = lazy(() => import('./CardsImport').catch((err: unknown) => {
  console.error('[xxb] Chargement de l’import impossible', err)
  return { default: ImportUnavailable }
}))

function ImportUnavailable({ onClose }: { onClose(): void }) {
  return (
    <section className="sheet r10 train" aria-labelledby="imp-h">
      <h2 id="imp-h">Importer des questions</h2>
      <p role="alert" style={{ margin: 0, color: 'var(--stamp)', fontWeight: 700 }}>L’import n’a pas pu être chargé. Vérifiez la connexion puis rechargez la page.</p>
      <div className="row"><button className="ink-line" onClick={onClose}>Fermer</button></div>
    </section>
  )
}
import { DISCARD_QUESTION, markUnsavedDraft } from '../../lib/draftGuard'
import { p2, zoneColor } from '../../lib/format'
import type { CardRow, CardStatus } from '../../lib/types'

const errorText = (e: unknown): string => (e instanceof Error ? e.message : adminError(e))

function CardEditor({ initial, onSaved, onCancel, onDirtyChange }: { initial: EditorState; onSaved(): void; onCancel(): void; onDirtyChange(dirty: boolean): void }) {
  const { docs } = useApp()
  const [st, setSt] = useState<EditorState>(initial)
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const zone = st.zone
  const zoneDocs = docs.filter(d => d.th === zone)
  const check = checkCard(st.draft)
  useEffect(() => { onDirtyChange(isEditorDirty(initial, st)) }, [initial, st, onDirtyChange])
  const set = (patch: Partial<CardDraft>) => setSt(s => ({ ...s, draft: { ...s.draft, ...patch } }))
  const pickDoc = (id: number | null) => {
    const d = docs.find(x => x.id === id)
    setSt(s => ({ ...s, documentId: id, src: d ? d.fileName : s.src }))
  }
  const save = async (status: CardStatus) => {
    const qcm = readQcm(st.draft.ok, st.draft.no)
    if (check.errors.length || !qcm.ok) { setMsg({ error: true, text: check.errors[0] ?? 'QCM incomplet.' }); return }
    setBusy(true)
    try {
      await saveCard(st.id, { zone, documentId: st.documentId, src: st.src, q: st.draft.q, a: st.draft.a, note: st.draft.note, qcm: qcm.qcm, status, tier: st.tier })
      onSaved()
    } catch (err) {
      setMsg({ error: true, text: errorText(err) })
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
      <div className="col g6">
        <label htmlFor="ed-tier" className="f-lbl">PALIER DE DIFFICULTÉ</label>
        <select id="ed-tier" className="field" value={st.tier} onChange={e => setSt({ ...st, tier: Number(e.target.value) })}>
          <option value={1}>1 · Base</option>
          <option value={2}>2 · Approfondi (après 70 % du palier 1 de la zone)</option>
          <option value={3}>3 · Expert (après 70 % du palier 2 de la zone)</option>
        </select>
      </div>
      <div className="col g6"><label htmlFor="ed-src" className="f-lbl">SOURCE AFFICHÉE</label><input id="ed-src" className="field" value={st.src} onChange={e => setSt({ ...st, src: e.target.value })} placeholder="Nom du ou des documents" /></div>
      <div className="col g6"><label htmlFor="ed-q" className="f-lbl">QUESTION</label><textarea id="ed-q" className="field" rows={2} value={st.draft.q} onChange={e => set({ q: e.target.value })} /></div>
      <div className="col g6"><label htmlFor="ed-a" className="f-lbl">RÉPONSE COMPLÈTE · **GRAS** POUR L’ESSENTIEL</label><textarea id="ed-a" className="field" rows={3} value={st.draft.a} onChange={e => set({ a: e.target.value })} /></div>
      <p id="ed-qcm-help" className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>QCM facultatif. Sans QCM, l’application propose les réponses d’autres questions de la zone. Avec QCM : une bonne réponse courte et 1 à 3 mauvaises.</p>
      <div className="col g6"><label htmlFor="ed-ok" className="f-lbl" style={{ color: 'var(--green)' }}>✓ BONNE RÉPONSE COURTE (QCM)</label><input id="ed-ok" className="field" value={st.draft.ok} onChange={e => set({ ok: e.target.value })} /></div>
      {st.draft.no.map((w, i) => (
        <div key={i} className="col g6"><label htmlFor={`ed-no-${i}`} className="f-lbl" style={{ color: 'var(--stamp)' }}>✕ MAUVAISE RÉPONSE {i + 1}{i > 0 ? ' · FACULTATIVE' : ''} · PLAUSIBLE, CLAIREMENT FAUSSE</label>
          <input id={`ed-no-${i}`} className="field" value={w} onChange={e => set({ no: st.draft.no.map((x, k) => (k === i ? e.target.value : x)) })} /></div>
      ))}
      <div className="col g6"><label htmlFor="ed-note" className="f-lbl">VIGILANCE · FACULTATIF (SOURCES EN DÉSACCORD)</label><textarea id="ed-note" className="field" rows={2} value={st.draft.note} onChange={e => set({ note: e.target.value })} /></div>
      {(check.errors.length > 0 || check.warnings.length > 0) && (
        <ul className="col g6" style={{ margin: 0, paddingLeft: 18, fontSize: '0.875rem' }} aria-live="polite">
          {check.errors.map(e => <li key={e} style={{ color: 'var(--stamp)' }}>{e}</li>)}
          {check.warnings.map(w => <li key={w} style={{ color: 'var(--ochre)' }}>{w}</li>)}
        </ul>
      )}
      {msg && <p role={msg.error ? 'alert' : 'status'} style={{ margin: 0, fontSize: '0.875rem', color: msg.error ? 'var(--stamp)' : 'var(--green)' }}>{msg.text}</p>}
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
    try { setErr(null); await task(); onChanged() } catch (e) { setErr(errorText(e)) }
  }
  const draft = r.status === 'draft'
  return (
    <li className="sheet punch doc">
      <div className="doc-top"><span className="cote">{r.id.toUpperCase()}</span><span className="stamp" style={draft ? { borderColor: 'var(--ochre)', color: 'var(--ochre)' } : { borderColor: 'var(--green)', color: 'var(--green)' }}>{draft ? 'BROUILLON' : 'PUBLIÉE'}</span></div>
      <span className="d-title" style={{ fontSize: '0.96875rem' }}>{r.q}</span>
      <span className="d-meta">{docTitle || 'SANS DOCUMENT LIÉ'}</span>
      {err && <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--stamp)' }}>{err}</p>}
      <div className="row">
        <button className="ink-line" onClick={onEdit}>Modifier</button>
        <button className="ink-line" onClick={() => {
          const blocked = draft ? publishError(r) : null
          if (blocked) { setErr(blocked); return }
          void act(() => setCardStatus(r.id, draft ? 'published' : 'draft'))
        }}>{draft ? 'Publier' : 'Repasser en brouillon'}</button>
        {!confirmDel
          ? <button className="ink-line" style={{ color: 'var(--stamp)', borderColor: 'var(--stamp)' }} onClick={() => setConfirmDel(true)}>Supprimer</button>
          : <><button className="ink-btn" style={{ background: 'var(--stamp)' }} onClick={() => void act(() => deleteCard(r.id))}>Confirmer</button><button className="ink-line" onClick={() => setConfirmDel(false)}>Garder</button></>}
      </div>
    </li>
  )
}

/** Confirmation avant d'abandonner un brouillon modifié (UX-5). */
function DiscardConfirm({ onKeep, onDiscard }: { onKeep(): void; onDiscard(): void }) {
  const keepRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { keepRef.current?.focus() }, [])
  return (
    <div className="note-box col g8" role="alertdialog" aria-labelledby="discard-q">
      <p id="discard-q" style={{ margin: 0, fontWeight: 700 }}>{DISCARD_QUESTION}</p>
      <div className="row">
        <button ref={keepRef} className="ink-btn" onClick={onKeep}>Continuer l’écriture</button>
        <button className="ink-line" style={{ color: 'var(--stamp)', borderColor: 'var(--stamp)' }} onClick={onDiscard}>Abandonner</button>
      </div>
    </div>
  )
}

/** Brouillon modifié : signalé à la navigation (draftGuard) et protégé contre la fermeture de l'onglet. */
function useUnsavedDraft(dirty: boolean): void {
  useEffect(() => {
    markUnsavedDraft(dirty)
    if (!dirty) return undefined
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => () => markUnsavedDraft(false), [])
}

type Filter = 'all' | 'draft' | 'published'
type LoadState = { busy: boolean; error: string | null }

/** Questions d'une zone ; seule la réponse de la dernière zone demandée s'affiche (FE-4). */
function useZoneCards(zone: number) {
  const [rows, setRows] = useState<CardRow[]>([])
  const [load, setLoad] = useState<LoadState>({ busy: true, error: null })
  const requests = useRef(createRequestCounter())
  const refresh = useCallback(async () => {
    setLoad({ busy: true, error: null })
    await runLatest(requests.current, () => listCards(zone),
      list => { setRows(list); setLoad({ busy: false, error: null }) },
      e => { setLoad({ busy: false, error: errorText(e) }) })
  }, [zone])
  useEffect(() => {
    setRows([])
    void refresh()
    const counter = requests.current
    return () => counter.invalidate()
  }, [refresh])
  return { rows, load, refresh }
}

export function CardsAdmin() {
  const { docs, cur } = useApp()
  const [zone, setZone] = useState(cur)
  const [docFilter, setDocFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<Filter>('all')
  const { rows, load, refresh } = useZoneCards(zone)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState<{ run(): void } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [imported, setImported] = useState<string | null>(null)
  const [limit, setLimit] = useState(LIST_PAGE_SIZE)
  const listRef = useRef<HTMLUListElement>(null)
  useUnsavedDraft(editor !== null && dirty)
  // Nouvelle zone ou nouveau filtre : on repart de la première page.
  useEffect(() => { setLimit(LIST_PAGE_SIZE) }, [zone, docFilter, statusFilter])

  const closeEditor = useCallback(() => { setEditor(null); setDirty(false); setPending(null) }, [])
  /** Quitter l'éditeur (zone, Annuler) : confirmation seulement si la saisie a changé. */
  const requestLeave = (run: () => void) => {
    if (editor && dirty) { setPending({ run }); return }
    run()
  }
  const pickZone = (z: number) => requestLeave(() => { closeEditor(); setDocFilter('all'); setZone(z) })

  const titles = useMemo(() => new Map(docs.map(d => [d.id, `${d.cote} · ${d.title}`])), [docs])
  const shown = rows.filter(r => (docFilter === 'all' || r.document_id === docFilter) && (statusFilter === 'all' || r.status === statusFilter))
  const drafts = rows.filter(r => r.status === 'draft').length
  const more = moreLabel(limit, shown.length)
  /** Le focus passe à la première question ajoutée : le bouton peut disparaître (dernière page). */
  const showMore = () => {
    const first = limit
    setLimit(nextLimit(limit, shown.length))
    requestAnimationFrame(() => listRef.current?.children[first]?.querySelector<HTMLElement>('button')?.focus())
  }
  const zoneDocs = docs.filter(d => d.th === zone)
  const openImport = () => { setImported(null); setImportOpen(true) }
  const finishImport = (message: string) => { setImportOpen(false); setImported(message); void refresh() }
  const newCard = () => setEditor(newEditor(zone, docFilter === 'all' ? null : docFilter, docFilter === 'all' ? '' : docs.find(d => d.id === docFilter)?.fileName || ''))

  return (
    <div className="col g16">
      <div className="chips" role="group" aria-label="Zone">
        {ZONES.map(([abbr], i) => (
          <button key={i} className="chip" aria-pressed={zone === i + 1} onClick={() => pickZone(i + 1)}>
            <span aria-hidden="true" style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: zoneColor(i + 1) }} />{p2(i + 1)} {abbr.toUpperCase()}
          </button>
        ))}
      </div>
      {pending && <DiscardConfirm onKeep={() => setPending(null)} onDiscard={() => pending.run()} />}
      {editor
        ? <CardEditor key={editor.id || 'new'} initial={editor} onDirtyChange={setDirty} onCancel={() => requestLeave(closeEditor)} onSaved={() => { closeEditor(); void refresh() }} />
        : importOpen
          ? (
            <Suspense fallback={<p className="mono" role="status" style={{ color: 'var(--acc)' }}>CHARGEMENT DE L’IMPORT…</p>}>
              <CardsImport onClose={() => { setImportOpen(false); void refresh() }} onImported={finishImport} />
            </Suspense>
          )
          : (
          <section className="box" aria-labelledby="cards-h">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="cards-h" className="h-sec">ZONE {p2(zone)} · {rows.length} QUESTIONS{drafts ? ` · ${drafts} BROUILLON${drafts > 1 ? 'S' : ''}` : ''}</h2>
              <div className="row">
                <button className="btn acc" onClick={newCard}>+ NOUVELLE QUESTION</button>
                <button className="btn" onClick={openImport}>Importer un fichier Excel</button>
                <TemplateLink className="btn" />
              </div>
            </div>
            {imported && <p role="status" style={{ margin: 0, color: 'var(--green)', fontWeight: 700 }}>{imported}</p>}
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
              ? (
                <>
                  <ul ref={listRef} className="grid-docs" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{shown.slice(0, limit).map(r => <CardItem key={r.id} r={r} docTitle={r.document_id ? titles.get(r.document_id) || '' : ''} onEdit={() => setEditor(editorFromRow(r))} onChanged={() => void refresh()} />)}</ul>
                  {shown.length > LIST_PAGE_SIZE && <p className="lbl" role="status" style={{ margin: 0 }}>{Math.min(limit, shown.length)} SUR {shown.length} QUESTIONS AFFICHÉES</p>}
                  {more && <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={showMore}>{more}</button>}
                </>
              )
              : <p className="muted" style={{ margin: 0 }}>Aucune question pour ce filtre.</p>)}
          </section>
        )}
    </div>
  )
}
