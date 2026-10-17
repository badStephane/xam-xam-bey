import { describe, expect, test } from 'vitest'
import { hasAuthFragment, hashFor, initialEntry, navAction, normalizeTarget, parseHash, readState, sameEntry } from './navHistory'

const lib = { screen: 'bibliotheque' as const, sel: null }
const rev = { screen: 'revision' as const, sel: null }
const sess = { screen: 'session' as const, sel: null }
const fin = { screen: 'fin' as const, sel: null }
const ap12 = { screen: 'apercu' as const, sel: 12 }

describe('hasAuthFragment (L2-1)', () => {
  test('reconnaît les jetons et les erreurs du lien magique, où qu’ils soient dans le fragment', () => {
    expect(hasAuthFragment('#access_token=abc&refresh_token=def&type=magiclink')).toBe(true)
    expect(hasAuthFragment('#type=magiclink&refresh_token=def')).toBe(true)
    expect(hasAuthFragment('#error=access_denied&error_description=Email+link+is+invalid')).toBe(true)
  })

  test('laisse passer les écrans du site, un fragment vide et les noms qui ne font que ressembler', () => {
    expect(hasAuthFragment('')).toBe(false)
    expect(hasAuthFragment('#')).toBe(false)
    expect(hasAuthFragment('#apercu/12')).toBe(false)
    expect(hasAuthFragment('#my_access_token=abc')).toBe(false)
  })
})

describe('parseHash et hashFor', () => {
  test('lit un écran connu et un aperçu avec sa pièce', () => {
    expect(parseHash('#plan')).toEqual({ screen: 'plan', sel: null })
    expect(parseHash('#apercu/12')).toEqual(ap12)
    expect(parseHash('#page/12')).toEqual({ screen: 'page', sel: 12 })
    expect(parseHash('#page')).toBeNull()
  })

  test('ignore les jetons du lien magique, les écrans inconnus et un aperçu sans pièce', () => {
    expect(parseHash('#access_token=abc&type=magiclink')).toBeNull()
    expect(parseHash('#error=access_denied')).toBeNull()
    expect(parseHash('#inconnu')).toBeNull()
    expect(parseHash('#apercu')).toBeNull()
    expect(parseHash('#apercu/0')).toBeNull()
    expect(parseHash('')).toBeNull()
  })

  test('aller-retour hash', () => {
    for (const e of [lib, rev, ap12, { screen: 'page' as const, sel: 7 }, { screen: 'admin' as const, sel: null }]) expect(parseHash(hashFor(e))).toEqual(e)
  })
})

describe('readState', () => {
  test('accepte l’état posé par le site', () => {
    expect(readState({ xxb: ap12, idx: 3 })).toEqual({ xxb: ap12, idx: 3 })
  })

  test('refuse un état étranger ou corrompu', () => {
    expect(readState(null)).toBeNull()
    expect(readState({ foo: 1 })).toBeNull()
    expect(readState({ xxb: { screen: 'nope', sel: null }, idx: 0 })).toBeNull()
    expect(readState({ xxb: lib, idx: -1 })).toBeNull()
    expect(readState({ xxb: { screen: 'apercu', sel: 'x' }, idx: 0 })).toBeNull()
  })
})

describe('initialEntry', () => {
  test('le hash prime sur ?screen=, qui prime sur la bibliothèque', () => {
    expect(initialEntry('#plan', 'revision', null)).toEqual({ screen: 'plan', sel: null })
    expect(initialEntry('#access_token=x', 'revision', null)).toEqual(rev)
    expect(initialEntry('', null, null)).toEqual(lib)
    expect(initialEntry('', 'apercu', 12)).toEqual(ap12)
  })

  test('une séance rechargée depuis le hash revient à l’écran du jour', () => {
    expect(initialEntry('#session', null, null)).toEqual(rev)
    expect(initialEntry('#fin', null, null)).toEqual(rev)
  })

  test('les planches gardent ?screen=session', () => {
    expect(initialEntry('', 'session', null)).toEqual(sess)
  })
})

describe('normalizeTarget', () => {
  test('séance ou bilan sans séance en mémoire : écran du jour', () => {
    expect(normalizeTarget(sess, false)).toEqual(rev)
    expect(normalizeTarget(fin, false)).toEqual(rev)
    expect(normalizeTarget(fin, true)).toEqual(fin)
    expect(normalizeTarget(lib, false)).toEqual(lib)
  })
})

describe('navAction', () => {
  test('même écran : rien', () => {
    expect(navAction(rev, rev, null)).toBe('none')
    expect(sameEntry(ap12, { screen: 'apercu', sel: 13 })).toBe(false)
  })

  test('retour vers l’entrée précédente : history.back()', () => {
    expect(navAction(ap12, lib, lib)).toBe('back')
    expect(navAction(fin, rev, rev)).toBe('back')
    expect(navAction(sess, rev, rev)).toBe('back')
  })

  test('sortie de séance vers le bilan : l’entrée de la séance est remplacée', () => {
    expect(navAction(sess, fin, rev)).toBe('replace')
  })

  test('nouvel écran : nouvelle entrée', () => {
    expect(navAction(lib, ap12, null)).toBe('push')
    expect(navAction(rev, sess, lib)).toBe('push')
  })
})
