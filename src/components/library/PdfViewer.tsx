import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { openPdf, renderScale, type LoadedPdf } from '../../lib/pdf'

/** Marge d'anticipation : une page est dessinée quand elle arrive à cette distance de l'écran. */
const PRELOAD_MARGIN = '800px 0px'
const A4_RATIO = 1.414

type ViewerState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; doc: PDFDocumentProxy; pages: number; ratio: number }

/** Une page : emplacement aux proportions du document (pas de chevauchement), dessinée à l'approche de l'écran. */
function PdfPage({ doc, n, ratio }: { doc: PDFDocumentProxy; n: number; ratio: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    let task: RenderTask | null = null
    let alive = true
    const draw = async () => {
      try {
        const page = await doc.getPage(n)
        if (!alive) return
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: renderScale(el.clientWidth, base.width, window.devicePixelRatio || 1) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas indisponible')
        task = page.render({ canvasContext: ctx, viewport })
        await task.promise
        if (alive) el.replaceChildren(canvas)
      } catch (err) {
        const name = (err as { name?: string })?.name
        if (!alive || name === 'RenderingCancelledException') return
        console.error(`[xxb] Page ${n} illisible`, err)
        setFailed(err instanceof Error ? err.message : String(err))
      }
    }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); void draw() }
    }, { rootMargin: PRELOAD_MARGIN })
    io.observe(el)
    return () => { alive = false; io.disconnect(); task?.cancel() }
  }, [doc, n])
  return (
    <div ref={box} className="pdf-page" style={{ aspectRatio: `1 / ${ratio}` }} aria-label={`Page ${n}`}>
      {failed && <span className="pdf-msg">Page {n} illisible.</span>}
    </div>
  )
}

/** Lecteur PDF intégré (pdf.js) : fonctionne là où le navigateur refuse d'afficher un PDF en cadre (Android). */
export function PdfViewer({ file, title, maxPages }: { file: string; title: string; maxPages?: number }) {
  const [state, setState] = useState<ViewerState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    let loaded: LoadedPdf | null = null
    setState({ status: 'loading' })
    openPdf(file).then(async l => {
      loaded = l
      if (!alive) { l.cancel(); return }
      const first = await l.doc.getPage(1)
      const v = first.getViewport({ scale: 1 })
      if (alive) setState({ status: 'ready', doc: l.doc, pages: Math.min(l.doc.numPages, maxPages ?? Infinity), ratio: v.height / v.width || A4_RATIO })
    }).catch(err => {
      console.error(`[xxb] Aperçu impossible : ${file}`, err)
      if (alive) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    })
    return () => { alive = false; loaded?.cancel() }
  }, [file, maxPages])

  if (state.status === 'loading') return <div className="pdf-msg" role="status">Chargement de l’aperçu…</div>
  if (state.status === 'error') {
    return (
      <div className="pdf-msg col g10" role="alert" style={{ alignItems: 'center' }}>
        <span>L’aperçu n’a pas pu se charger. Le document reste lisible dans le lecteur du téléphone ou de l’ordinateur.</span>
        <a className="pdf-open" href={file} target="_blank" rel="noopener">Ouvrir le PDF ↗</a>
      </div>
    )
  }
  return (
    <div className="pdf-pages" aria-label={`Aperçu de ${title}, ${state.doc.numPages} pages`}>
      {Array.from({ length: state.pages }, (_, i) => <PdfPage key={i} doc={state.doc} n={i + 1} ratio={state.ratio} />)}
    </div>
  )
}
