export type DocType = 'PDF' | 'DOC' | 'PPT' | 'XLS'
export type TypeFilter = 'all' | DocType

/** Entrée compacte du catalogue (data/catalog.site.json). */
export interface RawDoc {
  t: string
  p: string
  n?: string
  e: string
  s: number
  g?: number | null
  x?: number
  th: number
  d?: number
  es?: number
  f: string
}

export interface Doc {
  id: number
  th: number
  title: string
  folder: string
  ty: DocType
  ess: boolean
  scan: boolean
  pages: number | null
  size: number
  /** Nom du fichier d'origine (cité comme source par les cartes). */
  fileName: string
  /** Chemin dans le bucket de stockage « documents ». */
  storagePath: string
  /** Adresse de lecture et adresse de téléchargement. */
  file: string
  download: string
  cote: string
  key: string
}

/** Ligne de la table documents (Supabase). */
export interface DocumentRow {
  id: number
  zone: number
  title: string
  folder: string
  file_name: string
  storage_path: string
  size: number
  pages: number | null
  essential: boolean
  scan: boolean
}

/** QCM rédigé : bonne réponse courte et mauvaises réponses plausibles. */
export interface Qcm {
  ok: string
  no: string[]
}

export interface Card {
  id: string
  q: string
  a: string
  src: string
  note: string
  th: number
  qcm?: Qcm
  /** Document de la bibliothèque (documents.id) auquel la question est reliée (E4), sinon absent. */
  doc?: number
}

/** Propositions affichées pour une carte (ordre mélangé) et indice de la bonne. */
export interface Choices {
  options: string[]
  correct: number
}

/** [niveau, jour d'échéance, vues, réussites, premier jour vu] — jours depuis 1970 (UTC). */
export type CardProgress = [number, number, number, number, number]

export interface SessionLog {
  d: number
  n: number
  ok: number
  k: string
  l: string
}

export interface Progress {
  cards: Record<string, CardProgress>
  sessions: SessionLog[]
  xp: number
}

export interface PlanMonth {
  n: number
  o?: string
}

export interface Plan {
  months?: PlanMonth[]
  cadence?: string[]
}

export interface FicheSection {
  h?: string
  items?: string[]
  src?: string
}

export interface Fiche {
  titre?: string
  intro?: string
  sections?: FicheSection[]
  vigilance?: string[]
}

export type RawCard = Partial<Omit<Card, 'th'>>

export type CardStatus = 'draft' | 'published'

/** Ligne de la table cards (Supabase). */
export interface CardRow {
  id: string
  zone: number
  document_id: number | null
  position: number
  q: string
  a: string
  src: string
  note: string
  qcm: unknown
  status: CardStatus
}

export type Grade = 0 | 1 | 2
export type QuizMode = 'self' | 'ask'

export interface QueueItem {
  c: Card
  second: boolean
  ch?: Choices
}

export interface Session {
  mode: QuizMode
  kind: string
  label: string
  name: string
  queue: QueueItem[]
  i: number
  rev: boolean
  res: Record<string, Grade>
  hist: Grade[]
  /** Proposition choisie dans le QCM en cours (avant validation). */
  picked: number | null
  xp: number
  done: boolean
}

export type RevStatus = 'idle' | 'loading' | 'signedout' | 'ready' | 'empty' | 'unavailable'

export interface RevisionContent {
  plan: Plan | null
  fiches: Record<number, Fiche>
  cards: Record<number, Card[]>
}
