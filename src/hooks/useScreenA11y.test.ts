// @vitest-environment happy-dom
/** Titre et focus à chaque changement d'écran (UX-13) : rendu minimal avec react-dom/client. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { useScreenA11y } from './useScreenA11y'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement

function Probe({ screen, title, enabled = true }: { screen: string; title: string; enabled?: boolean }) {
  useScreenA11y(enabled, screen, title)
  return createElement('div', { id: 'view' }, createElement('h1', null, `Titre ${screen}`), createElement('input', { 'aria-label': 'champ' }))
}

const render = (props: { screen: string; title: string; enabled?: boolean }) => act(() => { root!.render(createElement(Probe, props)) })
const heading = () => document.querySelector<HTMLElement>('#view h1')!

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root?.unmount())
  host.remove()
  document.title = ''
})

describe('useScreenA11y', () => {
  test('premier affichage : titre posé, focus laissé au navigateur', () => {
    render({ screen: 'bibliotheque', title: 'Bibliothèque · Xam Xam Bëy' })
    expect(document.title).toBe('Bibliothèque · Xam Xam Bëy')
    expect(document.activeElement).not.toBe(heading())
  })

  test('changement d’écran : nouveau titre et focus sur le titre principal', () => {
    render({ screen: 'bibliotheque', title: 'Bibliothèque · Xam Xam Bëy' })
    render({ screen: 'plan', title: 'Plan annuel · Xam Xam Bëy' })
    expect(document.title).toBe('Plan annuel · Xam Xam Bëy')
    expect(document.activeElement).toBe(heading())
    expect(heading().getAttribute('tabindex')).toBe('-1')
  })

  test('ne prend pas le focus pendant une saisie', () => {
    render({ screen: 'bibliotheque', title: 'a' })
    const input = document.querySelector<HTMLInputElement>('#view input')!
    input.focus()
    render({ screen: 'plan', title: 'b' })
    expect(document.activeElement).toBe(input)
  })

  test('désactivé (planches) : ni titre ni focus', () => {
    document.title = 'Planches'
    render({ screen: 'bibliotheque', title: 'a', enabled: false })
    render({ screen: 'plan', title: 'b', enabled: false })
    expect(document.title).toBe('Planches')
    expect(document.activeElement).not.toBe(heading())
  })
})
