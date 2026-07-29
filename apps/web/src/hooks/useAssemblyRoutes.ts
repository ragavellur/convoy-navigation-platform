import { useState, useEffect, useCallback, useRef } from 'react'
import { computeAssemblyRoutes, type AssemblyRoute } from '../services/assemblyRoutes'
import type { RosterMember } from '../stores/ConvoyRosterContext'

interface UseAssemblyRoutesOptions {
  members: RosterMember[]
  ownerUserId: string | null
  assemblyPoint: { lat: number; lng: number } | null
  phase: string
  assembledMembers?: string[]
}

const REROUTE_DEBOUNCE_MS = 5000

export function useAssemblyRoutes(options: UseAssemblyRoutesOptions) {
  const [routes, setRoutes] = useState<AssemblyRoute[]>([])
  const [isComputing, setIsComputing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevPositionsRef = useRef<string>('')

  const optionsRef = useRef(options)

  useEffect(() => {
    optionsRef.current = options
  })

  const compute = useCallback(async () => {
    const { members, ownerUserId, assemblyPoint, phase, assembledMembers } = optionsRef.current

    if (!ownerUserId || !assemblyPoint || phase !== 'assembling') {
      setRoutes([])
      return
    }

    const targetMembers = members.filter(
      (m) => m.userId !== ownerUserId && m.position && !assembledMembers?.includes(m.userId),
    )

    if (targetMembers.length === 0) {
      setRoutes([])
      return
    }

    const posKey = targetMembers
      .map((m) => `${m.userId}:${m.position!.lat.toFixed(4)},${m.position!.lng.toFixed(4)}`)
      .join('|')
    if (posKey === prevPositionsRef.current) return
    prevPositionsRef.current = posKey

    setIsComputing(true)
    try {
      const computed = await computeAssemblyRoutes(targetMembers, ownerUserId, assemblyPoint)
      setRoutes(computed)
    } catch (err) {
      console.error('[useAssemblyRoutes] compute failed:', err)
    } finally {
      setIsComputing(false)
    }
  }, [])

  const { ownerUserId, assemblyPoint, phase, assembledMembers, members } = options
  const stableKey = `${ownerUserId}|${assemblyPoint?.lat},${assemblyPoint?.lng}|${phase}|${assembledMembers?.join(',')}`

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(compute, REROUTE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [stableKey, members.length, compute])

  useEffect(() => {
    return () => {
      setRoutes([])
      setIsComputing(false)
    }
  }, [])

  return { routes, isComputing, recompute: compute }
}
