import { useId, useRef, useState, type FormEvent } from 'react'
import { useRevisionOffline } from '../revision/OfflineNotice'
import { setPseudo } from '../../lib/leagueApi'
import { allowTry, PSEUDO_MESSAGES, pseudoErrorMessage, pseudoFormatError, randomPseudo } from '../../lib/pseudo'

interface Props {
  /** Pseudo enregistré : le parent recharge l'état de ligue et affiche la bienvenue. */
  onDone(pseudo: string): void
}

/**
 * Choix du pseudo (16-design C5) : vérification à la sortie du champ et à l'envoi, jamais pendant la frappe. Une erreur
 * affichée disparaît dès qu'on corrige (sinon elle disparaît à la sortie du champ et le bouton se déplace sous le doigt).
 */
export function PseudoForm({ onDone }: Props) {
  const offline = useRevisionOffline()
  const id = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const tries = useRef<number[]>([])
  const check = (): string | null => {
    const e = value.trim() ? pseudoFormatError(value) : null
    setError(e)
    return e
  }
  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (busy || offline) return
    const e = pseudoFormatError(value)
    setError(e)
    if (e) return
    const next = allowTry(tries.current, Date.now())
    if (!next) { setError(PSEUDO_MESSAGES.rate); return }
    tries.current = next
    setBusy(true)
    const tried = value.trim()
    const r = await setPseudo(tried)
    setBusy(false)
    if (!r.ok) { setError(pseudoErrorMessage(r.error, tried)); return }
    onDone(r.data ?? tried)
  }
  const describedBy = `${id}-help${error ? ` ${id}-err` : ''}${offline ? ` ${id}-off` : ''}`
  return (
    <form className="col g8 pseudo-form" onSubmit={submit} noValidate>
      <label htmlFor={`${id}-in`} className="lbl">Votre pseudo</label>
      <input id={`${id}-in`} className="pseudo-input" value={value} maxLength={40} autoComplete="off" autoCapitalize="off" spellCheck={false}
        onChange={e => { setValue(e.target.value); setError(null) }} onBlur={check}
        aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      <span id={`${id}-help`} className="muted" style={{ fontSize: 13 }}>Visible des autres scouts. Pas votre vrai nom ni votre prénom.</span>
      {error && <span id={`${id}-err`} className="field-err" role="alert">{error}</span>}
      {offline && <span id={`${id}-off`} className="muted" role="status" style={{ fontSize: 13 }}>Le choix du pseudo demande du réseau.</span>}
      <div className="row">
        <button type="button" className="btn-mono" onClick={() => { setValue(randomPseudo()); setError(null) }}>UN PSEUDO AU HASARD</button>
        <button type="submit" className="btn acc" disabled={busy || offline}>{busy ? 'VÉRIFICATION…' : 'REJOINDRE LES LIGUES'}</button>
      </div>
    </form>
  )
}
