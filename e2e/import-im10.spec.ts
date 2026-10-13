import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { expect, test } from './helpers'
import { fixture, openImport } from './qa-import-helpers'

/**
 * IM-10 (docs/squad/10-qa-import.md) : un .xlsx dont le répertoire central ET l'en-tête local annoncent 2 000 octets
 * pour une feuille de 64 Mo. Attendu : refus « trop volumineux », aucun Worker, et aucune tâche du fil principal
 * de plus d'1 s (PerformanceObserver « longtask »), CPU ralenti 4 fois (proche d'un mobile d'entrée de gamme).
 */
const CPU_SLOWDOWN = 4
const SHEET = 'xl/worksheets/sheet1.xml'
const LIE = 2000

function lyingXlsx(): Uint8Array {
  const parts = { ...unzipSync(new Uint8Array(readFileSync(fixture('../src/lib/__fixtures__/import-sample.xlsx')))), [SHEET]: new Uint8Array(64 * 1024 * 1024).fill(0x20) }
  const zip = zipSync(parts, { level: 6 })
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const name = new TextEncoder().encode(SHEET)
  for (let i = 0; i + 46 < zip.length; i += 1) {
    const sig = view.getUint32(i, true)
    const [nameAt, sizeAt] = sig === 0x04034b50 ? [i + 30, i + 22] : sig === 0x02014b50 ? [i + 46, i + 24] : [-1, -1]
    if (nameAt > 0 && name.every((b, k) => zip[nameAt + k] === b)) view.setUint32(sizeAt, LIE, true)
  }
  return zip
}

test.use({ viewport: { width: 360, height: 740 } })

test('IM-10 : zip menteur refusé sans geler l’onglet', async ({ page }) => {
  const file = join(mkdtempSync(join(tmpdir(), 'xxb-im10-')), 'menteur.xlsx')
  writeFileSync(file, lyingXlsx())
  const workers: string[] = []
  page.on('worker', w => workers.push(w.url()))
  await openImport(page, 'im10')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })
  await page.evaluate(() => {
    const w = window as unknown as { __longest: number }
    w.__longest = 0
    new PerformanceObserver(list => { list.getEntries().forEach(e => { w.__longest = Math.max(w.__longest, e.duration) }) }).observe({ type: 'longtask', buffered: false })
  })
  await page.getByLabel(/FICHIER EXCEL \.XLSX/).setInputFiles(file)
  await expect(page.getByRole('alert')).toContainText('Classeur trop volumineux une fois décompressé', { timeout: 15_000 })
  const longest = await page.evaluate(() => (window as unknown as { __longest: number }).__longest)
  test.info().annotations.push({ type: 'tâche la plus longue (ms)', description: String(Math.round(longest)) })
  process.stdout.write(`IM-10 : tâche la plus longue ${Math.round(longest)} ms (CPU / ${CPU_SLOWDOWN})\n`)
  expect(longest, `tâche la plus longue : ${Math.round(longest)} ms`).toBeLessThan(1000)
  expect(workers).toEqual([])
  await expect(page.getByLabel(/FICHIER EXCEL \.XLSX/)).toBeEnabled()
})
