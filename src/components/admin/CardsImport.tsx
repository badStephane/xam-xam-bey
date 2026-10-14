import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { UncertainWriteError, insertImportedCards, listCardsForImport, listDocumentsForImport } from '../../lib/adminApi'
import { createRequestCounter, runLatest } from '../../lib/adminFlow'
import { MAX_IMPORT_ROWS, type ImportAnalysis } from '../../lib/cardImport'
import { commitImport, previewImport, type ImportDeps, type ImportPreview } from '../../lib/cardImportFlow'
import { p2, plural } from '../../lib/format'
import { readFirstSheet } from '../../lib/xlsxRead'
import { ImportDocLinks } from './ImportDocLinks'
import { TemplateLink } from './TemplateLink'

const DEPS: ImportDeps = { readSheet: readFirstSheet, listExisting: listCardsForImport, listDocuments: listDocumentsForImport, insert: insertImportedCards }
const errorText = (e: unknown): string => (e instanceof Error ? e.message : 'L’import n’a pas abouti. Réessayez.')

/** IM-4 : « aucune question importée » seulement quand la base a refusé ; sinon le résultat est incertain. */
const importFailure = (err: unknown): string =>
  (err instanceof UncertainWriteError ? err.message : `${errorText(err)} Aucune question n’a été importée.`)

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; fileName: string }
  | { kind: 'failed'; text: string }
  | { kind: 'preview'; preview: ImportPreview; changed: boolean; error: string | null; saving: boolean }

function ZoneTable({ analysis }: { analysis: ImportAnalysis }) {
  const cell = { padding: '8px 6px', borderBottom: '1px solid var(--card-bd)', textAlign: 'left' as const }
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9375rem' }}>
      <caption className="f-lbl" style={{ textAlign: 'left', paddingBottom: 6 }}>LIGNES PAR ZONE</caption>
      <thead><tr><th scope="col" style={cell}>Zone</th><th scope="col" style={cell}>Valides</th><th scope="col" style={cell}>En erreur</th></tr></thead>
      <tbody>
        {analysis.byZone.map(z => (
          <tr key={z.zone ?? 'x'}>
            <th scope="row" style={cell}>{z.zone === null ? 'Zone invalide' : p2(z.zone)}</th>
            <td style={cell}>{z.valid}</td>
            <td style={{ ...cell, color: z.errors ? 'var(--stamp)' : undefined }}>{z.errors}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ErrorList({ analysis }: { analysis: ImportAnalysis }) {
  if (!analysis.errors.length) return null
  return (
    <div className="col g6">
      <h3 id="imp-err-h" className="f-lbl" style={{ margin: 0, color: 'var(--stamp)' }}>LIGNES IGNORÉES · {analysis.errors.length}</h3>
      <ul aria-labelledby="imp-err-h" className="col g6" style={{ margin: 0, paddingLeft: 18, fontSize: '0.875rem' }}>
        {analysis.errors.map(e => <li key={e.line}><strong>Ligne {e.line}</strong>{e.zone !== null ? ` · zone ${p2(e.zone)}` : ''} : {e.reason}</li>)}
      </ul>
    </div>
  )
}

interface PreviewProps { phase: Extract<Phase, { kind: 'preview' }>; onConfirm(): void; onCancel(): void }

function PreviewPanel({ phase, onConfirm, onCancel }: PreviewProps) {
  const { analysis, fileName } = phase.preview
  const n = analysis.cards.length
  const headRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headRef.current?.focus() }, [phase.preview])
  return (
    <div className="col g12">
      <h3 ref={headRef} tabIndex={-1} style={{ margin: 0, fontSize: '1.125rem' }}>Aperçu de « {fileName} »</h3>
      <p role="status" style={{ margin: 0 }}>{plural(n, 'ligne valide', 'lignes valides')}, {plural(analysis.errors.length, 'ligne en erreur', 'lignes en erreur')}. Rien n’est encore enregistré.</p>
      {phase.changed && <p className="note-box" role="note">Les questions ont changé en base depuis l’aperçu : il est à jour, relisez-le avant d’importer.</p>}
      {analysis.byZone.length > 0 && <ZoneTable analysis={analysis} />}
      {n === 0 && <p className="note-box" role="note">Aucune question à importer. Corrigez le fichier puis choisissez-le à nouveau.</p>}
      {phase.error && <p role="alert" style={{ margin: 0, color: 'var(--stamp)', fontWeight: 700 }}>{phase.error}</p>}
      <div className="row">
        {n > 0 && <button className="ink-btn big" disabled={phase.saving} onClick={onConfirm}>{phase.saving ? 'Import en cours…' : `Importer ${plural(n, 'question', 'questions')}`}</button>}
        <button className="ink-line big" disabled={phase.saving} onClick={onCancel}>Annuler</button>
      </div>
      <ImportDocLinks cards={analysis.cards} />
      <ErrorList analysis={analysis} />
    </div>
  )
}

/**
 * Import de questions depuis un .xlsx : choix du fichier, aperçu (rien n'est écrit), puis insertion en brouillon.
 * La bibliothèque Excel n'est téléchargée qu'au choix du premier fichier (xlsxRead).
 */
export default function CardsImport({ onClose, onImported }: { onClose(): void; onImported(message: string): void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const requests = useRef(createRequestCounter())
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    titleRef.current?.focus()
    const counter = requests.current
    return () => counter.invalidate()
  }, [])

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhase({ kind: 'reading', fileName: file.name })
    void runLatest(requests.current, () => previewImport(file, DEPS),
      preview => setPhase({ kind: 'preview', preview, changed: false, error: null, saving: false }),
      err => setPhase({ kind: 'failed', text: errorText(err) }))
  }

  const confirm = (current: Extract<Phase, { kind: 'preview' }>) => {
    setPhase({ ...current, saving: true, error: null })
    void runLatest(requests.current, () => commitImport(current.preview, DEPS),
      out => (out.kind === 'done' ? onImported(out.message) : setPhase({ kind: 'preview', preview: out.preview, changed: true, error: null, saving: false })),
      err => setPhase({ ...current, saving: false, error: importFailure(err) }))
  }

  const busy = phase.kind === 'reading' || (phase.kind === 'preview' && phase.saving)
  return (
    <section className="sheet r10 train" aria-labelledby="imp-h">
      <h2 id="imp-h" ref={titleRef} tabIndex={-1}>Importer des questions</h2>
      <p style={{ margin: 0, fontSize: '0.9375rem' }}>Une ligne par question, avec les colonnes du modèle. Zone, Question et Réponse sont obligatoires ; tout arrive en brouillon, en fin de zone.</p>
      <TemplateLink className="ink-line" />
      <div className="col g6">
        <label htmlFor="imp-file" className="f-lbl">FICHIER EXCEL .XLSX · 2 MO ET {MAX_IMPORT_ROWS.toLocaleString('fr-FR')} LIGNES AU PLUS · PREMIÈRE FEUILLE</label>
        <input id="imp-file" className="field" type="file" disabled={busy} onChange={pick} style={{ paddingTop: 10 }}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      </div>
      {phase.kind === 'reading' && <p className="mono" role="status" style={{ margin: 0 }}>LECTURE DE « {phase.fileName} »…</p>}
      {phase.kind === 'failed' && <p role="alert" style={{ margin: 0, color: 'var(--stamp)', fontWeight: 700 }}>{phase.text}</p>}
      {phase.kind === 'preview'
        ? <PreviewPanel phase={phase} onConfirm={() => confirm(phase)} onCancel={onClose} />
        : <div className="row"><button className="ink-line" onClick={onClose}>Annuler</button></div>}
    </section>
  )
}
