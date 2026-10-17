import { describe, expect, test } from 'vitest'
import {
  MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, REASONS, analyzeImport, cellText, checkImportFile, importDoneMessage,
  matchHeaders, normalizeHeader, parseZone, planInserts, questionKey, readSheetRows, rowQcm, zonesOf,
  type ExistingCard, type ImportField, type SheetRow,
} from './cardImport'
import { QCM_ERRORS } from './cardRules'

const HEADER = ['Zone', 'Question', 'Réponse', 'Bonne proposition', 'Mauvaise 1', 'Mauvaise 2', 'Mauvaise 3', 'Source', 'Note']
const blank: Record<ImportField, string> = { zone: '', q: '', a: '', ok: '', no1: '', no2: '', no3: '', src: '', note: '', tier: '' }
const row = (line: number, patch: Partial<Record<ImportField, string>>): SheetRow => ({ line, values: { ...blank, ...patch } })
const valid = (line: number, zone: string, q: string): SheetRow => row(line, { zone, q, a: 'Réponse' })
const seq = (values: number[]) => { let i = 0; return () => values[i++ % values.length] }

describe('checkImportFile', () => {
  test('accepte un .xlsx de taille raisonnable', () => {
    expect(checkImportFile({ name: 'Questions.XLSX', size: 1000 })).toBeNull()
  })
  test.each([
    ['vieux.xls', /Ancien format Excel/],
    ['export.csv', /Fichier CSV/],
    ['notes.pdf', /format \.xlsx/],
  ])('refuse %s avec un message clair', (name, msg) => {
    expect(checkImportFile({ name, size: 1000 })).toMatch(msg)
  })
  test('refuse un fichier vide ou de plus de 2 Mo', () => {
    expect(checkImportFile({ name: 'a.xlsx', size: 0 })).toMatch(/vide/)
    expect(checkImportFile({ name: 'a.xlsx', size: MAX_IMPORT_BYTES + 1 })).toMatch(/2 Mo/)
    expect(checkImportFile({ name: 'a.xlsx', size: MAX_IMPORT_BYTES })).toBeNull()
  })
})

describe('en-têtes', () => {
  test('correspondance insensible à la casse, aux accents et aux espaces', () => {
    expect(normalizeHeader('  RÉPONSE ')).toBe('reponse')
    expect(normalizeHeader('Bonne   Proposition')).toBe('bonne proposition')
    const m = matchHeaders(['  zone', 'QUESTION', 'reponse', 'Inconnue', 'mauvaise 2'])
    expect(m).toEqual({ ok: true, columns: { zone: 0, q: 1, a: 2, no2: 4 } })
  })
  test('colonnes obligatoires manquantes : message qui les nomme', () => {
    const m = matchHeaders(['Zone', 'Note'])
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.error).toMatch(/Question, Réponse/)
  })
  test('la première occurrence d’une colonne l’emporte', () => {
    expect(matchHeaders(['Zone', 'Question', 'Réponse', 'Zone'])).toEqual({ ok: true, columns: { zone: 0, q: 1, a: 2 } })
  })
})

describe('readSheetRows', () => {
  test('numérote comme Excel, ignore les lignes vides sans décaler', () => {
    const r = readSheetRows([[null], HEADER, [1, 'Q1', 'A1'], [null, ''], [2, 'Q2', 'A2']])
    expect(r.ok && r.rows.map(x => [x.line, x.values.zone, x.values.q])).toEqual([[3, '1', 'Q1'], [5, '2', 'Q2']])
  })
  test('IM-3 : ligne remplie seulement dans une colonne inconnue, ignorée sans erreur ni décompte', () => {
    const r = readSheetRows([[...HEADER, 'Commentaire'], [1, 'Q1', 'A1'], [null, null, null, null, null, null, null, null, null, 'note libre'], [2, 'Q2', 'A2']])
    expect(r.ok && r.rows.map(x => x.line)).toEqual([2, 4])
    const many = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => [1, `Q${i}`, 'A'])
    const extra = Array.from({ length: 5 }, () => [null, null, null, null, null, null, null, null, null, '=A1'])
    expect(readSheetRows([[...HEADER, 'Commentaire'], ...many, ...extra]).ok).toBe(true)
  })
  test('feuille vide', () => {
    expect(readSheetRows([])).toEqual({ ok: false, error: expect.stringMatching(/vide/) })
  })
  test('en-têtes seuls : aucune ligne, pas d’erreur', () => {
    expect(readSheetRows([HEADER])).toEqual({ ok: true, rows: [] })
  })
  test(`plus de ${MAX_IMPORT_ROWS} lignes : refus`, () => {
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [1, `Q${i}`, 'A'])
    expect(readSheetRows([HEADER, ...many])).toEqual({ ok: false, error: expect.stringMatching(/1 000 au plus/) })
    expect(readSheetRows([HEADER, ...many.slice(1)]).ok).toBe(true)
  })
})

