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

const REROUTE_DEBOUNCE_MS = 500

function sourcePoint(m: RosterMember): { lat: number; lng: number } | null {
  if (m.joinLat != null && m.joinLng != null) return { lat: m.joinLat, lng: m.joinLng }
  if (m.position) return m.position
  return null
}

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
    const { members, ownerUserId, assemblyPoint, assembledMembers } = optionsRef.current

    if (!ownerUserId || !assemblyPoint) {
      setRoutes([])
      return
    }

    const targetMembers = members.filter(
      (m) => sourcePoint(m) && !assembledMembers?.includes(m.userId),
    )

    if (targetMembers.length === 0) {
      setRoutes([])
      return
    }

    const posKey = targetMembers
      .map((m) => {
        const sp = sourcePoint(m)!
        return `${m.userId}:${sp.lat.toFixed(4)},${sp.lng.toFixed(4)}`
      })
      .join('|')
    if (posKey === prevPositionsRef.current) return
    prevPositionsRef.current = posKey

    setIsComputing(true)
    try {
      const computed = await computeAssemblyRoutes(targetMembers, assemblyPoint)
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
