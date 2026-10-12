import { useEffect, useState } from 'react'
import { MOBILE_MAX } from '../lib/constants'
import { PARAMS } from '../lib/params'

/** Mise en page mobile : forcée par les planches, sinon selon la largeur de la fenêtre. */
export function useIsMobile(): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth < MOBILE_MAX)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX - 1}px)`)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return PARAMS.layout === 'mobile' || (PARAMS.layout !== 'desktop' && narrow)
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}
