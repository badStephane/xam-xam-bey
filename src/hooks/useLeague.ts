import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../AppContext'
import { useRevisionOffline } from '../components/revision/OfflineNotice'
import { readLeagueCache, writeLeagueCache, type CachedLeague, type LeagueState } from '../lib/league'
import { getLeagueState } from '../lib/leagueApi'
import { PARAMS } from '../lib/params'

export type LeagueLoad = 'loading' | 'ready' | 'error' | 'offline'

export interface League {
  /** Dernière réponse connue (serveur ou copie gardée), validée. */
  data: LeagueState | null
  /** Date de cette réponse (ms). */
  at: number | null
  /** Réponse précédente, avant le dernier rechargement (rang gagné, badges et défi nouveaux). */
  previous: LeagueState | null
  load: LeagueLoad
  reload(): Promise<void>
}

function localStore(): Storage | null {
  try { return window.localStorage } catch { return null }
}

/**
 * État de ligue (get_league_state, L5-3). La copie gardée s'affiche tout de suite ; en ligne, la réponse est rechargée
 * si elle a plus de `maxAgeMs` (0 : toujours). Hors réseau, la copie seule (P4). Planches et démo : aucun appel.
 */
export function useLeague(maxAgeMs: number, enabled = true): League {
  const { rev } = useApp()
  const offline = useRevisionOffline() || PARAMS.frame || PARAMS.demo
  const uid = rev.userId
  const [cache, setCache] = useState<CachedLeague | null>(() => (uid ? readLeagueCache(localStore(), uid) : null))
  const [previous, setPrevious] = useState<LeagueState | null>(null)
  const [load, setLoad] = useState<LeagueLoad>(offline ? 'offline' : 'loading')
  const seq = useRef(0)
  const cacheRef = useRef(cache)
  cacheRef.current = cache

  const reload = useCallback(async () => {
    if (!uid) return
    const mine = ++seq.current
    setLoad('loading')
    const r = await getLeagueState()
    if (mine !== seq.current) return
    if (!r.ok) {
      console.error('[xxb] Classement indisponible', r.error)
      setLoad(navigator.onLine === false ? 'offline' : 'error')
      return
    }
    const at = Date.now()
    writeLeagueCache(localStore(), uid, r.data, at)
    setPrevious(cacheRef.current?.state ?? null)
    setCache({ state: r.data, at })
    setLoad('ready')
  }, [uid])

  useEffect(() => {
    if (!uid) return
    const kept = readLeagueCache(localStore(), uid)
    setCache(kept)
    if (!enabled) return
    if (offline) { setLoad('offline'); return }
    if (kept && Date.now() - kept.at < maxAgeMs) { setLoad('ready'); return }
    void reload()
    return () => { seq.current++ }
  }, [uid, offline, enabled, maxAgeMs, reload])

  return { data: cache?.state ?? null, at: cache?.at ?? null, previous, load, reload }
}
