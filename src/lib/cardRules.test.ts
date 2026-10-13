import { describe, expect, test } from 'vitest'
import { checkCard, checkUpload, MAX_UPLOAD_BYTES, newCardId, QCM_ERRORS, readQcm, readStoredQcm, storagePathFor } from './cardRules'
import { seeded } from './qcm'

const base = { q: 'Quand ?', a: 'En 1907.', ok: '1907', no: ['1908', '1910', '1920'], note: '' }

describe('checkCard', () => {
  test('une carte complète passe', () => expect(checkCard(base)).toEqual({ errors: [], warnings: [] }))
  test('question et réponse vides bloquent', () => {
    expect(checkCard({ ...base, q: ' ', a: '' }).errors).toEqual(['La question est vide.', 'La réponse complète est vide.'])
  })
  test('sans QCM : accepté, sans avertissement', () => {
    expect(checkCard({ ...base, ok: '', no: ['', '', ''] })).toEqual({ errors: [], warnings: [] })
  })
  test('une ou deux mauvaises seulement : accepté', () => {
    expect(checkCard({ ...base, no: ['1908', '', ''] }).errors).toEqual([])
    expect(checkCard({ ...base, no: ['', '1910', '1920'] }).errors).toEqual([])
  })
  test('bonne sans mauvaise, ou mauvaises sans bonne : refusé avec un message clair', () => {
    expect(checkCard({ ...base, no: ['', ' ', ''] }).errors).toEqual([QCM_ERRORS.noWrong])
    expect(checkCard({ ...base, ok: ' ' }).errors).toEqual([QCM_ERRORS.noOk])
  })
  test('doublons sans accents ni casse bloquent', () => {
    expect(checkCard({ ...base, no: ['Été', 'ete', '1920'] }).errors).toHaveLength(1)
    expect(checkCard({ ...base, no: ['1907', '1910', '1920'] }).errors).toHaveLength(1)
  })
  test('bonne réponse trop longue ou devinable : avertissement', () => {
    const r = checkCard({ ...base, ok: 'Du 29 juillet au 9 août 1907, sur l’île de Brownsea, en Angleterre', no: ['1908', '1910', '1920'] })
    expect(r.errors).toEqual([])
    expect(r.warnings.some(w => w.includes('nettement plus longue'))).toBe(true)
  })
  test('markdown dans le QCM : avertissement', () => expect(checkCard({ ...base, ok: '**1907**' }).warnings).toHaveLength(1))
})

describe('readQcm (règle partagée éditeur et import)', () => {
  test('aucun QCM', () => expect(readQcm(' ', ['', ''])).toEqual({ ok: true, qcm: null }))
  test('bonne + 1 à 3 mauvaises, valeurs nettoyées', () => {
    expect(readQcm(' Oui ', ['', ' Non '])).toEqual({ ok: true, qcm: { ok: 'Oui', no: ['Non'] } })
    expect(readQcm('A', ['B', 'C', 'D'])).toEqual({ ok: true, qcm: { ok: 'A', no: ['B', 'C', 'D'] } })
  })
  test('cas refusés', () => {
    expect(readQcm('A', [])).toEqual({ ok: false, error: QCM_ERRORS.noWrong })
    expect(readQcm('', ['B'])).toEqual({ ok: false, error: QCM_ERRORS.noOk })
    expect(readQcm('A', ['A'])).toEqual({ ok: false, error: QCM_ERRORS.duplicate })
    expect(readQcm('A', ['B', 'C', 'D', 'E'])).toEqual({ ok: false, error: QCM_ERRORS.tooMany })
  })
  test.each([
    ['mauvaise égale à la bonne à la casse près', 'Paris', ['paris']],
    ['deux mauvaises identiques', 'A', ['B', 'B']],
    ['une mauvaise égale à la bonne, une autre valide', 'A', ['A', 'B']],
    ['accents seulement', 'Été', ['ete', 'Hiver']],
  ])('IM-1 : %s, refusé', (_, ok, no) => expect(readQcm(ok, no)).toEqual({ ok: false, error: QCM_ERRORS.duplicate }))
  test('readStoredQcm : jsonb absent, malformé ou valide', () => {
    expect(readStoredQcm(null)).toEqual({ ok: true, qcm: null })
    expect(readStoredQcm({ ok: 'A', no: ['a'] })).toEqual({ ok: false, error: QCM_ERRORS.duplicate })
    expect(readStoredQcm({ ok: 'A', no: [3, 'B'] })).toEqual({ ok: true, qcm: { ok: 'A', no: ['B'] } })
    expect(readStoredQcm('x')).toEqual({ ok: true, qcm: null })
    expect(readStoredQcm({ ok: 'A' })).toEqual({ ok: false, error: QCM_ERRORS.noWrong })
  })
})

describe('identifiants et fichiers', () => {
  test('newCardId respecte la contrainte de la table', () => expect(newCardId(4, seeded(1))).toMatch(/^t4-[a-z0-9]{6}$/))
  test('storagePathFor : nom ASCII, suffixe unique, extension .pdf', () => {
    expect(storagePathFor('Statuts SGDS été 2018.pdf', seeded(2))).toMatch(/^statuts-sgds-ete-2018-[a-z0-9]{6}\.pdf$/)
    expect(storagePathFor('***.pdf', seeded(3))).toMatch(/^document-[a-z0-9]{6}\.pdf$/)
  })
  test('checkUpload : PDF de 50 Mo au plus', () => {
    expect(checkUpload({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBeNull()
    expect(checkUpload({ name: 'a.docx', type: 'application/msword', size: 10 })).toMatch(/PDF/)
    expect(checkUpload({ name: 'a.pdf', type: 'application/pdf', size: MAX_UPLOAD_BYTES + 1 })).toMatch(/50 Mo/)
    expect(checkUpload({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatch(/vide/)
  })
})
