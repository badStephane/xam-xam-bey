import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function makeClient(): SupabaseClient | null {
  if (!url || !key) {
    console.error('[xxb] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant : la révision est désactivée (voir .env.example).')
    return null
  }
  if (!/^https:\/\/[\w-]+\.supabase\.co\/?$/.test(url)) console.warn('[xxb] VITE_SUPABASE_URL ne ressemble pas à une URL de projet Supabase :', url)
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
}

/** Client Supabase (null si la configuration est absente : la bibliothèque fonctionne sans). */
export const supabase = makeClient()

/** Adresse de retour du lien magique : la page courante, ouverte sur la révision. */
export const magicLinkRedirect = (): string => `${location.origin}${location.pathname}?screen=revision`

export const isValidEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())
