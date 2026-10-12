import type { PDFDocumentProxy } from 'pdfjs-dist'

/** Largeur de rendu maximale (en pixels physiques) : au-delà, la mémoire des téléphones sature. */
export const MAX_RENDER_SCALE = 2
const ASSETS = 'pdfjs/'

/** Échelle de rendu d'une page pour une largeur d'affichage donnée, nette sur écran haute densité, plafonnée. */
export function renderScale(cssWidth: number, pageWidth: number, dpr: number): number {
  if (cssWidth <= 0 || pageWidth <= 0) return 1
  return Math.min(MAX_RENDER_SCALE, (cssWidth / pageWidth) * Math.max(1, dpr))
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

export interface LoadedPdf { doc: PDFDocumentProxy; cancel(): void }

/** Ouvre un PDF depuis une adresse, ou depuis son contenu (fichier choisi avant envoi). */
export async function openPdf(source: string | ArrayBuffer): Promise<LoadedPdf> {
  const pdfjs = await loadLib()
  const base = new URL(ASSETS, document.baseURI).href
  const task = pdfjs.getDocument({
    ...(typeof source === 'string' ? { url: source } : { data: new Uint8Array(source.slice(0)) }),
    isEvalSupported: false,
    standardFontDataUrl: `${base}standard_fonts/`,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
  })
  const doc = await task.promise
  return { doc, cancel: () => void task.destroy() }
}
