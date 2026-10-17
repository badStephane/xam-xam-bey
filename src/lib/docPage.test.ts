import { describe, expect, test } from 'vitest'
import { pageFromText, pageToText, validDocPage, type DocPage } from './docPage'
import { matchPages } from './docPageImport'
import { clearPagesCache, EMPTY_PAGES, pagesCacheKey, readPagesCache, writePagesCache } from './docPagesApi'

const PAGE: DocPage = {
  objectifs: ['Situer la cour d’honneur', 'Préparer la montée des couleurs'],
  sections: [
    { h: 'La cour d’honneur', items: ['Réunit le **CT** et les CP.', 'Se tient en secret.'], retenir: ['Elle décide de la vie de la troupe.'], attention: [], src: 'p. 4-5' },
    { h: 'Les couleurs', items: ['Le drapeau monte **lentement**.'], retenir: [], attention: ['Ne jamais laisser le drapeau toucher le sol.'], src: '' },
  ],
}

describe('validDocPage : données lues en base ou importées', () => {
  test('page complète gardée, listes facultatives complétées, espaces retirés', () => {
    const raw = { objectifs: [' Situer '], sections: [{ h: ' Titre ', items: [' a ', ''], src: ' p. 3 ' }] }
    expect(validDocPage(raw)).toEqual({ objectifs: ['Situer'], sections: [{ h: 'Titre', items: ['a'], retenir: [], attention: [], src: 'p. 3' }] })
  })
  test('rejette ce qui n’est pas une page', () => {
    expect(validDocPage(null)).toBeNull()
    expect(validDocPage({ objectifs: [], sections: [] })).toBeNull()
    expect(validDocPage({ objectifs: 'x', sections: [{ h: 'T', items: ['a'] }] })).toBeNull()
    expect(validDocPage({ objectifs: [], sections: [{ h: '', items: ['a'] }] })).toBeNull()
    expect(validDocPage({ objectifs: [], sections: [{ h: 'T', items: [] }] })).toBeNull()
    expect(validDocPage({ objectifs: [], sections: Array.from({ length: 13 }, () => ({ h: 'T', items: ['a'] })) })).toBeNull()
  })
  test('ignore les entrées non textuelles', () => {
    expect(validDocPage({ objectifs: [1, 'o'], sections: [{ h: 'T', items: ['a', 3], retenir: [null] }] })?.sections[0].items).toEqual(['a'])
  })
})

describe('format texte de l’éditeur', () => {
  test('aller-retour sans perte', () => {
    expect(pageFromText(pageToText(PAGE))).toEqual({ ok: true, page: PAGE })
  })
  test('texte lisible : objectifs, sections, source, à retenir, attention', () => {
    expect(pageToText(PAGE).split('\n').slice(0, 9)).toEqual([
      '- Situer la cour d’honneur', '- Préparer la montée des couleurs', '',
      '## La cour d’honneur', 'Source : p. 4-5', '- Réunit le **CT** et les CP.', '- Se tient en secret.', '> Elle décide de la vie de la troupe.', '',
    ])
  })
  test('une ligne sans repère prolonge le point précédent', () => {
    const r = pageFromText('## Titre\n- début\nsuite du point\n! attention\n  et sa fin')
    expect(r).toEqual({ ok: true, page: { objectifs: [], sections: [{ h: 'Titre', items: ['début suite du point'], retenir: [], attention: ['attention et sa fin'], src: '' }] } })
  })
  test('erreurs signalées avec le numéro de ligne', () => {
    expect(pageFromText('')).toEqual({ ok: false, error: 'Ajoutez au moins une section (ligne commençant par « ## »).' })
    expect(pageFromText('- objectif\n> à retenir hors section')).toEqual({ ok: false, error: 'Ligne 2 : « > » et « ! » doivent suivre un titre de section (« ## »).' })
    expect(pageFromText('## Vide\nSource : p. 2')).toEqual({ ok: false, error: 'Section « Vide » : ajoutez au moins un point (« - »).' })
    expect(pageFromText('texte libre')).toEqual({ ok: false, error: 'Ligne 1 : commencez par « - », « ## », « > » ou « ! ».' })
  })
})

