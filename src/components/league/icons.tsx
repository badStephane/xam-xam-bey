import type { ReactNode } from 'react'

const svg = (children: ReactNode, size = 24) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

/** Icônes des 6 ligues (16-design C1, annexe A4) : trace, tente, boussole, flamme, baobab, étoile. */
const LEAGUE_ICONS: ReadonlyArray<() => JSX.Element> = [
  () => svg(<><ellipse cx="8" cy="15" rx="2.5" ry="4" /><ellipse cx="16" cy="9" rx="2.5" ry="4" /></>),
  () => svg(<><path d="M3 20 12 4l9 16z" /><path d="M12 4v16M9 20l3-6 3 6" /></>),
  () => svg(<><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>),
  () => svg(<><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 3 2 0-2-1-4 0-6z" /><path d="M5 21h14" /></>),
  () => svg(<><path d="M10 21v-8c-3 0-6-2-6-5s3-4 5-3c1-2 5-2 6 0 2-1 5 0 5 3s-3 5-6 5v8" /><path d="M8 21h8" /></>),
  () => svg(<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" />),
]

export function LeagueIcon({ tier }: { tier: number }) {
  const Icon = LEAGUE_ICONS[Math.min(LEAGUE_ICONS.length, Math.max(1, tier)) - 1]
  return <Icon />
}

/** Badge : plein si obtenu, en contour sinon (l'information est aussi écrite : « À DÉBLOQUER »). */
export function BadgeIcon({ earned }: { earned: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"
      fill={earned ? 'currentColor' : 'none'} style={{ color: earned ? 'var(--amber)' : 'var(--hud2)' }}>
      <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" />
    </svg>
  )
}
