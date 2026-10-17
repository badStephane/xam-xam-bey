import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { analyzeImport, readSheetRows, rowQcm, type CardInsert, type ExistingCard, type ImportField } from './cardImport'
import { commitImport, previewImport, type ImportDeps } from './cardImportFlow'
import { checkCard } from './cardRules'
import { buildChoices, seeded } from './qcm'
import type { Card } from './types'
import { READ_ERRORS, readFirstSheet } from './xlsxRead'

/**
 * Recette QA de l'import Excel (docs/squad/10-qa-import.md). Fixtures produites par openpyxl, comme un tableur réel :
 * src/lib/__fixtures__/qa/make_qa_fixtures.py. Les `test.fails` décrivent un défaut ouvert (IM-n) : ils
 * passeront au rouge quand le défaut sera corrigé, il faudra alors les convertir en `test`.
 */
const fx = (name: string): ArrayBuffer => {
  const b = readFileSync(resolve(__dirname, '__fixtures__/qa', name))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}
const analyze = async (name: string, existing: ExistingCard[] = []) => {
  const parsed = readSheetRows(await readFirstSheet(fx(name)))
  if (!parsed.ok) throw new Error(parsed.error)
  return analyzeImport(parsed.rows, existing)
}
const silenceConsole = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('classeur « comme enregistré par un tableur » (openpyxl : inlineStr, styles, nombres, dates)', () => {
  test('en-têtes en ligne 3 décalés en colonne B, colonne en double et inconnue : lignes Excel exactes', async () => {
    const a = await analyze('excel-like.xlsx')
    expect(a.cards.map(c => [c.line, c.zone, c.q, c.a])).toEqual([
      [4, 3, 'Zone nombre', 'R'],
      [5, 3, 'Zone flottante 3.0', 'R'],
      [6, 3, 'Zone texte', 'R'],
      [8, 3, 'Espace insécable', 'R'], // « 3 » suivi d'une espace insécable accepté, insécable final retiré
      [10, 4, 'Emoji 🔥 et arabe مرحبا', 'Réponse ⚜️'],
      [11, 4, 'Date en réponse', '1907-08-01'],
      [12, 4, 'Nombres en QCM', 'Né en 1857'],
    ])
    expect(a.cards[6].qcm).toEqual({ ok: '1857', no: ['1907', '0.3', 'true'] })
    // Ligne 9 (remplie seulement dans une colonne inconnue) ignorée depuis IM-3.
    expect(a.errors.map(e => [e.line, e.zone])).toEqual([[7, null], [13, null], [14, 4], [15, null]])
    expect(a.errors[0].reason).toContain('« 3,0 »')
    expect(a.errors[1].reason).toContain('« 2026-01-03 »')
    expect(a.errors[2].reason).toBe('Réponse vide.') // formule sans valeur en cache
  })

  test('IM-3 : une ligne vide dans les colonnes du modèle mais remplie ailleurs n’est pas une erreur', async () => {
    const a = await analyze('excel-like.xlsx')
    expect(a.errors.map(e => e.line)).not.toContain(9)
  })

  test('formule avec valeur en cache (t="str") et chaîne inline lues', async () => {
    const a = await analyze('cached-formula-inline.xlsx')
    expect(a.cards.map(c => [c.q, c.a])).toEqual([['Question calculée', 'Réponse inline']])
  })

  test('formule sans cache ou cellule en erreur (#DIV/0!) : erreur de ligne, pas d’échec du fichier', async () => {
    expect((await analyze('formula-no-cache.xlsx')).errors).toEqual([{ line: 2, zone: 2, reason: 'Question vide.' }])
    expect((await analyze('error-cell.xlsx')).errors).toEqual([{ line: 2, zone: 2, reason: 'Réponse vide.' }])
  })

  test('feuille de consignes en premier : seule la première feuille est lue, refus clair', async () => {
    await expect(analyze('instructions-first.xlsx')).rejects.toThrow(/Colonnes obligatoires introuvables/)
  })

  test('.xls renommé en .xlsx : message dédié', async () => {
    const spy = silenceConsole()
    await expect(readFirstSheet(fx('xls-renamed.xlsx'))).rejects.toThrow(READ_ERRORS.notXlsx)
    spy.mockRestore()
  })

  test('limite : 1 000 lignes acceptées, 1 001 refusées', async () => {
    expect((await analyze('rows-1000.xlsx')).cards).toHaveLength(1000)
    await expect(analyze('rows-1001.xlsx')).rejects.toThrow(/1001 lignes de questions : 1 000 au plus/)
  })
})

