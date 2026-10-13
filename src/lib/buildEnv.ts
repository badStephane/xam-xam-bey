/** Variables sans lesquelles un build de production livre un site cassé (PDF en 404, révision coupée). */
export const REQUIRED_BUILD_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const

export const missingBuildEnv = (env: Readonly<Record<string, string | undefined>>): string[] =>
  REQUIRED_BUILD_ENV.filter(name => !env[name]?.trim())

/** Fait échouer un build de production si une variable requise manque ; sans effet en développement et en test. */
export function assertBuildEnv(mode: string, env: Readonly<Record<string, string | undefined>>): void {
  if (mode !== 'production') return
  const missing = missingBuildEnv(env)
  if (missing.length) {
    throw new Error(`[xxb] Build de production impossible : ${missing.join(', ')} manquant(s). `
      + 'Renseignez-les (voir .env.example) ; la CI utilise des valeurs factices.')
  }
}
