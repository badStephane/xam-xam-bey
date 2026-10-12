import { describe, expect, test } from 'vitest'
import { checkCard, checkUpload, MAX_UPLOAD_BYTES, newCardId, storagePathFor } from './cardRules'
import { seeded } from './qcm'

const base = { q: 'Quand ?', a: 'En 1907.', ok: '1907', no: ['1908', '1910', '1920'], note: '' }

describe('checkCard', () => {
  test('une carte complète passe', () => expect(checkCard(base)).toEqual({ errors: [], warnings: [] }))
  test('champs vides et mauvaises réponses manquantes bloquent', () => {
    const r = checkCard({ ...base, q: ' ', ok: '', no: ['1908', '', '1920'] })
    expect(r.errors).toHaveLength(3)
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
