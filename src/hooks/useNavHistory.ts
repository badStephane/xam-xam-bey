import { useCallback, useEffect, useRef } from 'react'
import { hasAuthFragment, hashFor, navAction, parseHash, readState, sameEntry, type NavEntry, type NavState } from '../lib/navHistory'

interface NavRef {
  /** Position courante dans la pile propre au site. */
  idx: number
  /** Entrées connues par position (pour reconnaître un « retour » vers l'entrée précédente). */
  entries: Readonly<Record<number, NavEntry>>
  /** Un history.back() lancé par go() : le popstate qui suit ne doit rien rejouer. */
  expectPop: boolean
}

export interface NavHistory {
  /** À appeler à chaque go() : ajoute, remplace ou dépile une entrée. */
  record(from: NavEntry, to: NavEntry): void
  /** Réécrit l'entrée courante (bilan affiché à la place de la cible d'un retour). */
  replace(entry: NavEntry): void
  /** Annule un retour refusé (brouillon admin gardé) : l'écran resté affiché retrouve son entrée. */
  restore(entry: NavEntry): void
}

const stateOf = (xxb: NavEntry, idx: number): NavState => ({ xxb, idx })

/**
 * Bouton retour d'Android et du navigateur (FE-1, UX-2) : chaque écran a son entrée d'historique (`#plan`, `#apercu/12`).
 * `onPop` reçoit l'écran visé par un retour ou un avancer ; `current` donne l'écran affiché.
 */
export function useNavHistory(enabled: boolean, current: () => NavEntry, onPop: (target: NavEntry) => void): NavHistory {
  const nav = useRef<NavRef>({ idx: 0, entries: {}, expectPop: false })
  const handlers = useRef({ current, onPop })
  handlers.current = { current, onPop }

  useEffect(() => {
    if (!enabled) return
    const here = handlers.current.current()
    const saved = readState(history.state)
    const idx = saved && sameEntry(saved.xxb, here) ? saved.idx : 0
    nav.current = { idx, entries: { [idx]: here }, expectPop: false }
    // Sans changer l'adresse : les jetons du lien magique doivent rester lisibles par Supabase.
    history.replaceState(stateOf(here, idx), '')

    const onPopState = (ev: PopStateEvent) => {
      const n = nav.current
      const st = readState(ev.state)
      const parsed = st ? st.xxb : parseHash(location.hash)
      const idx = st ? st.idx : n.idx + 1
      if (hasAuthFragment(location.hash)) {
        // L2-1 : entrée morte du lien magique (même écran, jetons dans l'adresse). On efface les jetons
        // de cette entrée, puis on la saute : le popstate suivant traite l'entrée d'avant.
        const keep = handlers.current.current()
        history.replaceState(stateOf(keep, idx), '', location.pathname + location.search)
        nav.current = { idx, entries: { ...n.entries, [idx]: keep }, expectPop: false }
        history.back()
        return
      }
      if (!parsed) {
        // Fragment étranger (Supabase efface les jetons du lien magique) : on reste sur l'écran affiché.
        const keep = handlers.current.current()
        history.replaceState(stateOf(keep, idx), '')
        nav.current = { idx, entries: { ...n.entries, [idx]: keep }, expectPop: false }
        return
      }
      if (!st) history.replaceState(stateOf(parsed, idx), '')
      nav.current = { idx, entries: { ...n.entries, [idx]: parsed }, expectPop: false }
      if (!n.expectPop) handlers.current.onPop(parsed)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [enabled])

  const record = useCallback((from: NavEntry, to: NavEntry) => {
    if (!enabled) return
    const n = nav.current
    switch (navAction(from, to, n.entries[n.idx - 1] ?? null)) {
      case 'none': return
      case 'back':
        nav.current = { ...n, expectPop: true }
        history.back()
        return
      case 'replace':
        history.replaceState(stateOf(to, n.idx), '', hashFor(to))
        nav.current = { ...n, entries: { ...n.entries, [n.idx]: to } }
        return
      case 'push': {
        const idx = n.idx + 1
        history.pushState(stateOf(to, idx), '', hashFor(to))
        // Les entrées au-delà de la nouvelle position sont oubliées (même règle que le navigateur).
        const kept = Object.fromEntries(Object.entries(n.entries).filter(([k]) => Number(k) < idx))
        nav.current = { idx, entries: { ...kept, [idx]: to }, expectPop: false }
      }
    }
  }, [enabled])

  const replace = useCallback((entry: NavEntry) => {
    if (!enabled) return
    const n = nav.current
    history.replaceState(stateOf(entry, n.idx), '', hashFor(entry))
    nav.current = { ...n, entries: { ...n.entries, [n.idx]: entry } }
  }, [enabled])

  const restore = useCallback((entry: NavEntry) => {
    if (!enabled) return
    const n = nav.current
    const idx = n.idx + 1
    history.pushState(stateOf(entry, idx), '', hashFor(entry))
    nav.current = { idx, entries: { ...n.entries, [idx]: entry }, expectPop: false }
  }, [enabled])

  return { record, replace, restore }
}
