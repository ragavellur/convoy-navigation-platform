import { useEffect, useCallback } from 'react'
import {
  saveConvoy,
  saveMembers,
  savePositions,
  getConvoy,
  getMembersByConvoy,
  getPositionsByConvoy,
  getPendingPositions,
  removePendingPosition,
  type OfflineConvoy,
  type OfflineMember,
  type OfflinePosition,
} from '../lib/db'
import { pb } from '../services/pocketbase'

export function useOfflineConvoy() {
  const cacheConvoy = useCallback(async (convoyId: string) => {
    if (navigator.onLine) return
    try {
      const existing = await getConvoy(convoyId)
      if (!existing) return

      const members = await getMembersByConvoy(convoyId)
      const positions = await getPositionsByConvoy(convoyId)

      return { convoy: existing, members, positions }
    } catch {
      return null
    }
  }, [])

  const syncConvoyToCache = useCallback(async (convoyId: string) => {
    if (!navigator.onLine) return
    try {
      const [convoy, members, positions] = await Promise.all([
        pb.collection('convoys').getOne(convoyId),
        pb.collection('convoy_members').getFullList({
          filter: `convoy = "${convoyId}"`,
          expand: 'user,vehicle',
        }),
        pb.collection('positions').getFullList({
          filter: `convoy = "${convoyId}"`,
        }),
      ])

      await saveConvoy(convoy as unknown as OfflineConvoy)

      const membersData: OfflineMember[] = members.map((m) => ({
        id: m.id,
        convoy: m.convoy,
        user: m.user,
        vehicle: m.vehicle,
        role: m.role,
        status: m.status,
        joined_at: m.joined_at,
        userName: (m.expand?.user as Record<string, string>)?.name,
        vehicleType: (m.expand?.vehicle as Record<string, string>)?.type,
      }))
      await saveMembers(membersData)

      const positionsData: OfflinePosition[] = positions.map((p) => ({
        id: p.id,
        vehicle: p.vehicle,
        convoy: p.convoy,
        lat: p.lat,
        lng: p.lng,
        speed: p.speed,
        heading: p.heading,
        accuracy: p.accuracy,
        updated: p.updated,
      }))
      await savePositions(positionsData)
    } catch {
      // silent fail - caching is non-critical
    }
  }, [])

  const flushPendingPositions = useCallback(async () => {
    if (!navigator.onLine) return
    try {
      const pending = await getPendingPositions()
      for (const pos of pending) {
        try {
          await pb.collection('positions').update(pos.id, {
            lat: pos.lat,
            lng: pos.lng,
            speed: pos.speed ?? undefined,
            heading: pos.heading ?? undefined,
            accuracy: pos.accuracy ?? undefined,
          })
          await removePendingPosition(pos.id)
        } catch {
          // keep in queue for next attempt
        }
      }
    } catch {
      // silent fail
    }
  }, [])

  useEffect(() => {
    if (!navigator.onLine) return

    const handleOnline = () => {
      flushPendingPositions()
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [flushPendingPositions])

  return { cacheConvoy, syncConvoyToCache, flushPendingPositions }
}
