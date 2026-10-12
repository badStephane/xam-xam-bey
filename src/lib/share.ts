/** Partage natif si disponible, sinon copie dans le presse-papiers (onCopied appelé seulement en cas de copie réussie). */
export function share(data: ShareData, copyText: string, onCopied: () => void): void {
  if (navigator.share) {
    navigator.share(data).catch(() => { /* partage annulé par la personne */ })
    return
  }
  if (!navigator.clipboard) {
    console.error('[xxb] Ni partage ni presse-papiers disponibles')
    return
  }
  navigator.clipboard.writeText(copyText).then(onCopied).catch(err => console.error('[xxb] Copie impossible', err))
}
