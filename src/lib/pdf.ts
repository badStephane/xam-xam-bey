import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'

/** Largeur de rendu maximale (en pixels physiques) : au-delà, la mémoire des téléphones sature. */
export const MAX_RENDER_SCALE = 2
/** Plafond abaissé sur les téléphones de 2 Go de mémoire ou moins (FE-8). */
export const LOW_MEMORY_RENDER_SCALE = 1.5
const LOW_MEMORY_GB = 2
const ASSETS = 'pdfjs/'

/** Plafond d'échelle selon la mémoire annoncée par le navigateur (`navigator.deviceMemory`, absent hors Chrome). */
export function maxRenderScale(deviceMemory: number | undefined): number {
  return deviceMemory !== undefined && deviceMemory > 0 && deviceMemory <= LOW_MEMORY_GB ? LOW_MEMORY_RENDER_SCALE : MAX_RENDER_SCALE
}

/** Échelle de rendu d'une page pour une largeur d'affichage donnée, nette sur écran haute densité, plafonnée. */
export function renderScale(cssWidth: number, pageWidth: number, dpr: number, max: number = MAX_RENDER_SCALE): number {
  if (cssWidth <= 0 || pageWidth <= 0) return 1
  return Math.min(max, (cssWidth / pageWidth) * Math.max(1, dpr))
}

export interface PdfLoadOptions {
  /** Vignette (une page) : seules les parties utiles du fichier sont demandées (FE-7). */
  thumbnail?: boolean
  /** Le service worker garde les PDF ouverts : le fichier entier est demandé en une fois pour pouvoir être gardé. */
  keptOffline?: boolean
}

type TransferOptions = Partial<Record<'disableRange' | 'disableStream' | 'disableAutoFetch', boolean>>

/**
 * Mode de téléchargement de pdf.js.
 * Service worker actif : une seule requête complète (pas de requêtes partielles, que le cache ne sait pas garder).
 * Sinon, vignette : requêtes partielles sans préchargement, pour ne pas tirer 50 Mo pour une page.
 */
export function transferOptions(o: PdfLoadOptions): TransferOptions {
  if (o.keptOffline) return { disableRange: true }
  if (o.thumbnail) return { disableAutoFetch: true, disableStream: true }
  return {}
}

let lib: Promise<typeof import('pdfjs-dist')> | null = null

/**
 * Charge pdf.js à la demande (édition « legacy » pour les navigateurs Android anciens).
 * Le worker est servi depuis le site lui-même, compatible avec la CSP.
 */
function loadLib(): Promise<typeof import('pdfjs-dist')> {
  if (!lib) {
    lib = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.min.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs as unknown as typeof import('pdfjs-dist')
    }).catch(err => {
      lib = null
      throw err
    })
  }
  return lib
}

/** Erreur levée quand le chargement est abandonné avant d'avoir commencé (démontage, changement de document). */
export class PdfCancelled extends Error {
  constructor() { super('Chargement du PDF abandonné'); this.name = 'PdfCancelled' }
}

export interface PdfLoad {
  promise: Promise<PDFDocumentProxy>
  /** Arrête le téléchargement en cours et libère le document et sa mémoire (audit 22). Sans effet si déjà appelé. */
  destroy(): void
}

/**
 * Ouvre un PDF depuis une adresse, ou depuis son contenu (fichier choisi avant envoi).
 * La tâche est annulable tout de suite, y compris pendant le chargement de pdf.js et le téléchargement (FE-7).
 */
export function loadPdf(source: string | ArrayBuffer, options: PdfLoadOptions = {}): PdfLoad {
  let destroyed = false
  let task: PDFDocumentLoadingTask | null = null
  const promise = loadLib().then(pdfjs => {
    if (destroyed) throw new PdfCancelled()
    const base = new URL(ASSETS, document.baseURI).href
    task = pdfjs.getDocument({
      ...(typeof source === 'string' ? { url: source, ...transferOptions(options) } : { data: new Uint8Array(source.slice(0)) }),
      isEvalSupported: false,
      standardFontDataUrl: `${base}standard_fonts/`,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
    })
    return task.promise
  })
  return {
    promise,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      void task?.destroy()
    },
  }
}

export interface LoadedPdf { doc: PDFDocumentProxy; cancel(): void }

/** Forme historique (espace admin) : attend le document puis renvoie de quoi le libérer. */
export async function openPdf(source: string | ArrayBuffer): Promise<LoadedPdf> {
  const load = loadPdf(source)
  const doc = await load.promise
  return { doc, cancel: load.destroy }
}
