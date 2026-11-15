import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Garde-fou contre les tests SQL à retardement (CI de la PR #34, 2026-11-15 ; déjà le 2026-10-26).
 * Un test qui lit l'horloge réelle (`now()`) ne doit jamais comparer avec un instant écrit en dur : il passe tant que la
 * date réelle le permet, puis casse un lundi sans aucun changement de code. Un instant passe par `tests.at()` (décalé avec
 * la semaine réelle) ou se calcule depuis `now()`. Les dates seules (inscription, rotation des défis) restent permises.
 */
const TESTS = resolve(__dirname, '../../supabase/tests')
const INSTANT = /'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}[^']*'/g
const SAFE_BEFORE = /tests\.at\(\s*$/

/** Instants écrits en dur hors de tests.at(), commentaires retirés : « fichier:ligne : instant ». */
function bareInstants(name: string, sql: string): string[] {
  const lines = sql.split('\n').map(l => l.replace(/--.*$/, ''))
  if (!lines.some(l => /\bnow\(\)/i.test(l))) return []
  return lines.flatMap((line, i) => [...line.matchAll(INSTANT)]
    .filter(m => !SAFE_BEFORE.test(line.slice(0, m.index)))
    .map(m => `${name}:${i + 1} : ${m[0]}`))
}

describe('tests SQL : pas d’instant en dur à côté de l’horloge réelle', () => {
  test('la règle repère l’instant nu et laisse passer tests.at(), les commentaires et les fichiers sans now()', () => {
    expect(bareInstants('a.sql', "select now();\nselect public.league_close_due('2026-11-09 06:30Z');")).toEqual(['a.sql:2 : \'2026-11-09 06:30Z\''])
    expect(bareInstants('b.sql', "select now();\nselect f(tests.at('2026-11-09 06:30Z')); -- '2026-11-09 06:30Z'")).toEqual([])
    expect(bareInstants('c.sql', "select public.league_ingest(u, j, '2026-11-04 10:00Z');")).toEqual([])
    expect(bareInstants('d.sql', "select now();\ninsert into t values ('2026-09-01');")).toEqual([])
  })

  test('aucun fichier de supabase/tests n’en contient', () => {
    const found = readdirSync(TESTS).filter(f => f.endsWith('.sql')).flatMap(f => bareInstants(f, readFileSync(resolve(TESTS, f), 'utf8')))
    expect(found, 'passer par tests.at() ou calculer l’instant depuis now()').toEqual([])
  })
})
