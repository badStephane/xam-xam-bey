import { useSwUpdate } from '../hooks/useSwUpdate'

/** Nouvelle version prête : RECHARGER, au-dessus de tous les écrans. Une séance en cours reprend après (sessionStore). */
export function UpdateBanner() {
  const { ready, reload } = useSwUpdate()
  if (!ready) return null
  return (
    <div className="update-wrap">
      <div className="banner update" role="status">
        <b>NOUVELLE VERSION</b>
        <span style={{ fontSize: '0.875rem' }}>Le site a été mis à jour. Une séance en cours reprendra où vous en êtes.</span>
        <button className="btn-mono" onClick={reload}>RECHARGER</button>
      </div>
    </div>
  )
}
