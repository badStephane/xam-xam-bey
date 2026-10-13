/**
 * IM-10 : décompression par flux des parties XML d'un .xlsx, avec une borne sur les octets réellement produits.
 *
 * Le répertoire central d'un zip peut mentir sur la taille décompressée (IM-8 ne lit que la taille annoncée).
 * On pousse donc l'archive par petits morceaux dans `Unzip` + `UnzipInflate` de fflate (synchrones, aucun Worker,
 * compatibles avec la CSP `script-src 'self'`) et on compte chaque octet produit : dès que la borne est dépassée,
 * on s'arrête. Un morceau compressé de CHUNK_BYTES produit au plus ~1 032 fois sa taille (taux maximal de DEFLATE),
 * donc le travail fait après la borne reste petit. Entre deux tranches de SLICE_MS, on rend la main au navigateur.
 */

type Fflate = Pick<typeof import('fflate'), 'Unzip' | 'UnzipInflate'>

/** Morceau d'archive compressée poussé à la fois : 8 Kio donnent au plus ~8,3 Mo décompressés. */
export const CHUNK_BYTES = 8 * 1024
/** Durée maximale de travail d'affilée avant de rendre la main au fil principal. */
export const SLICE_MS = 50

export type UnzipFailure = 'tooBig' | 'invalid'

/** Échec de la décompression : `tooBig` (borne réelle dépassée) ou `invalid` (archive abîmée ou tronquée). */
export class UnzipError extends Error {
  constructor(readonly reason: UnzipFailure, readonly detail?: unknown) {
    super(reason === 'tooBig' ? 'Archive trop volumineuse une fois décompressée' : 'Archive illisible')
  }
}

export interface InflateOptions {
  maxBytes: number
  /** Parties à décompresser (les autres sont ignorées sans être décompressées). */
  keep(name: string): boolean
  /** Rend la main au navigateur (par défaut : une tâche `setTimeout(0)`). */
  pause?(): Promise<void>
  now?(): number
}

const nextTask = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  chunks.reduce((at, c) => { out.set(c, at); return at + c.length }, 0)
  return out
}

/** État d'une décompression : partagé avec les callbacks de fflate, local à un appel. */
interface Run { produced: number; failure: UnzipError | null; parts: Map<string, { chunks: Uint8Array[]; done: boolean }> }

function startUnzip(fflate: Fflate, run: Run, opts: InflateOptions): InstanceType<Fflate['Unzip']> {
  const fail = (err: UnzipError) => { run.failure = run.failure ?? err }
  const unzip = new fflate.Unzip(file => {
    if (!opts.keep(file.name) || run.parts.has(file.name)) return
    const part = { chunks: [] as Uint8Array[], done: false }
    run.parts.set(file.name, part)
    file.ondata = (err, data, final) => {
      if (run.failure) return
      if (err) { fail(new UnzipError('invalid', err)); return }
      run.produced += data.length
      if (run.produced > opts.maxBytes) { fail(new UnzipError('tooBig')); return }
      part.chunks.push(data)
      part.done = final
    }
    file.start()
  })
  unzip.register(fflate.UnzipInflate)
  return unzip
}

/**
 * Décompresse les parties retenues ; rejette avec `UnzipError('tooBig')` dès que plus de `maxBytes` octets
 * ont été produits, quelle que soit la taille annoncée par l'archive.
 */
export async function inflateParts(fflate: Fflate, zip: Uint8Array, opts: InflateOptions): Promise<Record<string, Uint8Array>> {
  const { pause = nextTask, now = () => performance.now() } = opts
  const run: Run = { produced: 0, failure: null, parts: new Map() }
  const unzip = startUnzip(fflate, run, opts)
  let sliceStart = now()
  for (let at = 0; at < zip.length; at += CHUNK_BYTES) {
    try {
      unzip.push(zip.subarray(at, at + CHUNK_BYTES), at + CHUNK_BYTES >= zip.length)
    } catch (err) {
      throw run.failure ?? new UnzipError('invalid', err)
    }
    if (run.failure) throw run.failure
    if (now() - sliceStart >= SLICE_MS) { await pause(); sliceStart = now() }
  }
  const entries = [...run.parts.entries()]
  if (!entries.length || entries.some(([, p]) => !p.done)) throw new UnzipError('invalid')
  return Object.fromEntries(entries.map(([name, p]) => [name, concat(p.chunks)]))
}
