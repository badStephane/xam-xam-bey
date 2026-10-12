export function Segments({ count, on, className, colorOn }: { count: number; on: number; className: string; colorOn?: string }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <span key={i} className={i < on ? 'on' : undefined} style={i < on && colorOn ? { background: colorOn } : undefined} />)}
    </div>
  )
}