describe('QCM : même règle dans l’éditeur et dans l’import (décision PM)', () => {
  const row = (ok: string, no: string[]): Record<ImportField, string> =>
    ({ zone: '1', q: 'Q', a: 'A', ok, no1: no[0] ?? '', no2: no[1] ?? '', no3: no[2] ?? '', src: '', note: '', tier: '' })
  const cases: Array<[string, string, string[]]> = [
    ['mauvaise égale à la bonne à la casse près', 'Paris', ['paris']],
    ['deux mauvaises identiques', 'A', ['B', 'B']],
    ['une mauvaise égale à la bonne, une autre valide', 'A', ['A', 'B']],
  ]
  test.each(cases)('IM-1 : %s, l’import refuse comme l’éditeur', (_label, ok, no) => {
    const editorRejects = checkCard({ q: 'Q', a: 'A', ok, no: [...no, '', ''].slice(0, 3), note: '' }).errors.length > 0
    expect(editorRejects).toBe(true)
    expect(rowQcm(row(ok, no)).ok).toBe(false)
  })

  test('IM-1 corrigé : « Paris / paris » refusé à l’import ; une donnée ancienne de ce type ne donne pas un QCM à une proposition', () => {
    expect(rowQcm(row('Paris', ['paris'])).ok).toBe(false)
    const legacy: Card = { id: 't1-aaaaaa', q: 'Q', a: 'A', src: '', note: '', th: 1, qcm: { ok: 'Paris', no: ['paris'] } }
    expect(buildChoices(legacy, [legacy], () => 0.5).options).toEqual([])
  })

  test('IM-6 corrigé : carte sans QCM, leurres complétés par les autres zones, auto-évaluation s’il n’y en a aucun', () => {
    const mk = (id: string, a: string, th = 1): Card => ({ id, q: `Q ${id}`, a, src: '', note: '', th })
    const lone = mk('t1-aaaaaa', 'Seule réponse.')
    const filled = buildChoices(lone, [lone, mk('t2-bbbbbb', 'Autre zone.', 2)])
    expect(filled.options.sort()).toEqual(['Autre zone', 'Seule réponse'])
    expect(buildChoices(lone, [lone]).options).toEqual([])
    const pool = [lone, mk('t1-b', 'Deux.'), mk('t1-c', 'Trois.'), mk('t1-d', 'Quatre.'), mk('t1-e', 'Cinq.')]
    const ch = buildChoices(lone, pool, () => 0.3)
    expect(ch.options).toHaveLength(4)
    expect(ch.options[ch.correct]).toBe('Seule réponse')
  })
})

describe('IM-6 : jamais de QCM à une seule proposition (propriété)', () => {
  test('pools aléatoires (zones, réponses en double, QCM rédigés dégénérés) : 0 proposition ou au moins 2, bonne réponse présente', () => {
    const rand = seeded(42)
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
    const answers = ['Oui.', 'oui', 'Non.', 'Peut-être.', 'OUI.', 'Jamais.', '**Oui**.']
    for (let run = 0; run < 2000; run += 1) {
      const size = 1 + Math.floor(rand() * 6)
      const pool: Card[] = Array.from({ length: size }, (_, i) => {
        const qcm = rand() < 0.4 ? { ok: pick(['Paris', 'Oui', 'A']), no: Array.from({ length: Math.floor(rand() * 3) }, () => pick(['paris', 'Paris', 'oui', 'B', 'b', 'C'])) } : undefined
        return { id: `c${i}`, q: `Q${i}`, a: pick(answers), src: '', note: '', th: 1 + Math.floor(rand() * 2), ...(qcm ? { qcm } : {}) }
      })
      for (const card of pool) {
        const ch = buildChoices(card, pool, rand)
        expect(ch.options.length === 0 || ch.options.length >= 2).toBe(true)
        if (ch.options.length) expect(ch.correct).toBeGreaterThanOrEqual(0)
        expect(new Set(ch.options.map(o => o.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())).size).toBe(ch.options.length)
      }
    }
  })
})

describe('concurrence et échec partiel', () => {
  const sheet = [['Zone', 'Question', 'Réponse'], [5, 'Q admin', 'A']]
  const file = () => new File([new Uint8Array([1])], 'q.xlsx')

  /** Base partagée : les deux relectures précèdent les deux insertions (deux admins, ou double clic non bloqué). */
  function sharedDb() {
    const rows: ExistingCard[] = [{ id: 't5-zzzzzz', zone: 5, q: 'Existante', position: 7 }]
    let gate!: () => void
    const bothRead = new Promise<void>(r => { gate = r })
    let reads = 0
    const deps: ImportDeps = {
      readSheet: async () => sheet,
      listExisting: async () => [...rows],
      insert: async (ins: readonly CardInsert[]) => { rows.push(...ins.map(r => ({ id: r.id, zone: r.zone, q: r.q, position: r.position }))); return ins.length },
    }
    const racing: ImportDeps = {
      ...deps,
      listExisting: async z => { const snap = await deps.listExisting(z); reads += 1; if (reads >= 2) gate(); await bothRead; return snap },
    }
    return { rows, deps, racing }
  }

  test.fails('IM-2 : deux imports simultanés du même fichier n’insèrent pas deux fois la question', async () => {
    const db = sharedDb()
    const p = await previewImport(file(), db.deps)
    await Promise.all([commitImport(p, db.racing), commitImport(p, db.racing)])
    expect(db.rows.filter(r => r.q === 'Q admin')).toHaveLength(1)
  })

  test('constat IM-2 : doublon de question et position 8 attribuée deux fois', async () => {
    const db = sharedDb()
    const p = await previewImport(file(), db.deps)
    const out = await Promise.all([commitImport(p, db.racing), commitImport(p, db.racing)])
    expect(out.map(o => o.kind)).toEqual(['done', 'done'])
    expect(db.rows.filter(r => r.q === 'Q admin').map(r => r.position)).toEqual([8, 8])
  })

  // IM-4 corrigé dans l'UI (UncertainWriteError, adminImport.test.ts et E2E du build) ; ici, le flux : l'erreur remonte telle quelle et le réessai se corrige.
  test('IM-4 : insertion validée en base puis réponse perdue : l’erreur remonte, le réessai ne réinsère rien', async () => {
    const db = sharedDb()
    const lost: ImportDeps = { ...db.deps, insert: async ins => { await db.deps.insert(ins); throw new Error('Délai dépassé') } }
    const p = await previewImport(file(), db.deps)
    await expect(commitImport(p, lost)).rejects.toThrow('Délai dépassé')
    expect(db.rows.filter(r => r.q === 'Q admin')).toHaveLength(1)
    const retry = await commitImport(p, db.deps)
    expect(retry.kind === 'changed' && retry.preview.analysis.cards).toEqual([])
  })
})
