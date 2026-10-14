import { memo } from 'react'

const CENTERS: Array<[number, number, number, number]> = [[940, 140, 1, 0], [220, 560, 0.9, 1.6], [700, 820, 0.7, 0.8]]
const RINGS = 11
const STEPS = 72

function topoPaths(): string[] {
  return CENTERS.flatMap(([cx, cy, sc, ph]) => Array.from({ length: RINGS }, (_, idx) => {
    const i = idx + 1
    const r = i * 32 * sc
    const pts = Array.from({ length: STEPS + 1 }, (__, k) => {
      const a = (k / STEPS) * Math.PI * 2
      const rr = r * (1 + 0.17 * Math.sin(3 * a + i * 0.45 + ph) + 0.08 * Math.sin(5 * a + 1.3 + i * 0.25))
      return `${k ? 'L' : 'M'}${(cx + rr * Math.cos(a) * 1.3).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`
    })
    return pts.join('') + 'Z'
  }))
}
const PATHS = topoPaths()

/** Courbes de niveau en fond de carte. Le cadre les coupe à la hauteur de la page (R-4) : un écran court ne s'allonge plus. */
export const Topo = memo(function Topo() {
  return (
    <div id="topo-clip" aria-hidden="true">
      <svg id="topo" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMin slice">{PATHS.map((d, i) => <path key={i} d={d} />)}</svg>
    </div>
  )
})
