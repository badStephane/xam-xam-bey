import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as fflate from 'fflate'
import { describe, expect, test, vi } from 'vitest'
import { MAX_UNZIPPED_BYTES, READ_ERRORS, declaredXmlSize, readFirstSheet } from './xlsxRead'
import { CHUNK_BYTES, SLICE_MS, UnzipError, inflateParts } from './xlsxUnzip'

const SHEET = 'xl/worksheets/sheet1.xml'
const MB = 1024 * 1024
/** Feuille réelle du zip menteur : 2 fois la borne de readFirstSheet (8 Mo), assez pour la dépasser, rapide à fabriquer. */
const LIAR_BYTES = 2 * MAX_UNZIPPED_BYTES
/**
 * Fabriquer le menteur (16 Mo compressés en niveau 6) prend ~4 s sans charge, davantage sous couverture et machine chargée
 * (05-build, Lot 4 > SRE). Délai propre au premier test qui le fabrique (les suivants réutilisent la copie).
 */
const LIAR_BUILD_TIMEOUT_MS = 30_000

const sample = (): Uint8Array => new Uint8Array(readFileSync(resolve(__dirname, '__fixtures__/import-sample.xlsx')))

/** Écrit un entier 32 bits little-endian dans une copie de l'archive. */
const withU32 = (zip: Uint8Array, at: number, value: number): Uint8Array => {
  const out = zip.slice()
  new DataView(out.buffer).setUint32(at, value, true)
  return out
}

/** Offsets des champs « taille décompressée » de `name` : en-tête local (+22) et répertoire central (+24). */
function sizeFields(zip: Uint8Array, name: string): number[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const encoded = new TextEncoder().encode(name)
  const at: number[] = []
  for (let i = 0; i + 46 < zip.length; i += 1) {
    const sig = view.getUint32(i, true)
    const [nameAt, sizeAt] = sig === 0x04034b50 ? [i + 30, i + 22] : sig === 0x02014b50 ? [i + 46, i + 24] : [-1, -1]
    if (nameAt > 0 && encoded.every((b, k) => zip[nameAt + k] === b)) at.push(sizeAt)
  }
  return at
}

/**
 * IM-10 (docs/squad/10-qa-import.md, réserve d'IM-8) : classeur dont la feuille fait `bytes` octets décompressés,
 * mais dont le répertoire central ET l'en-tête local annoncent `lie` octets.
 */
function makeLiar(bytes: number, lie: number): Uint8Array {
  const parts = { ...fflate.unzipSync(sample()), [SHEET]: new Uint8Array(bytes).fill(0x20) }
  const zip = fflate.zipSync(parts, { level: 6 })
  return sizeFields(zip, SHEET).reduce((z, at) => withU32(z, at, lie), zip)
}
const liars = new Map<number, Uint8Array>()
const lyingXlsx = (bytes: number, lie = 2000): Uint8Array => {
  const zip = liars.get(bytes) ?? makeLiar(bytes, lie)
  liars.set(bytes, zip)
  return zip
}

const asBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
const keepXml = (n: string): boolean => n.endsWith('.xml') || n.endsWith('.rels')

describe('IM-10 : zip qui ment sur sa taille', () => {
  test('la fabrique produit bien un menteur : taille annoncée minuscule, archive petite', () => {
    const zip = lyingXlsx(LIAR_BYTES)
    expect(zip.length).toBeLessThan(MB)
    expect(declaredXmlSize(fflate, zip)).toBeLessThan(20_000)
  }, LIAR_BUILD_TIMEOUT_MS)

  // L3-1 (12-qa-lot3.md) : aucune mesure à l'horloge murale ici, elle dépend de la charge de la machine. L'arrêt dès la
  // borne est prouvé par le test suivant (octets produits) ; la non-congélation du fil, par l'E2E IM-10 sous CPU / 4.
  test('refus « trop volumineux » sur la borne réelle, malgré la taille annoncée minuscule', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(readFirstSheet(asBuffer(lyingXlsx(LIAR_BYTES)))).rejects.toThrow(READ_ERRORS.tooBig)
  })

  test('la borne porte sur les octets produits : arrêt juste après la borne, jamais une décompression complète', async () => {
    const produced: number[] = []
    const zip = lyingXlsx(LIAR_BYTES)
    const counting = {
      Unzip: fflate.Unzip,
      UnzipInflate: class extends fflate.UnzipInflate {
        push(chunk: Uint8Array, final: boolean) {
          const out = this.ondata
          this.ondata = (err, data, fin) => { if (data) produced.push(data.length); out(err, data, fin) }
          super.push(chunk, final)
          this.ondata = out
        }
      },
    }
    await expect(inflateParts(counting, zip, { maxBytes: 4 * MB, keep: keepXml })).rejects.toMatchObject({ reason: 'tooBig' })
    const total = produced.reduce((a, n) => a + n, 0)
    expect(total).toBeGreaterThan(4 * MB)
    expect(total).toBeLessThan(4 * MB + CHUNK_BYTES * 1100)
  })

  test('le fil principal est rendu entre les tranches de travail', async () => {
    let clock = 0
    const pause = vi.fn(async () => undefined)
    const now = () => { clock += SLICE_MS; return clock }
    const zip = lyingXlsx(8 * MB)
    const parts = await inflateParts(fflate, zip, { maxBytes: 20 * MB, keep: keepXml, pause, now })
    expect(parts[SHEET].length).toBe(8 * MB)
    expect(pause).toHaveBeenCalled()
  })
})

describe('inflateParts : archives honnêtes et abîmées', () => {
  test('restitue les parties XML à l’identique et ignore les autres', async () => {
    const parts: Record<string, Uint8Array> = { ...fflate.unzipSync(sample()), 'xl/media/image1.png': new Uint8Array([1, 2, 3]) }
    const zip = fflate.zipSync(parts, { level: 6 })
    const out = await inflateParts(fflate, zip, { maxBytes: 20 * MB, keep: keepXml })
    expect(Object.keys(out).sort()).toEqual(Object.keys(parts).filter(keepXml).sort())
    expect(out[SHEET]).toEqual(parts[SHEET])
  })

  test('archive tronquée ou vide : illisible', async () => {
    const zip = fflate.zipSync({ [SHEET]: new Uint8Array(100_000).fill(65) }, { level: 6 })
    await expect(inflateParts(fflate, zip.subarray(0, 60), { maxBytes: MB, keep: keepXml })).rejects.toBeInstanceOf(UnzipError)
    await expect(inflateParts(fflate, new Uint8Array(0), { maxBytes: MB, keep: keepXml })).rejects.toMatchObject({ reason: 'invalid' })
  })

  test('flux DEFLATE corrompu : illisible, pas trop gros', async () => {
    const zip = fflate.zipSync({ [SHEET]: new Uint8Array(100_000).map((_, i) => i % 251) }, { level: 6 })
    const bad = zip.slice()
    bad.fill(0xff, 40, 200)
    await expect(inflateParts(fflate, bad, { maxBytes: MB, keep: keepXml })).rejects.toMatchObject({ reason: 'invalid' })
  })
})
