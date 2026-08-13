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
import supabase from '../services/supabaseClient'

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
      const [convoyQuery, membersQuery, positionsQuery] = await Promise.all([
        supabase.from('convoys').select('*').eq('id', convoyId).maybeSingle(),
        supabase
          .from('convoy_members')
          .select('id, convoy, user, vehicle, role, status, joined_at')
          .eq('convoy', convoyId),
        supabase
          .from('positions')
          .select('id, vehicle, convoy, lat, lng, speed, heading, accuracy, updated_at')
          .eq('convoy', convoyId),
      ])
      if (convoyQuery.error) throw convoyQuery.error
      if (membersQuery.error) throw membersQuery.error
      if (positionsQuery.error) throw positionsQuery.error
      const convoy = convoyQuery.data
      const members = membersQuery.data || []
      const positions = positionsQuery.data || []

      if (!convoy) return

      const memberRows = members as {
        id: string
        convoy: string
        user: string
        vehicle: string | null
        role: string
        status: string
        joined_at: string | null
      }[]

      const [profiles, vehicles] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name')
          .in(
            'id',
            memberRows.map((m) => m.user),
          ),
        memberRows.some((m) => m.vehicle)
          ? supabase
              .from('vehicles')
              .select('id, type')
              .in(
                'id',
                memberRows.map((m) => m.vehicle).filter((v): v is string => v !== null),
              )
          : Promise.resolve({ data: [] }),
      ])

      const nameMap = new Map((profiles.data || []).map((p) => [p.id, p.name]))
      const typeMap = new Map(
        ((vehicles as { data: { id: string; type: string }[] }).data || []).map((v) => [
          v.id,
          v.type,
        ]),
      )

      await saveConvoy(convoy as unknown as OfflineConvoy)

      const membersData: OfflineMember[] = memberRows.map((m) => ({
        id: m.id,
        convoy: m.convoy,
        user: m.user,
        vehicle: m.vehicle ?? undefined,
        role: m.role,
        status: m.status,
        joined_at: m.joined_at ?? undefined,
        userName: nameMap.get(m.user) ?? undefined,
        vehicleType: m.vehicle ? typeMap.get(m.vehicle) : undefined,
      }))
      await saveMembers(membersData)

      const positionsData: OfflinePosition[] = positions.map((p) => ({
        id: p.id,
        vehicle: p.vehicle,
        convoy: p.convoy,
        lat: p.lat,
        lng: p.lng,
        speed: p.speed ?? undefined,
        heading: p.heading ?? undefined,
        accuracy: p.accuracy ?? undefined,
        updated: p.updated_at,
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
          const payload = {
            vehicle: pos.vehicleId,
            convoy: pos.convoyId,
            lat: pos.lat,
            lng: pos.lng,
            speed: pos.speed ?? null,
            heading: pos.heading ?? null,
            accuracy: pos.accuracy ?? null,
          }
          const { data: existing } = await supabase
            .from('positions')
            .select('id')
            .eq('vehicle', pos.vehicleId)
            .eq('convoy', pos.convoyId)
            .maybeSingle()
          if (existing) {
            await supabase.from('positions').update(payload).eq('id', existing.id)
          } else {
            await supabase.from('positions').upsert(payload, { onConflict: 'vehicle,convoy' })
          }
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
