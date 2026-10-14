import { useApp } from '../../AppContext'
import { absoluteUrl, askWorkerToKeep, connectionHint, useOfflineDocs } from '../../hooks/useOfflineDocs'
import { citedDocs } from '../../lib/citedDocs'
import { shouldKeepOnOpen } from '../../lib/openMode'
import type { Doc } from '../../lib/types'
import { DocCard } from '../library/DocCard'

/**
 * Documents cités par les questions de la zone (lot 4, F2), présentés comme dans la bibliothèque (DocCard). Chaque document
 * s'ouvre selon la règle du lot 3 (`openMode`) : lecteur du téléphone en ligne, aperçu du site (lu depuis le cache hors
 * ligne ; RETOUR ramène aux fiches), ou mention s'il n'a jamais été ouvert ici. Rien si aucune carte n'en cite.
 */
export function CitedDocs({ zone }: { zone: number }) {
  const { rev, ui, docById, mobile, offline, catalogStatus, openCardDoc, markSeen } = useApp()
  const kept = useOfflineDocs()
  const docs = citedDocs(rev.content.cards[zone] || [], docById)
  if (!docs.length) return null
  const onNative = (d: Doc) => {
    markSeen(d.id)
    // Comme dans la bibliothèque : le worker garde le PDF ouvert dans le lecteur du téléphone (E3, L3-6).
    if (shouldKeepOnOpen({ workerActive: kept.active, connection: connectionHint() })) askWorkerToKeep(d.file)
  }
  return (
    <section className="col g10" aria-labelledby="cited-h">
      <h2 id="cited-h" className="h-screen" style={{ fontSize: '1.25rem' }}>Documents cités par les questions de la zone</h2>
      <div className="grid-docs">{docs.map(d => (
        // Réseau coupé : navigateur hors ligne, ou base injoignable constatée (même règle que la bibliothèque).
        <DocCard key={d.id} d={d} seen={ui.seen.includes(d.id)} selected={false} mobile={mobile} offline={offline || catalogStatus === 'cached'}
          kept={kept.urls.has(absoluteUrl(d.file))} onOpen={openCardDoc} onNative={onNative} />
      ))}</div>
    </section>
  )
}
