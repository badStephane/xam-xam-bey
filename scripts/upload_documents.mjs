/**
 * Envoie les PDF dans le bucket Supabase « documents » (une seule fois, après la migration library).
 * Prend la version compressée de site/f-min/ si elle existe (scripts/compress_pdfs.py), sinon l'original de site/f/,
 * puis met à jour la taille enregistrée dans la table documents.
 *
 * Usage (dans votre terminal, jamais dans un fichier versionné) :
 *   SUPABASE_SERVICE_ROLE_KEY=… node scripts/upload_documents.mjs
 * L'URL du projet est lue dans .env.local (VITE_SUPABASE_URL). Relançable sans risque : les fichiers déjà présents sont remplacés.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUCKET = 'documents'
const CONCURRENCY = 4

function envUrl() {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL
  const file = resolve(ROOT, '.env.local')
  if (!existsSync(file)) return ''
  const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith('VITE_SUPABASE_URL='))
  return line ? line.slice('VITE_SUPABASE_URL='.length).trim() : ''
}

const url = envUrl()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Il faut VITE_SUPABASE_URL (dans .env.local) et SUPABASE_SERVICE_ROLE_KEY (variable d’environnement).')
  process.exit(1)
}

const catalog = JSON.parse(readFileSync(resolve(ROOT, 'data/catalog.site.json'), 'utf8'))
const files = [...new Set(catalog.filter(it => !it.d).map(it => it.f))]
const supabase = createClient(url, key, { auth: { persistSession: false } })

let done = 0
const failures = []
async function upload(name) {
  const compressed = resolve(ROOT, 'site/f-min', name)
  const path = existsSync(compressed) ? compressed : resolve(ROOT, 'site/f', name)
  if (!existsSync(path)) { failures.push(`${name} : fichier absent de site/f`); return }
  const body = readFileSync(path)
  const { error } = await supabase.storage.from(BUCKET).upload(name, body, { contentType: 'application/pdf', upsert: true, cacheControl: '604800' })
  if (error) failures.push(`${name} : ${error.message}`)
  else {
    const sized = await supabase.from('documents').update({ size: body.length }).eq('storage_path', name)
    if (sized.error) failures.push(`${name} : envoyé, mais taille non mise à jour (${sized.error.message})`)
  }
  done++
  process.stdout.write(`\r${done}/${files.length} fichiers envoyés`)
}

const queue = [...files]
await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (queue.length) await upload(queue.shift()) }))
console.log(`\n${files.length - failures.length} réussis, ${failures.length} échecs`)
failures.forEach(f => console.log(`  ✕ ${f}`))
process.exit(failures.length ? 1 : 0)
