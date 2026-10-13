/**
 * Garde partagée du brouillon de question (UX-5) : l'éditeur signale une saisie non enregistrée,
 * la navigation hors de l'écran (onglet Admin, barre du bas) demande confirmation avant de l'abandonner.
 */
export const DISCARD_QUESTION = 'Abandonner cette question ? Les modifications seront perdues.'

let unsaved = false

export function markUnsavedDraft(value: boolean): void {
  unsaved = value
}

export const hasUnsavedDraft = (): boolean => unsaved

/** Vrai si l'on peut quitter : rien à perdre, ou l'admin confirme l'abandon. */
export function confirmLeaveDraft(ask: (question: string) => boolean = q => window.confirm(q)): boolean {
  return !unsaved || ask(DISCARD_QUESTION)
}
