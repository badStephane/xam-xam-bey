// @vitest-environment happy-dom
/** Proposition d'installation (UX-37) : rendu minimal avec react-dom/client. L'état du module persiste d'un test à l'autre. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useInstallPrompt, type InstallPrompt } from './useInstallPrompt'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement
let seen: InstallPrompt

function Probe() {
  seen = useInstallPrompt()
  return null
}

/** `beforeinstallprompt` simulé, avec un prompt() espionné. */
function offerInstall(): ReturnType<typeof vi.fn> {
  const prompt = vi.fn(() => Promise.resolve())
  act(() => { window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt })) })
  return prompt
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(createElement(Probe)) })
})

afterEach(() => {
  act(() => root?.unmount())
  host.remove()
})

describe('useInstallPrompt', () => {
  test('sans proposition du navigateur (ordinateur, pas un iPhone) : rien à afficher', () => {
    expect(seen.offer).toBeNull()
  })

  test('le navigateur propose l’installation : bouton, puis la proposition n’est utilisée qu’une fois', () => {
    // Arrange
    const prompt = offerInstall()
    expect(seen.offer).toBe('prompt')
    // Act
    act(() => seen.install())
    // Assert
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(seen.offer).toBeNull()
    act(() => seen.install())
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  test('application installée : plus rien, même si une nouvelle proposition arrive', () => {
    offerInstall()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(seen.offer).toBeNull()
    offerInstall()
    expect(seen.offer).toBeNull()
  })
})
