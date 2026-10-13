/** Préférences et caches par appareil. Le stockage peut être indisponible ou corrompu : on retombe sur la valeur par défaut. */
const PREFIX = 'xxb.'

function store(): Storage | null {
  try { return window.localStorage } catch { return null }
}

function readJson(key: string): unknown {
  const v = store()?.getItem(PREFIX + key)
  return v == null ? undefined : JSON.parse(v)
}

/**
 * Lit une valeur et la valide (`parse` renvoie null si la forme est mauvaise).
 * Si la clé versionnée est absente, l'ancienne clé est relue une fois, validée, recopiée, puis effacée.
 */
export function loadPref<T>(key: string, parse: (v: unknown) => T | null, fallback: T, legacyKey?: string): T {
  try {
    const current = readJson(key)
    if (current !== undefined) return parse(current) ?? fallback
    if (!legacyKey) return fallback
    const old = readJson(legacyKey)
    removePref(legacyKey)
    const parsed = old === undefined ? null : parse(old)
    if (parsed !== null) savePref(key, parsed)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    store()?.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Stockage bloqué ou plein (navigation privée, aperçu) : la préférence n'est simplement pas retenue.
  }
}

export function removePref(key: string): void {
  try { store()?.removeItem(PREFIX + key) } catch { /* stockage indisponible : rien à effacer */ }
}

/** Toutes les clés présentes (pour la purge de l'écran de secours). */
export function allKeys(): string[] {
  const s = store()
  if (!s) return []
  try { return Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k): k is string => k !== null) } catch { return [] }
}

export function removeKeys(keys: readonly string[]): void {
  const s = store()
  keys.forEach(k => { try { s?.removeItem(k) } catch { /* ignoré */ } })
}