describe('cellules et zone', () => {
  test('cellText', () => {
    expect(cellText(null)).toBe('')
    expect(cellText(3)).toBe('3')
    expect(cellText(true)).toBe('true')
    expect(cellText(new Date('2026-10-13T00:00:00Z'))).toBe('2026-10-13')
    expect(cellText('  a ')).toBe('a')
  })
  test.each([['1', 1], ['12', 12], ['3.0', 3], ['03', 3]])('zone %s valide', (raw, z) => expect(parseZone(raw)).toBe(z))
  test.each(['0', '13', '2.5', '-1', 'trois', ''])('zone « %s » invalide', raw => expect(parseZone(raw)).toBeNull())
  test('zonesOf : zones valides distinctes, triées', () => {
    expect(zonesOf([valid(2, '3', 'a'), valid(3, '1', 'b'), valid(4, '3', 'c'), valid(5, '99', 'd')])).toEqual([1, 3])
  })
})

describe('rowQcm (règle partagée readQcm)', () => {
  test('aucune proposition : pas de QCM', () => expect(rowQcm(blank)).toEqual({ ok: true, qcm: null }))
  test('bonne + une mauvaise : QCM', () => expect(rowQcm({ ...blank, ok: 'Oui', no2: 'Non' })).toEqual({ ok: true, qcm: { ok: 'Oui', no: ['Non'] } }))
  test('bonne seule, mauvaise seule, ou mauvaises égales à la bonne : incomplet, raison précise', () => {
    expect(rowQcm({ ...blank, ok: 'Oui' })).toEqual({ ok: false, error: QCM_ERRORS.noWrong })
    expect(rowQcm({ ...blank, no1: 'Non' })).toEqual({ ok: false, error: QCM_ERRORS.noOk })
    expect(rowQcm({ ...blank, ok: 'Oui', no1: 'Oui' })).toEqual({ ok: false, error: QCM_ERRORS.duplicate })
  })
  test('IM-1 : une mauvaise égale à la bonne (casse, accents) est refusée, comme dans l’éditeur', () => {
    expect(rowQcm({ ...blank, ok: 'Oui', no1: 'oui', no3: 'Non' })).toEqual({ ok: false, error: QCM_ERRORS.duplicate })
  })
})

describe('questionKey (doublons)', () => {
  test('ignore casse, espaces et ponctuation finale, garde les accents', () => {
    expect(questionKey('  Quelle est la DEVISE  des scouts ? ')).toBe(questionKey('quelle est la devise des scouts'))
    expect(questionKey('C’est quoi ?!')).toBe(questionKey("c'est quoi"))
    expect(questionKey('Été')).not.toBe(questionKey('Ete'))
  })
})

describe('analyzeImport', () => {
  const existing: ExistingCard[] = [{ id: 't4-aaaaaa', zone: 4, q: 'Question déjà en base', position: 7 }]

  test('chaque cas d’erreur porte sa raison et son numéro de ligne', () => {
    const rows = [
      valid(2, '1', 'Quelle est la devise ?'),
      row(3, { zone: '13', q: 'Q', a: 'A' }),
      row(4, { zone: '', q: 'Q', a: 'A' }),
      row(5, { zone: '3', a: 'A' }),
      row(6, { zone: '3', q: 'Q' }),
      row(7, { zone: '3', q: 'Q', a: 'A', ok: 'Bonne seule' }),
      valid(8, '1', 'quelle est la  devise'),
      valid(9, '4', 'Question déjà en base ?'),
    ]
    const r = analyzeImport(rows, existing)
    expect(r.cards.map(c => c.line)).toEqual([2])
    expect(r.errors).toEqual([
      { line: 3, zone: null, reason: REASONS.zone('13') },
      { line: 4, zone: null, reason: REASONS.zone('') },
      { line: 5, zone: 3, reason: REASONS.q },
      { line: 6, zone: 3, reason: REASONS.a },
      { line: 7, zone: 3, reason: QCM_ERRORS.noWrong },
      { line: 8, zone: 1, reason: REASONS.inFile(2) },
      { line: 9, zone: 4, reason: REASONS.inBase(4) },
    ])
  })
  test('plusieurs raisons sur une ligne sont toutes données', () => {
    const r = analyzeImport([row(2, { zone: 'x', ok: 'B' })], [])
    expect(r.errors[0].reason).toBe([REASONS.zone('x'), REASONS.q, REASONS.a, QCM_ERRORS.noWrong].join(' '))
  })
  test('même question dans deux zones différentes : pas un doublon', () => {
    expect(analyzeImport([valid(2, '1', 'Q'), valid(3, '2', 'Q')], [{ id: 't3-x', zone: 3, q: 'Q', position: 1 }]).cards).toHaveLength(2)
  })
  test('une ligne en erreur ne bloque pas une copie valide plus bas', () => {
    const r = analyzeImport([row(2, { zone: '1', q: 'Q' }), valid(3, '1', 'Q')], [])
    expect(r.cards.map(c => c.line)).toEqual([3])
  })
  test('comptes par zone, zone invalide en dernier', () => {
    const r = analyzeImport([valid(2, '2', 'a'), valid(3, '1', 'b'), row(4, { zone: '1', q: 'c' }), row(5, { zone: '40', q: 'd', a: 'e' })], [])
    expect(r.byZone).toEqual([{ zone: 1, valid: 1, errors: 1 }, { zone: 2, valid: 1, errors: 0 }, { zone: null, valid: 0, errors: 1 }])
  })
  test('carte valide : champs repris, QCM ou null', () => {
    const r = analyzeImport([row(2, { zone: '5', q: 'Q', a: 'A', ok: 'O', no1: 'N', src: 'S', note: 'Nt' }), valid(3, '5', 'Q2')], [])
    expect(r.cards).toEqual([
      { line: 2, zone: 5, q: 'Q', a: 'A', src: 'S', note: 'Nt', qcm: { ok: 'O', no: ['N'] }, doc: { kind: 'unknown' }, tier: 1 },
      { line: 3, zone: 5, q: 'Q2', a: 'Réponse', src: '', note: '', qcm: null, doc: { kind: 'none' }, tier: 1 },
    ])
  })
})

