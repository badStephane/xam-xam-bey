import { expect, test, type Page } from '@playwright/test'

/**
 * Responsivité (docs/squad/19-qa-responsive.md) : aucun débordement horizontal, barre du bas utilisable.
 * #app ne coupe plus les débordements (`overflow-x:clip` retiré) : un élément trop large se mesure ici.
 * Écrans sans compte (bibliothèque, connexion, séance et bilan de démonstration) : aucune donnée de la base n'est requise.
 */
const SIZES = [
  { name: '320', width: 320, height: 568 },
  // 360 px zoomé à 200 % : 180 px CSS (WCAG 1.4.10).
  { name: 'zoom 200 %', width: 180, height: 370 },
  { name: 'paysage', width: 740, height: 360 },
]
const SCREENS = [
  { name: 'bibliothèque', url: '/?screen=bibliotheque' },
  { name: 'connexion', url: '/?screen=revision' },
  { name: 'séance', url: '/?demo=1&screen=session' },
  { name: 'correction', url: '/?demo=1&screen=session&phase=answer' },
  { name: 'j’interroge', url: '/?demo=1&screen=session&mode=ask' },
  { name: 'bilan', url: '/?demo=1&screen=fin' },
]

/** Éléments visibles qui dépassent la fenêtre, hors zones qui défilent volontairement (puces, itinéraire). */
function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth
    const inScroller = (el: Element): boolean => {
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        if (getComputedStyle(e).overflowX !== 'visible') return true
      }
      return false
    }
    return [...document.querySelectorAll('#app *')]
      .filter(el => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && (r.right > w + 1 || r.left < -1) && !el.closest('.sr') && !inScroller(el)
      })
      .slice(0, 5)
      .map(el => `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''} « ${(el.textContent ?? '').trim().slice(0, 30)} »`)
  })
}

for (const size of SIZES) {
  test.describe(`responsivité ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })
    for (const screen of SCREENS) {
      test(`${screen.name} : pas de débordement horizontal`, async ({ page }) => {
        await page.goto(screen.url)
        await expect(page.locator('#app h1, #app h2').first()).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth), 'défilement horizontal').toBeLessThanOrEqual(size.width)
        expect(await overflowing(page)).toEqual([])
      })
    }
  })
}

test.describe('barre du bas', () => {
  for (const size of SIZES.filter(s => s.width < 760)) {
    test(`${size.name} : cinq cases d'au moins 44 px, libellés complets pour les lecteurs d'écran`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto('/?screen=bibliotheque')
      const nav = page.getByRole('navigation', { name: 'Navigation principale' }).last()
      for (const label of ['BIBLIOTHÈQUE', 'AUJOURD’HUI', 'PLAN', 'FICHES', 'PROGRÈS']) {
        const box = await nav.getByRole('button', { name: label, exact: true }).boundingBox()
        expect(box, label).not.toBeNull()
        expect(box!.width, `${label} : largeur`).toBeGreaterThanOrEqual(44)
        expect(box!.x + box!.width, `${label} : dans la fenêtre`).toBeLessThanOrEqual(size.width + 1)
      }
    })
  }
})

test('séance en paysage : Valider visible sans défiler', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 })
  await page.goto('/?demo=1&screen=session')
  await page.getByRole('radio').first().click()
  const box = await page.getByRole('button', { name: /Valider/ }).boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y + box!.height).toBeLessThanOrEqual(360)
})
