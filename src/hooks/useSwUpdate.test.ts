// @vitest-environment happy-dom
/** Nouvelle version prête (bouton RECHARGER) : rendu minimal avec react-dom/client, faux navigator.serviceWorker. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { SwUpdate } from './useSwUpdate'

/** Délai d'attente de la réponse du worker (src/hooks/useSwUpdate.ts). */
const SHELL_REPLY_TIMEOUT_MS = 3000

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null
let seen: SwUpdate

/** Faux worker : répond à la demande de coquille de la page par `shell` (null : ne répond jamais, ancien worker). */
const worker = (shell: string[] | null) => ({
  postMessage: (_msg: unknown, ports: MessagePort[]) => { if (shell) ports[0].postMessage(shell) },
})

/** Faux conteneur de service worker : `controller` modifiable, événement controllerchange. */
function fakeContainer(controller: object | null) {
  const target = new EventTarget()
  return Object.assign(target, { controller })
}

/** La page affichée : son script principal (relatif à la page, comme dans le build). */
function pageScript(src: string): void {
  document.querySelectorAll('script[data-test]').forEach(e => e.remove())
  const el = document.createElement('script')
  el.type = 'module'
  el.setAttribute('src', src)
  el.dataset.test = '1'
  document.head.appendChild(el)
}

/** Charge le module à neuf (son état est lu au chargement) avec ce conteneur, et monte une sonde. */
async function mount(container: ReturnType<typeof fakeContainer> | undefined): Promise<void> {
  vi.resetModules()
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })
  const { useSwUpdate } = await import('./useSwUpdate')
  function Probe() {
    seen = useSwUpdate()
    return null
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(createElement(Probe)) })
}

/** Un nouveau worker prend la main ; laisse passer sa réponse (port de message). */
async function takeOver(c: ReturnType<typeof fakeContainer>, next: object): Promise<void> {
  c.controller = next
  await act(async () => {
    c.dispatchEvent(new Event('controllerchange'))
    await new Promise(r => setTimeout(r, 20))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
})

describe('useSwUpdate', () => {
  test('page d’une version précédente : le nouveau worker qui prend la main propose de recharger', async () => {
    // Arrange
    pageScript('./assets/index-A1.js')
    const sw = fakeContainer(worker(['index.html', 'assets/index-A1.js']))
    await mount(sw)
    expect(seen.ready).toBe(false)
    // Act
    await takeOver(sw, worker(['index.html', 'assets/index-B2.js']))
    // Assert
    expect(seen.ready).toBe(true)
  })

  test('page déjà chargée avec le nouveau code (réseau d’abord) : rien à recharger', async () => {
    pageScript('./assets/index-B2.js')
    const sw = fakeContainer(worker(['index.html', 'assets/index-A1.js']))
    await mount(sw)
    await takeOver(sw, worker(['index.html', 'assets/index-B2.js']))
    expect(seen.ready).toBe(false)
  })

  test('nouveau worker muet (pas de réponse à temps) : bouton proposé', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      pageScript('./assets/index-B2.js')
      const sw = fakeContainer(worker(null))
      await mount(sw)
      sw.controller = worker(null)
      act(() => { sw.dispatchEvent(new Event('controllerchange')) })
      await act(async () => { await vi.advanceTimersByTimeAsync(SHELL_REPLY_TIMEOUT_MS) })
      expect(seen.ready).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  test('première visite : le worker qui s’installe prend la main sans rien proposer ; la version suivante, si', async () => {
    pageScript('./assets/index-A1.js')
    const sw = fakeContainer(null)
    await mount(sw)
    await takeOver(sw, worker(['index.html', 'assets/index-A1.js']))
    expect(seen.ready).toBe(false)
    await takeOver(sw, worker(['index.html', 'assets/index-B2.js']))
    expect(seen.ready).toBe(true)
  })

  test('navigateur sans service worker : jamais de bouton', async () => {
    await mount(undefined)
    expect(seen.ready).toBe(false)
  })
})
