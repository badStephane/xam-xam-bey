import { docKey } from './cardImportDocs'
import { isRecord, text, validDocPage, type DocPage } from './docPage'

/* Import d'un fichier de pages (JSON) : chaque page désigne son document par `file` (nom de fichier ou titre) et `zone`. */
export interface PageDoc { id: number; th: number; title: string; fileName: string }
export interface PageImport { ready: Array<{ docId: number; title: string; page: DocPage }>; skipped: string[]; errors: string[] }

function findDocs(file: string, zone: unknown, docs: readonly PageDoc[]): PageDoc[] {
  const key = docKey(file)
  const named = docs.filter(d => docKey(d.fileName) === key || docKey(d.title) === key)
  const inZone = typeof zone === 'number' ? named.filter(d => d.th === zone) : named
  // Noms proches (accents, casse, espaces) : le nom de fichier écrit à l'identique départage.
  const exact = inZone.filter(d => d.fileName === file)
  return inZone.length > 1 && exact.length === 1 ? exact : inZone
}

/** Pages prêtes à insérer (en brouillon), pages sautées (le document en a déjà une) et erreurs par page. */
export function matchPages(raw: readonly unknown[], docs: readonly PageDoc[], existing: ReadonlySet<number>): PageImport {
  type Acc = PageImport & { taken: ReadonlySet<number> }
  const out = raw.reduce<Acc>((acc, entry, i) => {
    const file = isRecord(entry) ? text(entry.file) : ''
    const fail = (reason: string): Acc => ({ ...acc, errors: [...acc.errors, `Page ${i + 1}${file ? ` (${file})` : ''} : ${reason}`] })
    if (!isRecord(entry) || !file) return fail('il manque le nom du fichier (« file »).')
    const found = findDocs(file, entry.zone, docs)
    if (!found.length) return fail('aucun document de la bibliothèque ne porte ce nom.')
    if (found.length > 1) return fail('plusieurs documents portent ce nom, précisez la zone.')
    const page = validDocPage(entry)
    if (!page) return fail('contenu invalide (au moins une section avec un titre et un point).')
    const doc = found[0]
    if (acc.taken.has(doc.id)) return fail('ce document a déjà une page dans ce fichier.')
    const taken = new Set([...acc.taken, doc.id])
    if (existing.has(doc.id)) return { ...acc, skipped: [...acc.skipped, file], taken }
    return { ...acc, ready: [...acc.ready, { docId: doc.id, title: doc.title, page }], taken }
  }, { ready: [], skipped: [], errors: [], taken: new Set() })
  return { ready: out.ready, skipped: out.skipped, errors: out.errors }
}
