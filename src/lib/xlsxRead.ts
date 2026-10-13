/**
 * Lecture de la première feuille d'un .xlsx, chargée à la demande (import() dynamique : hors du bundle initial).
 *
 * IM-5 : read-excel-file décompresse avec `unzip()` de fflate, qui crée un Worker `blob:` pour toute partie de plus
 * de 512 Kio ; la CSP (`script-src 'self'`, sans `worker-src`) l'interdit et la lecture ne finissait jamais.
 * On décompresse donc nous-mêmes, en synchrone (`unzipSync`, aucun Worker), puis on repasse à la bibliothèque une
 * archive « stockée » (sans compression) : fflate n'y lance jamais de Worker. La CSP reste inchangée.
 * IM-8 : avant toute décompression, les tailles annoncées par le répertoire central du zip sont additionnées
 * et plafonnées. IM-10 : cette taille peut mentir ; la décompression se fait donc par flux (xlsxUnzip), bornée
 * sur les octets réellement produits, en rendant la main au navigateur. Délai global : la lecture ne peut plus
 * rester bloquée sans message.
 */
import { UnzipError, inflateParts } from './xlsxUnzip'

export type SheetCells = ReadonlyArray<ReadonlyArray<unknown>>

/**
 * Somme des parties XML une fois décompressées. 900 questions réalistes (réponses de 60 mots, QCM) font 1 Mo.
 * Lot 3 : 20 Mo ramenés à 8 Mo, car l'analyse XML de read-excel-file est synchrone : 18 Mo honnêtes prenaient
 * 1,2 s sur un poste de bureau (IM-10, objectif « fil principal jamais bloqué plus d'1 s »).
 */
export const MAX_UNZIPPED_BYTES = 8 * 1024 * 1024
export const READ_TIMEOUT_MS = 30_000

export const READ_ERRORS = {
  load: 'Le lecteur Excel n’a pas pu être chargé. Vérifiez la connexion et réessayez.',
  notXlsx: 'Fichier illisible : ce n’est pas un classeur .xlsx valide (fichier abîmé, ou ancien format .xls renommé). Ouvrez-le dans Excel et enregistrez-le au format .xlsx.',
  tooBig: 'Classeur trop volumineux une fois décompressé (plus de 8 Mo). Retirez les feuilles inutiles ou découpez-le en plusieurs fichiers.',
  timeout: 'La lecture du fichier a pris plus de 30 s et a été arrêtée. Réessayez, ou découpez le classeur en plusieurs fichiers.',
} as const

/** Seules les parties XML servent à la lecture (comme le filtre de read-excel-file) : images et binaires sont ignorés. */
const isXmlPart = (name: string): boolean => name.endsWith('.xml') || name.endsWith('.rels')

type Fflate = typeof import('fflate')

async function loadLibs() {
  return Promise.all([import('fflate'), import('read-excel-file/universal')]).catch((err: unknown) => {
    console.error('[xxb] Chargement du lecteur Excel impossible', err)
    throw new Error(READ_ERRORS.load)
  })
}

/** Taille décompressée annoncée par le répertoire central, sans rien décompresser (le filtre refuse tout). */
export function declaredXmlSize(fflate: Pick<Fflate, 'unzipSync'>, zip: Uint8Array): number {
  const sizes: number[] = []
  fflate.unzipSync(zip, { filter: f => { if (isXmlPart(f.name)) sizes.push(f.originalSize); return false } })
  return sizes.reduce((a, n) => a + n, 0)
}

/** Décompresse les parties XML (borne réelle) puis les réemballe sans compression (lecture sans Worker par la bibliothèque). */
async function repackStored(fflate: Fflate, zip: Uint8Array, maxBytes: number): Promise<ArrayBuffer> {
  const size = (() => {
    try { return declaredXmlSize(fflate, zip) } catch (err) {
      console.error('[xxb] Archive .xlsx illisible', err)
      throw new Error(READ_ERRORS.notXlsx)
    }
  })()
  if (size > maxBytes) throw new Error(READ_ERRORS.tooBig)
  try {
    const parts = await inflateParts(fflate, zip, { maxBytes, keep: isXmlPart })
    return fflate.zipSync(parts, { level: 0 }).buffer as ArrayBuffer
  } catch (err) {
    if (err instanceof UnzipError && err.reason === 'tooBig') throw new Error(READ_ERRORS.tooBig)
    console.error('[xxb] Décompression du .xlsx impossible', err)
    throw new Error(READ_ERRORS.notXlsx)
  }
}

async function readSheetNoWorker(input: Blob | ArrayBuffer, maxBytes: number): Promise<SheetCells> {
  const [fflate, lib] = await loadLibs()
  const zip = new Uint8Array(input instanceof Blob ? await input.arrayBuffer() : input)
  const stored = await repackStored(fflate, zip, maxBytes)
  try {
    return await lib.readSheet(stored, 1)
  } catch (err) {
    console.error('[xxb] Lecture du classeur impossible', err)
    throw new Error(READ_ERRORS.notXlsx)
  }
}

/** Rejette avec `message` si `task` n'a pas abouti dans le délai. */
export function withTimeout<T>(task: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expiry = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) })
  return Promise.race([task, expiry]).finally(() => clearTimeout(timer))
}

export interface ReadOptions { timeoutMs?: number; maxBytes?: number }

export function readFirstSheet(input: Blob | ArrayBuffer, opts: ReadOptions = {}): Promise<SheetCells> {
  const { timeoutMs = READ_TIMEOUT_MS, maxBytes = MAX_UNZIPPED_BYTES } = opts
  return withTimeout(readSheetNoWorker(input, maxBytes), timeoutMs, READ_ERRORS.timeout)
}
