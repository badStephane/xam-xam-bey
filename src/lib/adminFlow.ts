const GENERIC_ERROR = 'L’action n’a pas abouti. Réessayez.'

const defaultDescribe = (err: unknown): string => (err instanceof Error ? err.message : GENERIC_ERROR)

/**
 * Exécute une action admin puis recharge le catalogue, même si l'action échoue à mi-chemin
 * (ex. ligne supprimée mais fichier resté en ligne) : la liste reflète la base, l'erreur reste affichée.
 * Renvoie le message d'erreur à afficher, ou null si tout a réussi.
 */
export async function runThenReload(
  task: () => Promise<void>,
  reload: () => Promise<void>,
  describe: (err: unknown) => string = defaultDescribe,
): Promise<string | null> {
  const taskError = await task().then(() => null, (err: unknown) => describe(err))
  const reloadError = await reload().then(() => null, (err: unknown) => describe(err))
  return taskError ?? reloadError
}
