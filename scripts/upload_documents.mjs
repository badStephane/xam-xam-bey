/**
 * Envoie les PDF dans le bucket Supabase « documents » (une seule fois, après la migration library).
 * Prend la version compressée de site/f-min/ si elle existe (scripts/compress_pdfs.py), sinon l'original de site/f/,
 * puis met à jour la taille enregistrée dans la table documents.
 *
 * Usage (zsh ou bash), la clé n'apparaît ni à l'écran ni dans l'historique :
 *   read -rs SUPABASE_SECRET_KEY; export SUPABASE_SECRET_KEY   # coller la clé sb_secret_…, Entrée
 *   node scripts/upload_documents.mjs
 *   unset SUPABASE_SECRET_KEY                                  # puis révoquer la clé (docs/squad/06-ops.md, section J)
 * Ne jamais écrire la clé dans la commande, dans un fichier ni dans un message.
 * L'URL du projet est lue dans .env.local (VITE_SUPABASE_URL). Relançable sans risque : les fichiers déjà présents sont remplacés.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUCKET = 'documents'
const CONCURRENCY = 4
const CACHE_SECONDS = '604800' // 7 jours : les relectures passent par le cache CDN de Supabase (egress « cached »)
const KEY_VAR = 'SUPABASE_SECRET_KEY'
const HOW_TO = `  read -rs ${KEY_VAR}; export ${KEY_VAR}   (coller la clé sb_secret_…, Entrée : rien ne s'affiche)\n  node scripts/upload_documents.mjs`

function stop(message) {
  console.error(`upload_documents refusé : ${message}`)
  process.exit(1)
}

/** Lit la clé dans l'environnement et refuse les clés publiques ou absentes. Ne l'affiche jamais. */
function readSecretKey() {
  const key = (process.env[KEY_VAR] ?? '').trim()
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && !key) {
    stop(`SUPABASE_SERVICE_ROLE_KEY n'est plus lue. Préparer ${KEY_VAR} sans historique :\n${HOW_TO}`)
  }
  if (!key) stop(`variable ${KEY_VAR} absente. La préparer sans historique :\n${HOW_TO}`)
  if (key.startsWith('sb_publishable_')) stop('clé publishable (publique) : il faut une clé secrète sb_secret_… (Supabase > Project Settings > API Keys).')
  if (key.startsWith('eyJ')) {
    console.warn('Attention : clé JWT historique (service_role). Elle ne se révoque qu\'en changeant le JWT secret du projet. Préférer une clé sb_secret_… dédiée (06-ops, section J).')
  } else if (!key.startsWith('sb_secret_')) {
    stop('format de clé inconnu : attendu sb_secret_… (Supabase > Project Settings > API Keys > Secret keys).')
  }
  return key
}

function readProjectUrl() {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL.trim()
  const file = resolve(ROOT, '.env.local')
  if (!existsSync(file)) return ''
  const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith('VITE_SUPABASE_URL='))
  return line ? line.slice('VITE_SUPABASE_URL='.length).trim() : ''
}

const key = readSecretKey()
const url = readProjectUrl()
if (!url) stop('VITE_SUPABASE_URL introuvable (ni dans l\'environnement ni dans .env.local).')

const catalog = JSON.parse(readFileSync(resolve(ROOT, 'data/catalog.site.json'), 'utf8'))
const files = [...new Set(catalog.filter(it => !it.d).map(it => it.f))]
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

let done = 0
const failures = []

async function upload(name) {
  const compressed = resolve(ROOT, 'site/f-min', name)
  const path = existsSync(compressed) ? compressed : resolve(ROOT, 'site/f', name)
  if (!existsSync(path)) return [`${name} : fichier absent de site/f`]
  const body = readFileSync(path)
  const { error } = await supabase.storage.from(BUCKET).upload(name, body, { contentType: 'application/pdf', upsert: true, cacheControl: CACHE_SECONDS })
  if (error) return [`${name} : ${error.message}`]
  const sized = await supabase.from('documents').update({ size: body.length }).eq('storage_path', name)
  return sized.error ? [`${name} : envoyé, mais taille non mise à jour (${sized.error.message})`] : []
}

async function worker(queue) {
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    let errors
    try {
      errors = await upload(name)
    } catch (err) {
      errors = [`${name} : ${err instanceof Error ? err.message : String(err)}`]
    }
    failures.push(...errors)
    done++
    process.stdout.write(`\r${done}/${files.length} fichiers traités`)
  }
}

const queue = [...files]
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)))
console.log(`\n${files.length - failures.length} réussis, ${failures.length} échecs`)
failures.forEach(f => console.log(`  ✕ ${f}`))
console.log(`Ensuite : unset ${KEY_VAR}, puis révoquer la clé si elle était dédiée à cet envoi (06-ops, section J).`)
process.exit(failures.length ? 1 : 0)
