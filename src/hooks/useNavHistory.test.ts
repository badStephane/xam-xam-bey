// @vitest-environment happy-dom
/**
 * Hook d'historique (FE-1, L2-1) : rendu minimal avec react-dom/client, popstate simulé.
 * history.back est espionné : on vérifie la décision du site, pas la pile du navigateur.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { NavEntry } from '../lib/navHistory'
import { useNavHistory, type NavHistory } from './useNavHistory'

const lib: NavEntry = { screen: 'bibliotheque', sel: null }
const rev: NavEntry = { screen: 'revision', sel: null }
const plan: NavEntry = { screen: 'plan', sel: null }

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Harness { nav: NavHistory; onPop: ReturnType<typeof vi.fn>; back: ReturnType<typeof vi.spyOn> }

let root: Root | null = null
let shown: NavEntry = rev

function mount(): Harness {
  const onPop = vi.fn((target: NavEntry) => { shown = target })
  const back = vi.spyOn(history, 'back').mockImplementation(() => undefined)
  const ref: { nav: NavHistory | null } = { nav: null }
  function Probe() {
    ref.nav = useNavHistory(true, () => shown, onPop)
    return null
  }
  root = createRoot(document.createElement('div'))
  act(() => { root!.render(createElement(Probe)) })
  return { nav: ref.nav!, onPop, back }
}

const pop = (state: unknown) => act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state })) })

beforeEach(() => {
  shown = rev
  history.replaceState(null, '', '/')
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  vi.restoreAllMocks()
})

describe('useNavHistory', () => {
  test('pose l’état de l’écran affiché au montage, sans changer l’adresse', () => {
    history.replaceState(null, '', '/#access_token=abc&refresh_token=def')
    mount()
    expect(history.state).toEqual({ xxb: rev, idx: 0 })
    expect(location.hash).toBe('#access_token=abc&refresh_token=def')
  })

  test('L2-1 : un retour sur l’entrée du lien magique efface les jetons de l’adresse et saute l’entrée', () => {
    const { onPop, back } = mount()
    // Entrée ajoutée par supabase-js (location.hash = '') puis retour vers l'entrée qui porte les jetons.
    history.replaceState(null, '', '/#access_token=abc&refresh_token=def&type=magiclink')
    pop({ xxb: rev, idx: 0 })
    expect(location.href).not.toMatch(/access_token|refresh_token/)
    expect(location.hash).toBe('')
    expect(history.state).toEqual({ xxb: rev, idx: 0 })
    expect(back).toHaveBeenCalledTimes(1)
    expect(onPop).not.toHaveBeenCalled()
  })

  test('L2-1 : même chose pour un lien en erreur (error_description)', () => {
    const { back } = mount()
    history.replaceState(null, '', '/#error=access_denied&error_description=expired')
    pop(null)
    expect(location.hash).toBe('')
    expect(back).toHaveBeenCalledTimes(1)
  })

  test('un fragment étranger sans jeton garde l’écran affiché, sans sauter d’entrée', () => {
    const { onPop, back } = mount()
    history.replaceState(null, '', '/')
    pop(null)
    expect(history.state).toEqual({ xxb: rev, idx: 1 })
    expect(back).not.toHaveBeenCalled()
    expect(onPop).not.toHaveBeenCalled()
  })

  test('push vers un écran, puis retour navigateur : onPop reçoit l’écran précédent', () => {
    const { nav, onPop } = mount()
    act(() => nav.record(rev, plan))
    expect(location.hash).toBe('#plan')
    expect(history.state).toEqual({ xxb: plan, idx: 1 })
    history.replaceState({ xxb: rev, idx: 0 }, '', '/#revision')
    pop({ xxb: rev, idx: 0 })
    expect(onPop).toHaveBeenCalledWith(rev)
  })

  test('RETOUR vers l’écran précédent passe par history.back, et le popstate qui suit ne rejoue rien', () => {
    const { nav, onPop, back } = mount()
    act(() => nav.record(rev, plan))
    act(() => nav.record(plan, rev))
    expect(back).toHaveBeenCalledTimes(1)
    pop({ xxb: rev, idx: 0 })
    expect(onPop).not.toHaveBeenCalled()
  })

  test('sortie de séance : l’entrée est remplacée, pas empilée', () => {
    shown = { screen: 'session', sel: null }
    const { nav } = mount()
    const before = history.length
    act(() => nav.record({ screen: 'session', sel: null }, { screen: 'fin', sel: null }))
    expect(history.length).toBe(before)
    expect(location.hash).toBe('#fin')
  })

  test('replace et restore réécrivent ou remettent l’entrée de l’écran gardé', () => {
    const { nav } = mount()
    act(() => nav.replace(lib))
    expect(history.state).toEqual({ xxb: lib, idx: 0 })
    act(() => nav.restore(plan))
    expect(history.state).toEqual({ xxb: plan, idx: 1 })
    expect(location.hash).toBe('#plan')
  })
})
