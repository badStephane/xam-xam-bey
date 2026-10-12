/** Préférences par appareil (thème, pièces consultées). Le stockage peut être indisponible : on retombe sur la valeur par défaut. */
const PREFIX = 'xxb.'

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(PREFIX + key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Stockage bloqué (navigation privée, aperçu) : la préférence n'est simplement pas retenue.
  }
}
