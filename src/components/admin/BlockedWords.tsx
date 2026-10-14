import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { adminListBlockedWords, adminRemoveBlockedWord, adminSetBlockedWord, type BlockedWord } from '../../lib/leagueApi'

/** Mots refusés dans les pseudos (A10), gestion simple. Jamais affichés aux scouts. */
export function BlockedWords() {
  const [words, setWords] = useState<BlockedWord[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [word, setWord] = useState('')
  const [exact, setExact] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    const r = await adminListBlockedWords()
    if (r.ok) setWords(r.data)
    else setFailed(true)
  }, [])
  useEffect(() => { void load() }, [load])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!word.trim()) return
    const r = await adminSetBlockedWord(word.trim(), exact)
    if (!r.ok) { setMsg(r.error.message === 'WORD_INVALID' ? 'Mot refusé : 2 à 30 caractères.' : 'Le mot n’a pas pu être ajouté.'); return }
    setMsg(`Ajouté : ${r.data}. Les pseudos existants ne changent pas : cherchez-les et réinitialisez-les.`)
    setWord('')
    void load()
  }
  const remove = async (w: string) => {
    const r = await adminRemoveBlockedWord(w)
    if (!r.ok) { setMsg('Le mot n’a pas pu être retiré.'); return }
    setWords(ws => (ws ?? []).filter(x => x.word !== w))
  }

  return (
    <details className="box">
      <summary className="h-sec" style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>MOTS REFUSÉS{words ? ` (${words.length})` : ''}</summary>
      <form className="row" onSubmit={add}>
        <label className="sr" htmlFor="adm-bw">Mot à refuser</label>
        <input id="adm-bw" className="pseudo-input" value={word} onChange={e => setWord(e.target.value)} placeholder="Mot à refuser" maxLength={40} />
        <label className="row" style={{ gap: 6, minHeight: 44 }}><input type="checkbox" checked={exact} onChange={e => setExact(e.target.checked)} />Pseudo identique seulement</label>
        <button className="btn-mono" type="submit">AJOUTER</button>
      </form>
      {msg && <p role="status" className="muted" style={{ margin: 0 }}>{msg}</p>}
      {failed && <div className="warn-inline" role="alert"><span>La liste n’a pas pu être chargée.</span><button className="btn-mono" onClick={() => void load()}>RÉESSAYER</button></div>}
      {words && !words.length && <p className="muted" style={{ margin: 0 }}>Aucun mot refusé.</p>}
      {words && words.length > 0 && (
        <ul className="row" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 6 }}>
          {words.map(w => (
            <li key={w.word}><button className="chip" onClick={() => void remove(w.word)} aria-label={`Retirer ${w.word}`}>{w.word}{w.exact ? ' (=)' : ''} ✕</button></li>
          ))}
        </ul>
      )}
    </details>
  )
}
