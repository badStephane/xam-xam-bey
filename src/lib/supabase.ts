import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { withTimeout } from './fetchTimeout'
import { withKeepalive } from './keepalive'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function makeClient(): SupabaseClient | null {
  if (!url || !key) {
    console.error('[xxb] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant : la révision est désactivée (voir .env.example).')
    return null
  }
  if (!/^https:\/\/[\w-]+\.supabase\.co\/?$/.test(url)) console.warn('[xxb] VITE_SUPABASE_URL ne ressemble pas à une URL de projet Supabase :', url)
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    // fetch résolu à l'appel ; keepalive sur save_progress (fermeture de l'onglet) ; délai de 15 s hors stockage (FE-5).
    global: { fetch: withKeepalive(withTimeout((input, init) => fetch(input, init))) },
  })
}

/** Client Supabase (null si la configuration est absente : la bibliothèque fonctionne sans). */
export const supabase = makeClient()

/** Adresse de retour du lien magique : la page courante, ouverte sur la révision. */
export const magicLinkRedirect = (): string => `${location.origin}${location.pathname}?screen=revision`

const BUCKET = 'documents'

/** Adresses des fichiers du bucket public « documents » ; repli sur site/f en l'absence de configuration. */
export const storageUrls = {
  file: (path: string): string => (url ? `${url.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}` : `f/${path}`),
  download: (path: string, name: string): string =>
    (url ? `${url.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}?download=${encodeURIComponent(name)}` : `f/${path}`),
}

export const isValidEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())