describe('matchPages : pages importées reliées à leur document', () => {
  const docs = [
    { id: 1, th: 1, title: 'Bases du scoutisme', fileName: 'Bases du scoutisme.pdf' },
    { id: 2, th: 5, title: 'Dossier ASJ', fileName: 'asj.pdf' },
    { id: 3, th: 6, title: 'Dossier ASJ', fileName: 'asj.pdf' },
  ]
  const page = { objectifs: ['o'], sections: [{ h: 'T', items: ['a'] }] }
  test('par zone et nom de fichier (casse et accents ignorés), page existante sautée', () => {
    const r = matchPages([{ zone: 1, file: 'bases du scoutisme.PDF', ...page }, { zone: 5, file: 'asj.pdf', ...page }], docs, new Set([2]))
    expect(r.ready.map(x => x.docId)).toEqual([1])
    expect(r.skipped).toEqual(['asj.pdf'])
    expect(r.errors).toEqual([])
  })
  test('sans zone : nom unique seulement ; erreurs lisibles', () => {
    const r = matchPages([{ file: 'asj.pdf', ...page }, { file: 'inconnu.pdf', ...page }, { zone: 1, file: 'Bases du scoutisme.pdf', objectifs: [], sections: [] }, 'x'], docs, new Set())
    expect(r.ready).toEqual([])
    expect(r.errors).toEqual([
      'Page 1 (asj.pdf) : plusieurs documents portent ce nom, précisez la zone.',
      'Page 2 (inconnu.pdf) : aucun document de la bibliothèque ne porte ce nom.',
      'Page 3 (Bases du scoutisme.pdf) : contenu invalide (au moins une section avec un titre et un point).',
      'Page 4 : il manque le nom du fichier (« file »).',
    ])
  })
  test('noms proches dans la zone : le nom de fichier exact départage', () => {
    const near = [...docs, { id: 4, th: 5, title: 'Dossier ASJ', fileName: 'ASJ .pdf' }]
    const r = matchPages([{ zone: 6, file: 'asj.pdf', ...page }, { zone: 5, file: 'ASJ .pdf', ...page }, { zone: 5, file: 'Asj.pdf', ...page }], near, new Set())
    expect(r.ready.map(x => x.docId)).toEqual([3, 4])
    expect(r.errors).toEqual(['Page 3 (Asj.pdf) : plusieurs documents portent ce nom, précisez la zone.'])
  })
  test('deux pages pour le même document : la seconde est refusée', () => {
    const r = matchPages([{ zone: 1, file: 'Bases du scoutisme.pdf', ...page }, { zone: 1, file: 'Bases du scoutisme', ...page }], docs, new Set())
    expect(r.ready).toHaveLength(1)
    expect(r.errors).toEqual(['Page 2 (Bases du scoutisme) : ce document a déjà une page dans ce fichier.'])
  })
})

describe('copie locale des pages (hors réseau)', () => {
  const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } } }
  test('écrite puis relue pour le même compte seulement, effacée à l’oubli de l’appareil', () => {
    const s = store()
    writePagesCache(s, 'u1', { ids: [3, 4], pages: { 3: PAGE } })
    expect(readPagesCache(s, 'u1')).toEqual({ ids: [3, 4], pages: { 3: PAGE } })
    expect(readPagesCache(s, 'u2')).toEqual(EMPTY_PAGES)
    clearPagesCache(s, 'u1')
    expect(readPagesCache(s, 'u1')).toEqual(EMPTY_PAGES)
  })
  test('contenu illisible ou mal formé : ignoré', () => {
    const s = store()
    s.setItem(pagesCacheKey('u1'), '{oups')
    expect(readPagesCache(s, 'u1')).toEqual(EMPTY_PAGES)
    s.setItem(pagesCacheKey('u1'), JSON.stringify({ ids: [1, 'x', -2], pages: { 1: { sections: [] }, 2: PAGE } }))
    expect(readPagesCache(s, 'u1')).toEqual({ ids: [1], pages: { 2: PAGE } })
    expect(readPagesCache(null, 'u1')).toEqual(EMPTY_PAGES)
  })
})
