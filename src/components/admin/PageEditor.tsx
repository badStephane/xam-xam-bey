import { useEffect, useState } from 'react'
import { DISCARD_QUESTION, markUnsavedDraft } from '../../lib/draftGuard'
import { pageFromText, pageToText, type DocPage } from '../../lib/docPage'
import { deletePage, savePage } from '../../lib/docPagesAdminApi'
import type { CardStatus, Doc } from '../../lib/types'
import { PageContent } from '../revision/DocPageView'

const TEMPLATE = `- Premier objectif de la page
- Deuxième objectif

## Titre de la première section
Source : p. 1-3
- Un point clé, avec les mots importants en **gras**.
- Un autre point.
> Ce qu'il faut absolument retenir.
! Un piège ou une contradiction entre documents.`

const errorText = (e: unknown): string => (e instanceof Error ? e.message : 'Action impossible. Réessayez.')

interface Props { doc: Doc; initial: DocPage | null; status: CardStatus | null; onClose(): void }

/** Éditeur d'une page de révision : texte à repères, aperçu, brouillon, publication, suppression. */
export function PageEditor({ doc, initial, status, onClose }: Props) {
  const start = initial ? pageToText(initial) : TEMPLATE
  const [text, setText] = useState(start)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [askDelete, setAskDelete] = useState(false)
  const dirty = text !== start
  const parsed = pageFromText(text)

  useEffect(() => {
    markUnsavedDraft(dirty)
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => { window.removeEventListener('beforeunload', onUnload); markUnsavedDraft(false) }
  }, [dirty])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      markUnsavedDraft(false)
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  const save = (next: CardStatus) => { if (parsed.ok) void run(() => savePage(doc.id, parsed.page, next)) }
  const close = () => { if (!dirty || window.confirm(DISCARD_QUESTION)) onClose() }

  return (
    <div className="col g12">
      <button className="btn-mono" style={{ alignSelf: 'flex-start' }} onClick={close}>← PAGES DE LA ZONE</button>
      <div className="col g4">
        <h2 style={{ margin: 0, font: '800 1.375rem/1.15 var(--f-doc)' }}>{doc.title}</h2>
        <span className="mono muted" style={{ fontSize: '0.6875rem' }}>{doc.cote} · {status === 'published' ? 'PUBLIÉE' : status === 'draft' ? 'BROUILLON' : 'NOUVELLE PAGE'}</span>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}>
        Repères en début de ligne : <code>- </code> objectif (avant la première section) ou point, <code>## </code> titre de section, <code>Source : </code> pages du document, <code>&gt; </code> à retenir, <code>! </code> attention. Une ligne sans repère prolonge la précédente. <code>**gras**</code> pour les mots clés.
      </p>
      <div className="seg3" role="radiogroup" aria-label="Affichage" style={{ maxWidth: 320 }}>
        <button role="radio" aria-checked={!preview} onClick={() => setPreview(false)}>TEXTE</button>
        <button role="radio" aria-checked={preview} onClick={() => setPreview(true)} disabled={!parsed.ok}>APERÇU</button>
      </div>
      {preview && parsed.ok
        ? <article className="sheet r10 fiche"><div className="fiche-body"><PageContent page={parsed.page} /></div></article>
        : <textarea className="field" aria-label="Contenu de la page" value={text} onChange={e => setText(e.target.value)} rows={24} spellCheck style={{ fontFamily: 'var(--f-mono)', fontSize: '0.875rem', lineHeight: 1.5, minHeight: 360 }} />}
      {!parsed.ok && <p className="warn-inline" role="alert" style={{ margin: 0 }}>{parsed.error}</p>}
      {error && <p className="warn-inline" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="two">
        <button className="ink-line" disabled={busy || !parsed.ok} onClick={() => save('draft')}>{status === 'published' ? 'Dépublier (brouillon)' : 'Enregistrer en brouillon'}</button>
        <button className="ink-btn" disabled={busy || !parsed.ok} onClick={() => save('published')}>{status === 'published' ? 'Enregistrer (reste publiée)' : 'Publier'}</button>
      </div>
      {status && (askDelete
        ? (
          <div className="two" role="group" aria-label="Confirmer la suppression">
            <button className="ink-btn" style={{ background: 'var(--stamp)', borderColor: 'var(--stamp)' }} disabled={busy} onClick={() => void run(() => deletePage(doc.id))}>Confirmer la suppression</button>
            <button className="ink-line" disabled={busy} onClick={() => setAskDelete(false)}>Garder la page</button>
          </div>
        )
        : <button className="btn-mono" style={{ alignSelf: 'flex-start', color: 'var(--stamp)' }} onClick={() => setAskDelete(true)}>SUPPRIMER LA PAGE</button>)}
    </div>
  )
}
