/**
 * Page de révision d'un document (2026-10-18) : page de session guidée, objectifs puis sections courtes avec encadrés
 * « à retenir » et « attention ». Stockée dans `doc_pages.data`, validée à chaque lecture (base, cache, import).
 */
export interface DocSection { h: string; items: string[]; retenir: string[]; attention: string[]; src: string }
export interface DocPage { objectifs: string[]; sections: DocSection[] }

export const MAX_SECTIONS = 12
const MAX_ITEMS = 12
const MAX_TEXT = 800
/** Plafond de la base (check `octet_length(data::text) <= 60000`). */
export const MAX_PAGE_BYTES = 60000
const tooBig = (p: DocPage): boolean => new TextEncoder().encode(JSON.stringify(p)).length > MAX_PAGE_BYTES

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const text = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : '')
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter(Boolean).slice(0, MAX_ITEMS) : [])

function validSection(v: unknown): DocSection | null {
  if (!isRecord(v)) return null
  const section = { h: text(v.h), items: texts(v.items), retenir: texts(v.retenir), attention: texts(v.attention), src: text(v.src) }
  return section.h && section.items.length ? section : null
}

/** Page bien formée, sinon null : au moins une section, chacune avec un titre et un point. */
export function validDocPage(v: unknown): DocPage | null {
  if (!isRecord(v) || (v.objectifs !== undefined && !Array.isArray(v.objectifs)) || !Array.isArray(v.sections)) return null
  if (!v.sections.length || v.sections.length > MAX_SECTIONS) return null
  const sections = v.sections.map(validSection)
  if (!sections.every((s): s is DocSection => s !== null)) return null
  const page = { objectifs: texts(v.objectifs), sections }
  return tooBig(page) ? null : page
}

/* Format texte de l'éditeur Admin : « - » objectif (avant la première section) ou point, « ## » titre de section,
   « Source : » repère, « > » à retenir, « ! » attention ; une ligne sans repère prolonge la précédente. */
const SOURCE = 'Source :'

export function pageToText(p: DocPage): string {
  const head = p.objectifs.map(o => `- ${o}`)
  const body = p.sections.flatMap(s => [
    '', `## ${s.h}`, ...(s.src ? [`${SOURCE} ${s.src}`] : []),
    ...s.items.map(i => `- ${i}`), ...s.retenir.map(r => `> ${r}`), ...s.attention.map(a => `! ${a}`),
  ])
  return (head.length ? [...head, ...body] : body.slice(1)).join('\n')
}

export type PageParse = { ok: true; page: DocPage } | { ok: false; error: string }
type Slot = 'objectifs' | 'items' | 'retenir' | 'attention'
interface Draft { objectifs: string[]; sections: DocSection[]; last: Slot | null }

const appendLast = (list: readonly string[], more: string): string[] => [...list.slice(0, -1), `${list[list.length - 1]} ${more}`]

function updateLastSection(d: Draft, f: (s: DocSection) => DocSection): DocSection[] {
  return [...d.sections.slice(0, -1), f(d.sections[d.sections.length - 1])]
}

function withEntry(d: Draft, slot: Slot, value: string): Draft {
  if (slot === 'objectifs') return { ...d, objectifs: [...d.objectifs, value], last: slot }
  return { ...d, sections: updateLastSection(d, s => ({ ...s, [slot]: [...s[slot], value] })), last: slot }
}

function continued(d: Draft, slot: Slot, more: string): Draft {
  if (slot === 'objectifs') return { ...d, objectifs: appendLast(d.objectifs, more) }
  return { ...d, sections: updateLastSection(d, s => ({ ...s, [slot]: appendLast(s[slot], more) })) }
}

/** Une ligne lue : nouvel état, ou message d'erreur. */
function readLine(d: Draft, raw: string, n: number): Draft | string {
  const line = raw.trim()
  if (!line) return d
  if (line.startsWith('## ')) return { ...d, sections: [...d.sections, { h: line.slice(3).trim(), items: [], retenir: [], attention: [], src: '' }], last: null }
  const inSection = d.sections.length > 0
  if (line.startsWith('- ')) return withEntry(d, inSection ? 'items' : 'objectifs', line.slice(2).trim())
  if (/^[>!] /.test(line)) {
    if (!inSection) return `Ligne ${n} : « > » et « ! » doivent suivre un titre de section (« ## »).`
    return withEntry(d, line[0] === '>' ? 'retenir' : 'attention', line.slice(2).trim())
  }
  if (inSection && line.startsWith(SOURCE)) return { ...d, sections: updateLastSection(d, s => ({ ...s, src: line.slice(SOURCE.length).trim() })), last: null }
  if (d.last) return continued(d, d.last, line)
  return `Ligne ${n} : commencez par « - », « ## », « > » ou « ! ».`
}

export function pageFromText(src: string): PageParse {
  const read = src.split('\n').reduce<Draft | string>((d, line, i) => (typeof d === 'string' ? d : readLine(d, line, i + 1)), { objectifs: [], sections: [], last: null })
  if (typeof read === 'string') return { ok: false, error: read }
  if (!read.sections.length) return { ok: false, error: 'Ajoutez au moins une section (ligne commençant par « ## »).' }
  if (read.sections.length > MAX_SECTIONS) return { ok: false, error: `Au plus ${MAX_SECTIONS} sections par page.` }
  const empty = read.sections.find(s => !s.h || !s.items.length)
  if (empty) return { ok: false, error: `Section « ${empty.h} » : ajoutez au moins un point (« - »).` }
  const page = { objectifs: read.objectifs, sections: read.sections }
  if (tooBig(page)) return { ok: false, error: `Page trop longue pour être enregistrée : raccourcissez-la (60 000 octets au plus).` }
  return { ok: true, page }
}