describe('planInserts', () => {
  const existing: ExistingCard[] = [
    { id: 't1-aaaaaa', zone: 1, q: 'x', position: 4 }, { id: 't1-bbbbbb', zone: 1, q: 'y', position: 9 },
  ]
  test('brouillons en fin de zone : max + 1, + 2…, zone vide depuis 1', () => {
    const cards = analyzeImport([valid(2, '1', 'a'), valid(3, '2', 'b'), valid(4, '1', 'c')], existing).cards
    const rows = planInserts(cards, existing, seq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]))
    expect(rows.map(r => [r.zone, r.position, r.status, r.document_id])).toEqual([[1, 10, 'draft', null], [2, 1, 'draft', null], [1, 11, 'draft', null]])
    rows.forEach(r => expect(r.id).toMatch(new RegExp(`^t${r.zone}-[a-z0-9]{6}$`)))
  })
  test('identifiants uniques même si le hasard se répète, et distincts des existants', () => {
    const cards = analyzeImport([valid(2, '1', 'a'), valid(3, '1', 'b')], [])
    const id = (v: number) => Array(6).fill(v) as number[]
    // carte 1 : « aaaaaa » (pris en base) puis « ssssss » ; carte 2 : « aaaaaa », « ssssss » (pris dans le lot), puis « 999999 »
    const rand = seq([...id(0), ...id(0.5), ...id(0), ...id(0.5), ...id(0.99)])
    const rows = planInserts(cards.cards, [{ id: 't1-aaaaaa', zone: 1, q: 'z', position: 1 }], rand)
    expect(rows.map(r => r.id)).toEqual(['t1-ssssss', 't1-999999'])
  })
  test('hasard bloqué : erreur explicite plutôt qu’un doublon', () => {
    const cards = analyzeImport([valid(2, '1', 'a')], []).cards
    expect(() => planInserts(cards, [{ id: 't1-aaaaaa', zone: 1, q: 'z', position: 1 }], () => 0)).toThrow(/identifiant/)
  })
})

describe('importDoneMessage', () => {
  test('pluriel et zones', () => {
    expect(importDoneMessage([{ zone: 3 }, { zone: 1 }, { zone: 3 }])).toBe('3 questions importées en brouillon dans les zones 01, 03.')
    expect(importDoneMessage([{ zone: 12 }])).toBe('1 question importée en brouillon dans la zone 12.')
  })
})

describe('palier de difficulté (colonne facultative « Palier »)', () => {
  test('colonne absente ou vide : palier 1 ; 2 ou 3 lus', () => {
    const parsed = readSheetRows([[...HEADER, 'Palier'], [1, 'Q1', 'R'], [1, 'Q2', 'R', '', '', '', '', '', '', '3']])
    expect(parsed.ok).toBe(true)
    const { cards } = analyzeImport(parsed.ok ? parsed.rows : [], [])
    expect(cards.map(c => c.tier)).toEqual([1, 3])
    const rows = planInserts(cards, [])
    expect(rows.map(r => r.tier)).toEqual([1, 3])
    expect(matchHeaders(HEADER).ok).toBe(true)
  })
  test('palier invalide : ligne écartée avec un message clair', () => {
    const { cards, errors } = analyzeImport([row(2, { zone: '1', q: 'Q', a: 'R', tier: '5' })], [])
    expect(cards).toEqual([])
    expect(errors[0].reason).toBe(REASONS.tier('5'))
  })
})
