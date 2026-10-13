import { describe, expect, test } from 'vitest'
import { assertBuildEnv, missingBuildEnv } from './buildEnv'

const OK = { VITE_SUPABASE_URL: 'https://ci.invalid', VITE_SUPABASE_ANON_KEY: 'ci-anon-key' }

describe('missingBuildEnv', () => {
  test('rien ne manque', () => expect(missingBuildEnv(OK)).toEqual([]))
  test('absentes ou vides (espaces compris)', () => {
    expect(missingBuildEnv({})).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])
    expect(missingBuildEnv({ ...OK, VITE_SUPABASE_ANON_KEY: '  ' })).toEqual(['VITE_SUPABASE_ANON_KEY'])
  })
})

describe('assertBuildEnv', () => {
  test('production sans variables : erreur explicite', () => {
    expect(() => assertBuildEnv('production', { VITE_SUPABASE_URL: '' })).toThrow(/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/)
  })
  test('production complète, développement ou tests : aucune erreur', () => {
    expect(() => assertBuildEnv('production', OK)).not.toThrow()
    expect(() => assertBuildEnv('development', {})).not.toThrow()
    expect(() => assertBuildEnv('test', {})).not.toThrow()
  })
})
