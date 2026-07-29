import { useState, useEffect, useCallback, useRef } from 'react'
import { computeAssemblyRoutes, type AssemblyRoute } from '../services/assemblyRoutes'
import type { RosterMember } from '../stores/ConvoyRosterContext'
import pb from '../services/pocketbase'
import type { RouteGeometry } from '../types'

interface UseAssemblyRoutesOptions {
  members: RosterMember[]
  ownerUserId: string | null
  assemblyPoint: { lat: number; lng: number } | null
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
  const prevKeyRef = useRef<string>('')

  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const compute = useCallback(async () => {
    const { members, ownerUserId, assemblyPoint } = optionsRef.current

    if (!ownerUserId || !assemblyPoint) {
      setRoutes([])
      return
    }

    const withSource = members.filter((m) => sourcePoint(m))
    if (withSource.length === 0) {
      setRoutes([])
      return
    }

    const key = withSource
      .map(
        (m) =>
          `${m.userId}:${m.joinLat?.toFixed(4) || m.position?.lat.toFixed(4) || '?'},${m.joinLng?.toFixed(4) || m.position?.lng.toFixed(4) || '?'}`,
      )
      .join('|')
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    setIsComputing(true)
    try {
      const persisted: AssemblyRoute[] = []
      const needCompute: RosterMember[] = []

      for (const m of withSource) {
        if (m.assemblyRouteGeometry && m.assemblyRouteGeometry.length > 1) {
          persisted.push({
            memberId: m.id,
            userId: m.userId,
            userName: m.userName,
            vehicleColor: m.vehicleColor,
            route: {
              distance: 0,
              duration: 0,
              geometry: {
                type: 'LineString' as const,
                coordinates: m.assemblyRouteGeometry as [number, number][],
              },
              legs: [],
              weight: 0,
            },
            distance: 0,
            duration: 0,
          })
        } else {
          needCompute.push(m)
        }
      }

      if (needCompute.length > 0) {
        const computed = await computeAssemblyRoutes(needCompute, assemblyPoint)
        for (const cr of computed) {
          const coords = (cr.route.geometry as unknown as RouteGeometry)?.coordinates
          if (coords && coords.length > 1) {
            const member = members.find((m) => m.id === cr.memberId)
            if (member) {
              pb.collection('convoy_members')
                .update(cr.memberId, { assembly_route_geometry: coords } as any)
                .catch(() => {})
            }
          }
        }
        setRoutes([...persisted, ...computed])
      } else {
        setRoutes(persisted)
      }
    } catch (err) {
      console.error('[useAssemblyRoutes] compute failed:', err)
    } finally {
      setIsComputing(false)
    }
  }, [])

  const { ownerUserId, assemblyPoint, members } = options
  const stableKey = `${ownerUserId}|${assemblyPoint?.lat},${assemblyPoint?.lng}|${members.length}`

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(compute, REROUTE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
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
