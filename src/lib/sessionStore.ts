import { QCM_SIZE } from './qcm'
import type { Card, Choices, Grade, QuizMode, Session } from './types'

/**
 * Séance en cours gardée pour l'onglet (E2) : Android recharge souvent l'onglet en arrière-plan.
 * Clé propre à chaque compte, état validé à la lecture, ignoré et effacé s'il est invalide, d'un autre compte ou d'un autre jour.
 */
export const SESSION_KEY_PREFIX = 'xxb.session.v1.'
export const sessionKey = (userId: string): string => `${SESSION_KEY_PREFIX}${userId}`

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

interface StoredItem {
  id: string
  second: boolean
  ch?: Choices
}

/** Forme enregistrée : les cartes par identifiant seulement, relues dans le contenu publié du moment. */
export interface SessionSnapshot {
  v: 1
  user: string
  day: number
  mode: QuizMode
  kind: string
  label: string
  name: string
  queue: StoredItem[]
  i: number
  rev: boolean
  res: Record<string, Grade>
  hist: Grade[]
  picked: number | null
  xp: number
}

export function toSnapshot(s: Session, user: string, day: number): SessionSnapshot {
  return {
    v: 1, user, day, mode: s.mode, kind: s.kind, label: s.label, name: s.name,
    queue: s.queue.map(q => ({ id: q.c.id, second: q.second, ...(q.ch ? { ch: q.ch } : {}) })),
    i: s.i, rev: s.rev, res: s.res, hist: s.hist, picked: s.picked, xp: s.xp,
  }
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const isGrade = (g: unknown): g is Grade => g === 0 || g === 1 || g === 2
const isStr = (v: unknown): v is string => typeof v === 'string'

function isChoices(ch: unknown): ch is Choices {
  const c = ch as Partial<Choices> | null
  if (!c || typeof c !== 'object' || !Array.isArray(c.options) || !c.options.every(isStr) || !isInt(c.correct)) return false
  // Auto-évaluation : aucune proposition. Sinon 2 à QCM_SIZE propositions et une bonne réponse parmi elles.
  if (c.options.length === 0) return c.correct === -1
  return c.options.length >= 2 && c.options.length <= QCM_SIZE && c.correct >= 0 && c.correct < c.options.length
}

function readQueue(raw: unknown, mode: QuizMode, byId: ReadonlyMap<string, Card>): Session['queue'] | null {
  if (!Array.isArray(raw) || !raw.length) return null
  const out: Session['queue'] = []
  for (const item of raw as Array<Partial<StoredItem> | null>) {
    const card = item && isStr(item.id) ? byId.get(item.id) : undefined
    if (!item || !card || typeof item.second !== 'boolean') return null
    if (item.ch !== undefined && !isChoices(item.ch)) return null
    // « Je réponds » sans propositions : la carte ne pourrait pas s'afficher.
    if (mode === 'self' && !item.ch) return null
    out.push({ c: card, second: item.second, ...(item.ch ? { ch: item.ch } : {}) })
  }
  return out
}

function readRes(raw: unknown, ids: ReadonlySet<string>): Record<string, Grade> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entries = Object.entries(raw as Record<string, unknown>)
  return entries.every(([id, g]) => ids.has(id) && isGrade(g)) ? (raw as Record<string, Grade>) : null
}

/**
 * Relit une séance enregistrée. null si la forme est mauvaise, si elle appartient à un autre compte ou à un autre jour,
 * ou si une de ses cartes n'est plus publiée.
 */
export function fromSnapshot(raw: unknown, user: string, today: number, cards: readonly Card[]): Session | null {
  const r = raw as Partial<SessionSnapshot> | null
  if (!r || typeof r !== 'object' || r.v !== 1 || r.user !== user || r.day !== today) return null
  if ((r.mode !== 'self' && r.mode !== 'ask') || !isStr(r.kind) || !isStr(r.label) || !isStr(r.name)) return null
  const queue = readQueue(r.queue, r.mode, new Map(cards.map(c => [c.id, c])))
  if (!queue || !isInt(r.i) || r.i < 0 || r.i >= queue.length || typeof r.rev !== 'boolean') return null
  const res = readRes(r.res, new Set(queue.map(q => q.c.id)))
  if (!res || !Array.isArray(r.hist) || !r.hist.every(isGrade)) return null
  // Une note par position déjà passée, plus éventuellement celle de la carte affichée (corrigée, pas encore quittée).
  const scored = r.hist.length === r.i + 1
  if (r.hist.length !== r.i && !scored) return null
  if ((scored || r.mode === 'ask') && !r.rev) return null
  const options = queue[r.i].ch?.options.length ?? 0
  if (r.picked !== null && !(isInt(r.picked) && r.picked >= 0 && r.picked < options)) return null
  if (!isInt(r.xp) || r.xp < 0) return null
  return {
    mode: r.mode, kind: r.kind, label: r.label, name: r.name, queue, i: r.i, rev: r.rev,
    res, hist: r.hist, picked: r.picked ?? null, xp: r.xp, done: false,
  }
}

/** Vrai si l'onglet garde une séance, quel qu'en soit le compte (avant que le compte soit connu). */
export function hasAnySessionSnapshot(store: Pick<Storage, 'length' | 'key'> | null): boolean {
  try {
    return !!store && Array.from({ length: store.length }, (_, i) => store.key(i)).some(k => !!k?.startsWith(SESSION_KEY_PREFIX))
  } catch {
    return false
  }
}

export function clearSessionSnapshot(store: KeyValueStore | null, user: string): void {
  try { store?.removeItem(sessionKey(user)) } catch { /* stockage indisponible : rien à effacer */ }
}

/** Enregistre la séance en cours ; une séance terminée efface l'enregistrement. */
export function saveSessionSnapshot(store: KeyValueStore | null, user: string, day: number, s: Session): void {
  if (s.done) { clearSessionSnapshot(store, user); return }
  try {
    store?.setItem(sessionKey(user), JSON.stringify(toSnapshot(s, user, day)))
  } catch {
    // Stockage plein ou bloqué : la séance continue, elle ne survivra simplement pas à un rechargement.
  }
}

/** Lit et valide la séance du compte ; un enregistrement illisible, périmé ou invalide est effacé. */
export function readSessionSnapshot(store: KeyValueStore | null, user: string, today: number, cards: readonly Card[]): Session | null {
  let raw: string | null = null
  try { raw = store?.getItem(sessionKey(user)) ?? null } catch { return null }
  if (raw === null) return null
  let session: Session | null = null
  try { session = fromSnapshot(JSON.parse(raw), user, today, cards) } catch { session = null }
  if (!session) clearSessionSnapshot(store, user)
  return session
}
