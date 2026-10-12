/** Paramètres d'URL : les planches pilotent l'écran, le thème et l'état affichés. */
export const SCREENS = ['bibliotheque', 'apercu', 'revision', 'session', 'fin', 'plan', 'fiches', 'progression', 'acces', 'horsligne'] as const
export type Screen = typeof SCREENS[number]

const p = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const raw = (k: string): string => p.get(k) || ''

export const PARAMS = {
  frame: raw('frame') === '1',
  demo: raw('demo') === '1',
  layout: (['mobile', 'desktop'].includes(raw('layout')) ? raw('layout') : 'auto') as 'auto' | 'mobile' | 'desktop',
  lib: (['loading', 'offline'].includes(raw('lib')) ? raw('lib') : 'normal') as 'normal' | 'loading' | 'offline',
  screen: ((SCREENS as readonly string[]).includes(raw('screen')) ? raw('screen') : null) as Screen | null,
  theme: (['dark', 'light'].includes(raw('theme')) ? raw('theme') : null) as 'dark' | 'light' | null,
  mode: raw('mode') === 'ask' ? 'ask' as const : 'self' as const,
  sel: Number(raw('sel').replace(/^r/, '')) || null,
  q: raw('q'),
  phase: raw('phase') || 'question',
}

export const isRevScreen = (s: Screen): boolean => !['bibliotheque', 'apercu'].includes(s)
