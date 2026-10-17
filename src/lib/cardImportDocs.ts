import { plural } from './format'

/**
 * E4 (lot 3) : une question importée est reliée au document de sa zone dont le titre ou le nom de fichier
 * correspond à la colonne Source, ou au premier fichier nommé en tête d'un de ses morceaux (« x.pdf, p. 3 ; y.docx »). Comparaison sans casse ni accents, espaces réduits, extension retirée ;
 * tirets, soulignés et apostrophes valent une espace (« l_esprit » = « l'esprit » = « l esprit »).
 * Aucun document, ou plusieurs : `document_id` reste null, sans erreur ; l'aperçu le dit.
 */

/** Document lu pour l'import (colonnes publiques de la table documents). */
export interface ImportDocument { id: number; zone: number; title: string; file_name: string }

export type DocLink =
  /** Colonne Source vide. */
  | { kind: 'none' }
  | { kind: 'linked'; id: number; title: string }
  /** Source remplie, aucun document de la zone ne correspond. */
  | { kind: 'unknown' }
  /** Plusieurs documents de la zone correspondent : on ne choisit pas à la place de l'admin. */
  | { kind: 'ambiguous'; titles: string[] }

export const NO_DOC: DocLink = { kind: 'none' }

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Clé de correspondance d'une source, d'un titre ou d'un nom de fichier. */
export function docKey(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .trim()
    .replace(/\.(pdf|docx?)$/, '')
    .replace(/[_\-'’‘]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Index « zone|clé » vers les documents qui y répondent (un document compte une fois, titre et fichier compris). */
export type DocIndex = ReadonlyMap<string, readonly ImportDocument[]>

const indexKey = (zone: number, key: string): string => `${zone}|${key}`

export function buildDocIndex(docs: readonly ImportDocument[]): DocIndex {
  const pairs = docs.flatMap(d => [...new Set([docKey(d.title), docKey(d.file_name)])].filter(Boolean).map(k => [indexKey(d.zone, k), d] as const))
  return pairs.reduce<Map<string, readonly ImportDocument[]>>((acc, [k, d]) => {
    const list = acc.get(k) ?? []
    return list.some(x => x.id === d.id) ? acc : new Map(acc).set(k, [...list, d])
  }, new Map())
}

/** Nom de fichier en tête d'un morceau de source, extension comprise (« x.pdf, p. 3 » → « x.pdf »). */
const FILE_HEAD = /^\s*(.+?\.(?:pdf|docx?))(?=$|[\s,(])/i

/**
 * Clés essayées dans l'ordre : la source entière, puis le fichier en tête de chaque morceau séparé par « ; »
 * (« Bases du scoutisme.pdf, p. 16 ; fiches-BP.pdf »). Sans extension, pas de découpe : un titre peut contenir une virgule.
 */
function sourceKeys(src: string): string[] {
  const heads = src.split(';').map(part => FILE_HEAD.exec(part)?.[1] ?? '')
  return [...new Set([src, ...heads].map(docKey).filter(Boolean))]
}

function linkKey(key: string, zone: number, index: DocIndex): DocLink {
  const found = index.get(indexKey(zone, key)) ?? []
  if (found.length === 1) return { kind: 'linked', id: found[0].id, title: found[0].title }
  return found.length ? { kind: 'ambiguous', titles: found.map(d => d.title) } : { kind: 'unknown' }
}

/** Document relié à une ligne valide (zone connue) : première clé reliée, sinon première ambiguë, sinon inconnue. */
export function linkDocument(src: string, zone: number, index: DocIndex): DocLink {
  const keys = sourceKeys(src)
  if (!keys.length) return NO_DOC
  const links = keys.map(k => linkKey(k, zone, index))
  return links.find(l => l.kind === 'linked') ?? links.find(l => l.kind === 'ambiguous') ?? { kind: 'unknown' }
}

export const docIdOf = (link: DocLink): number | null => (link.kind === 'linked' ? link.id : null)

export interface DocSummary { linked: number; unknown: number; ambiguous: number; none: number }

export function summarizeDocs(links: readonly DocLink[]): DocSummary {
  return links.reduce<DocSummary>((acc, l) => ({ ...acc, [l.kind]: acc[l.kind] + 1 }), { linked: 0, unknown: 0, ambiguous: 0, none: 0 })
}

/** Résumé affiché dans l'aperçu ; les catégories vides sont omises. */
export function docSummaryText(s: DocSummary): string {
  const parts = [
    s.linked ? plural(s.linked, 'question reliée à son document', 'questions reliées à leur document') : null,
    s.unknown ? plural(s.unknown, 'source sans document correspondant', 'sources sans document correspondant') : null,
    s.ambiguous ? plural(s.ambiguous, 'source ambiguë (plusieurs documents)', 'sources ambiguës (plusieurs documents)') : null,
    s.none ? plural(s.none, 'ligne sans source', 'lignes sans source') : null,
  ].filter((x): x is string => x !== null)
  return parts.length ? `Documents : ${parts.join(', ')}.` : ''
}

/** Ce que devient une ligne dont la Source est remplie (ligne sans source : rien à dire). */
export function docLinkText(link: DocLink, src: string): string {
  switch (link.kind) {
    case 'linked': return `reliée à « ${link.title} »`
    case 'ambiguous': return `non reliée : « ${src} » désigne ${link.titles.length} documents de la zone (${link.titles.map(t => `« ${t} »`).join(', ')}). Choisissez le document dans l’éditeur après l’import.`
    case 'unknown': return `non reliée : aucun document de la zone ne s’appelle « ${src} » (titre ou nom de fichier).`
    case 'none': return 'sans source'
  }
}
