import { XP_BAR_SEGMENTS, XP_PER_LEVEL } from './constants'
import { dayNum } from './format'
import type { Progress } from './types'

/**
 * Grades du lot 5 (16-design, C2) : noms et seuils d'XP personnelle. Le numéro de niveau reste 200 XP par niveau.
 * A1 : aucun grade ne baisse au déploiement. Le grade affiché est le plus haut entre le nouveau barème et un plancher,
 * l'équivalent de l'ancien niveau (ancien barème : un grade par niveau), retenu sur l'appareil à la première lecture.
 */
export interface GradeStep { name: string; from: number }

export const GRADES: readonly GradeStep[] = [
  { name: 'Novice', from: 0 }, { name: 'Pisteur', from: 200 }, { name: 'Campeur', from: 500 }, { name: 'Éclaireur', from: 1000 },
  { name: 'Guide', from: 2000 }, { name: 'Pionnier', from: 3500 }, { name: 'Routier', from: 6000 }, { name: 'Ancien', from: 10000 },
]

/**
 * Le plancher de l'ancien barème ne vaut que pour les comptes qui ont révisé avant cette date (séance antérieure) :
 * un compte créé après le déploiement n'a jamais connu l'ancien barème. Date volontairement tardive (voir 05-build).
 */
export const LEGACY_GRADE_UNTIL_DAY = dayNum(new Date(2026, 10, 30))

const LAST = GRADES.length - 1

/** Indice du grade du nouveau barème pour une XP donnée. */
export function gradeIndex(xp: number): number {
  const i = GRADES.findIndex(g => g.from > Math.max(0, xp))
  return i === -1 ? LAST : i - 1
}

/** Indice du grade de l'ancien barème (un grade par niveau de 200 XP, plafonné au dernier). */
export const legacyGradeIndex = (xp: number): number => Math.min(LAST, Math.floor(Math.max(0, xp) / XP_PER_LEVEL))

/** Plancher à retenir à la première lecture : ancien grade si le compte a révisé avant LEGACY_GRADE_UNTIL_DAY, sinon 0. */
export function initialGradeFloor(prog: Progress, untilDay: number = LEGACY_GRADE_UNTIL_DAY): number {
  return prog.sessions.some(s => s.d < untilDay) ? legacyGradeIndex(prog.xp) : 0
}

export interface GradeInfo {
  index: number
  name: string
  /** Grade suivant (nouveau barème), ou null au dernier grade. */
  next: GradeStep | null
}

export function gradeInfo(xp: number, floor: number): GradeInfo {
  const index = Math.min(LAST, Math.max(gradeIndex(xp), Math.max(0, Math.floor(floor))))
  return { index, name: GRADES[index].name, next: index < LAST ? GRADES[index + 1] : null }
}

/** Barre de l'en-tête (annexe A1 de 16-design) : remplissage dans le niveau en cours, pas sur le cumul. */
export const levelFill = (xp: number, segments: number = XP_BAR_SEGMENTS): number =>
  Math.round(segments * (Math.max(0, xp) % XP_PER_LEVEL) / XP_PER_LEVEL)

export const gradeFloorKey = (userId: string): string => `xxb.gradeFloor.v1.${userId}`

/** Plancher retenu pour ce compte, ou null s'il n'a jamais été posé (stockage absent ou valeur invalide : null). */
export function readGradeFloor(store: Pick<Storage, 'getItem'> | null, userId: string): number | null {
  try {
    const raw = store?.getItem(gradeFloorKey(userId))
    if (raw == null) return null
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 && n <= LAST ? n : null
  } catch {
    return null
  }
}

export function writeGradeFloor(store: Pick<Storage, 'setItem'> | null, userId: string, floor: number): void {
  try { store?.setItem(gradeFloorKey(userId), String(floor)) } catch { /* stockage plein ou bloqué : plancher recalculé */ }
}
