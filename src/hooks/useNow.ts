import { useEffect, useState } from 'react'
import { msUntilNextDay, nextNow } from '../lib/clock'

const systemClock = (): Date => new Date()

/**
 * Date courante, renouvelée seulement quand le jour civil change : au passage de minuit,
 * et au retour au premier plan (les minuteurs sont suspendus quand Android met l'onglet en veille).
 */
export function useNow(clock: () => Date = systemClock): Date {
  const [now, setNow] = useState(clock)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = (): void => setNow(prev => nextNow(prev, clock()))
    const arm = (): void => {
      timer = setTimeout(() => { refresh(); arm() }, msUntilNextDay(clock()))
    }
    const onVisible = (): void => { if (document.visibilityState === 'visible') refresh() }
    arm()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [clock])

  return now
}
