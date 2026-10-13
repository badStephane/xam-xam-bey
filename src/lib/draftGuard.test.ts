import { afterEach, describe, expect, test, vi } from 'vitest'
import { confirmLeaveDraft, DISCARD_QUESTION, hasUnsavedDraft, markUnsavedDraft } from './draftGuard'

afterEach(() => markUnsavedDraft(false))

describe('garde du brouillon admin (UX-5, changement d’onglet)', () => {
  test('aucun brouillon modifié : on part sans question', () => {
    const ask = vi.fn(() => false)
    expect(confirmLeaveDraft(ask)).toBe(true)
    expect(ask).not.toHaveBeenCalled()
  })
  test('brouillon modifié : on demande, et on reste si l’admin refuse', () => {
    markUnsavedDraft(true)
    expect(hasUnsavedDraft()).toBe(true)
    const ask = vi.fn(() => false)
    expect(confirmLeaveDraft(ask)).toBe(false)
    expect(ask).toHaveBeenCalledWith(DISCARD_QUESTION)
    expect(confirmLeaveDraft(() => true)).toBe(true)
  })
})
