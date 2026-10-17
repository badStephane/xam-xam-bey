import { readStoredQcm, WRONG_COUNT, type CardDraft } from './cardRules'
import { validTier } from './srs'
import type { CardRow, CardStatus } from './types'

/** État de l'éditeur de question. `zone` vient de la ligne éditée (FE-4), jamais de la zone sélectionnée à l'écran. */
export interface EditorState {
  id: string | null
  zone: number
  documentId: number | null
  src: string
  draft: CardDraft
  status: CardStatus
  /** Palier de difficulté (1 à 3). */
  tier: number
}

const emptyWrong = (): string[] => Array.from({ length: WRONG_COUNT }, () => '')

export function editorFromRow(r: CardRow): EditorState {
  const qcm = (r.qcm || {}) as { ok?: string; no?: string[] }
  const no = Array.from({ length: WRONG_COUNT }, (_, i) => qcm.no?.[i] || '')
  return { id: r.id, zone: r.zone, documentId: r.document_id, src: r.src, status: r.status, tier: validTier(r.tier), draft: { q: r.q, a: r.a, ok: qcm.ok || '', no, note: r.note } }
}

export function newEditor(zone: number, documentId: number | null, src: string): EditorState {
  return { id: null, zone, documentId, src, status: 'draft', tier: 1, draft: { q: '', a: '', ok: '', no: emptyWrong(), note: '' } }
}

const sameDraft = (a: CardDraft, b: CardDraft): boolean =>
  a.q === b.q && a.a === b.a && a.ok === b.ok && a.note === b.note && a.no.length === b.no.length && a.no.every((x, i) => x === b.no[i])

/** Vrai si la saisie diffère de l'état d'ouverture : il faut confirmer avant de l'abandonner (UX-5). */
export function isEditorDirty(initial: EditorState, current: EditorState): boolean {
  return initial.documentId !== current.documentId || initial.src !== current.src || initial.tier !== current.tier || !sameDraft(initial.draft, current.draft)
}

/** Raison qui interdit de publier une ligne depuis la liste (même règle QCM que l'éditeur et l'import), ou null. */
export function publishError(r: Pick<CardRow, 'q' | 'a' | 'qcm'>): string | null {
  if (!r.q.trim() || !r.a.trim()) return 'Publication impossible : question ou réponse vide. Corrigez-la avec « Modifier ».'
  const read = readStoredQcm(r.qcm)
  return read.ok ? null : `Publication impossible. ${read.error} Corrigez-la avec « Modifier ».`
}
