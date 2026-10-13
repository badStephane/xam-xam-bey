import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { isSwControlling } from '../../hooks/useOfflineDocs'
import { loadPdf, maxRenderScale, PdfCancelled, renderScale } from '../../lib/pdf'

/** Marge d'anticipation : une page est dessinée à cette distance de l'écran, et libérée au-delà (audit 22). */
const PRELOAD_MARGIN = '800px 0px'
const A4_RATIO = 1.414

type ViewerState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; doc: PDFDocumentProxy; pages: number; ratio: number }

/** Rend un canvas à la taille nulle : la mémoire de ses pixels est rendue tout de suite, sans attendre le ramasse-miettes. */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
  canvas.remove()
}

const deviceMemory = (): number | undefined => (navigator as Navigator & { deviceMemory?: number }).deviceMemory

/**
 * Une page : emplacement aux proportions du document (pas de chevauchement), dessinée à l'approche de l'écran,
 * puis libérée quand elle s'en éloigne (canvas à 0, ressources de la page rendues à pdf.js).
 */
function PdfPage({ doc, n, ratio }: { doc: PDFDocumentProxy; n: number; ratio: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    let task: RenderTask | null = null
    let canvas: HTMLCanvasElement | null = null
    let page: PDFPageProxy | null = null
    let alive = true
    let visible = false

    const release = (): void => {
      task?.cancel()
      task = null
      if (canvas) releaseCanvas(canvas)
      canvas = null
      try {
        page?.cleanup()
      } catch {
        // Document déjà détruit (aperçu fermé) : ses ressources sont déjà rendues.
      }
    }
    const draw = async (): Promise<void> => {
      try {
        page = page ?? await doc.getPage(n)
        if (!alive || !visible || canvas) return
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: renderScale(el.clientWidth, base.width, window.devicePixelRatio || 1, maxRenderScale(deviceMemory())) })
        const next = document.createElement('canvas')
        next.width = Math.floor(viewport.width)
        next.height = Math.floor(viewport.height)
        const ctx = next.getContext('2d')
        if (!ctx) throw new Error('Canvas indisponible')
        canvas = next
        task = page.render({ canvasContext: ctx, viewport })
        await task.promise
        task = null
        if (alive && visible && canvas === next) el.replaceChildren(next)
      } catch (err) {
        const name = (err as { name?: string })?.name
        if (!alive || name === 'RenderingCancelledException') return
        console.error(`[xxb] Page ${n} illisible`, err)
        setFailed(err instanceof Error ? err.message : String(err))
      }
    }
    const io = new IntersectionObserver(entries => {
      const now = entries[entries.length - 1]?.isIntersecting ?? false
      if (now === visible) return
      visible = now
      if (visible) void draw()
      else release()
    }, { rootMargin: PRELOAD_MARGIN })
    io.observe(el)
    return () => { alive = false; io.disconnect(); release() }
  }, [doc, n])
  return (
    <div ref={box} className="pdf-page" style={{ aspectRatio: `1 / ${ratio}` }} aria-label={`Page ${n}`}>
      {failed && <span className="pdf-msg">Page {n} illisible.</span>}
    </div>
  )
}

export interface PdfViewerProps { file: string; title: string; maxPages?: number }

/** Lecteur PDF intégré (pdf.js) : fonctionne là où le navigateur refuse d'afficher un PDF en cadre (Android). */
export function PdfViewer({ file, title, maxPages }: PdfViewerProps) {
  const [state, setState] = useState<ViewerState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    // Tâche annulable tout de suite : changer de pièce ou fermer l'aperçu arrête le téléchargement et libère le document.
    const load = loadPdf(file, { thumbnail: maxPages === 1, keptOffline: isSwControlling() })
    load.promise.then(async doc => {
      const first = await doc.getPage(1)
      const v = first.getViewport({ scale: 1 })
      if (alive) setState({ status: 'ready', doc, pages: Math.min(doc.numPages, maxPages ?? Infinity), ratio: v.height / v.width || A4_RATIO })
    }).catch(err => {
      if (!alive || err instanceof PdfCancelled) return
      console.error(`[xxb] Aperçu impossible : ${file}`, err)
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    })
    return () => { alive = false; load.destroy() }
  }, [file, maxPages])

  if (state.status === 'loading') return <div className="pdf-msg" role="status">Chargement de l’aperçu…</div>
  if (state.status === 'error') {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    return (
      <div className="pdf-msg col g10" role="alert" style={{ alignItems: 'center' }}>
        <span>{offline
          ? 'Hors réseau : ce document n’a pas encore été ouvert sur cet appareil. Il s’ouvrira au retour de la connexion.'
          : 'L’aperçu n’a pas pu se charger. Le document reste lisible dans le lecteur du téléphone ou de l’ordinateur.'}</span>
        {!offline && <a className="pdf-open" href={file} target="_blank" rel="noopener">Ouvrir le PDF ↗</a>}
      </div>
    )
  }
  return (
    <div className="pdf-pages" aria-label={`Aperçu de ${title}, ${state.doc.numPages} pages`}>
      {Array.from({ length: state.pages }, (_, i) => <PdfPage key={i} doc={state.doc} n={i + 1} ratio={state.ratio} />)}
    </div>
  )
}
