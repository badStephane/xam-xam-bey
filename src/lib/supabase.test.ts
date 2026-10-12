import { describe, expect, test } from 'vitest'
import { isValidEmail } from './supabase'

describe('isValidEmail', () => {
  test('accepte une adresse ordinaire, espaces autour compris', () => {
    expect(isValidEmail('awa.diop@exemple.sn')).toBe(true)
    expect(isValidEmail('  awa@exemple.sn ')).toBe(true)
  })
  test('refuse les saisies incomplètes', () => {
    for (const bad of ['', 'awa', 'awa@', 'awa@exemple', 'awa @exemple.sn', '@exemple.sn']) expect(isValidEmail(bad)).toBe(false)
  })
})
