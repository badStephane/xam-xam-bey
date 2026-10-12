import { mdSpans } from '../lib/format'

/** Rend le markdown minimal des fiches et cartes (**gras**, *italique*) sans HTML brut. */
export function Md({ text }: { text: string | undefined }) {
  return <>{mdSpans(text).map((s, i) => s.bold ? <strong key={i}>{s.t}</strong> : s.italic ? <em key={i}>{s.t}</em> : <span key={i}>{s.t}</span>)}</>
}
