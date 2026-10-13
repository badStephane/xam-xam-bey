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

/** Jeton de requête : seule la dernière requête émise a le droit d'afficher sa réponse (FE-4). */
export interface RequestCounter {
  issue(): () => boolean
  /** Rend périmée toute requête en vol (démontage, changement de contexte). */
  invalidate(): void
}

export function createRequestCounter(): RequestCounter {
  let last = 0
  return {
    issue() {
      last += 1
      const id = last
      return () => id === last
    },
    invalidate() { last += 1 },
  }
}

/**
 * Lance une requête et n'applique sa réponse (ou son erreur) que si aucune requête plus récente n'a été émise.
 * Renvoie true si la réponse a été appliquée, false si elle était dépassée.
 */
export async function runLatest<T>(
  counter: RequestCounter,
  task: () => Promise<T>,
  onValue: (value: T) => void,
  onError: (err: unknown) => void,
): Promise<boolean> {
  const isCurrent = counter.issue()
  const outcome = await task().then((value): { ok: true; value: T } => ({ ok: true, value }), (err: unknown): { ok: false; err: unknown } => ({ ok: false, err }))
  if (!isCurrent()) return false
  if (outcome.ok) onValue(outcome.value)
  else onError(outcome.err)
  return true
}
