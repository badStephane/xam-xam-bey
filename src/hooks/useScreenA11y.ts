import { useEffect, useRef } from 'react'

const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']

/** Vrai si la personne est en train d'écrire : on ne lui prend pas le focus. */
function isTyping(el: Element | null): boolean {
  return !!el && (TYPING_TAGS.includes(el.tagName) || (el as HTMLElement).isContentEditable)
}

/**
 * Changement d'écran (UX-13, WCAG 2.4.2 et 2.4.3) : titre du document à jour et focus sur le titre principal de l'écran,
 * pour que le lecteur d'écran annonce la nouvelle page. Rien au premier affichage (le navigateur s'en charge),
 * ni pendant une saisie.
 */
export function useScreenA11y(enabled: boolean, screenKey: string, title: string): void {
  useEffect(() => {
    if (enabled) document.title = title
  }, [enabled, title])

  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (!enabled || isTyping(document.activeElement)) return
    const heading = document.querySelector<HTMLElement>('#view h1')
    if (!heading) return
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    heading.focus({ preventScroll: true })
  }, [enabled, screenKey])
}
