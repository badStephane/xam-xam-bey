import { useMemo } from 'react'
import { gradeInfo, initialGradeFloor, readGradeFloor, writeGradeFloor, type GradeInfo } from '../lib/grades'
import { PARAMS } from '../lib/params'
import type { Progress } from '../lib/types'

function localStore(): Storage | null {
  try { return window.localStorage } catch { return null }
}

/**
 * Grade affiché (A1) : nouveau barème, jamais sous le plancher retenu pour ce compte. Le plancher est posé à la première
 * lecture d'une progression chargée (ancien grade si le compte a révisé avant le lot 5), puis relu.
 */
export function useGrade(userId: string | null, prog: Progress, ready: boolean): GradeInfo {
  const known = ready && !!userId
  const floor = useMemo(() => {
    if (!known || !userId) return 0
    if (PARAMS.frame || PARAMS.demo) return initialGradeFloor(prog)
    const store = localStore()
    const kept = readGradeFloor(store, userId)
    if (kept !== null) return kept
    const first = initialGradeFloor(prog)
    writeGradeFloor(store, userId, first)
    return first
    // Le plancher ne dépend que du compte : une fois posé, il ne suit plus la progression.
  }, [known, userId]) // eslint-disable-line react-hooks/exhaustive-deps
  return gradeInfo(prog.xp, floor)
}
