import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import supabase from '../services/supabaseClient'
import type { Position } from '../services/positionTracking'
import { getLatestPositions, subscribeToConvoyPositions } from '../services/positionTracking'
import { deriveMemberStatus, type MemberStatus, haversineDistance } from '../utils/memberStatus'

export interface RosterMember {
  id: string
  userId: string
  userName: string
  userAvatar?: string
  role: 'owner' | 'admin' | 'member'
  vehicleId?: string
  vehicleType?: 'car' | 'truck' | 'motorcycle' | 'other' | 'trekker'
  vehicleColor?: string
  vehicleName?: string
  position: Position | null
  status: MemberStatus
  joinLat?: number
  joinLng?: number
  joinName?: string
  assemblyRouteGeometry?: number[][]
  routeGeometry?: number[][]
}

export interface ConvoyRosterContextType {
  convoyId: string | null
  members: RosterMember[]
  isLoading: boolean
  focusMemberId: string | null
  setFocusMemberId: (id: string | null) => void
  joinConvoy: (id: string) => void
  leaveConvoy: () => void
  refreshMembers: () => Promise<void>
}

const ConvoyRosterContext = createContext<ConvoyRosterContextType | undefined>(undefined)

export function useConvoyRoster() {
  const ctx = useContext(ConvoyRosterContext)
  if (!ctx) throw new Error('useConvoyRoster must be used within ConvoyRosterProvider')
  return ctx
}

interface MemberRow {
  id: string
  user: string
  vehicle: string | null
  role: string
  join_lat: number | null
  join_lng: number | null
  join_name: string | null
  assembly_route_geometry: unknown
  route_geometry: unknown
}

export function ConvoyRosterProvider({ children }: { children: ReactNode }) {
  const [convoyId, setConvoyId] = useState<string | null>(null)
  const [members, setMembers] = useState<RosterMember[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [focusMemberId, setFocusMemberId] = useState<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchMembers = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      const [memberQuery, positions] = await Promise.all([
        supabase
          .from('convoy_members')
          .select(
            'id, user, vehicle, role, join_lat, join_lng, join_name, assembly_route_geometry, route_geometry',
          )
          .eq('convoy', id)
          .eq('status', 'active'),
        getLatestPositions(id),
      ])
      if (memberQuery.error) throw memberQuery.error
      const memberRows = (memberQuery.data || []) as MemberRow[]

      const [profiles, vehicles] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in(
            'id',
            memberRows.map((m) => m.user),
          ),
        memberRows.some((m) => m.vehicle)
          ? supabase
              .from('vehicles')
              .select('id, name, type, color')
              .in(
                'id',
                memberRows.map((m) => m.vehicle).filter((v): v is string => v !== null),
              )
          : Promise.resolve({ data: [] }),
      ])

      const posMap = new Map<string, Position>()
      for (const pos of positions) {
        posMap.set(pos.vehicle, pos)
      }
      const nameMap = new Map((profiles.data || []).map((p) => [p.id, p]))
      const vehicleMap = new Map(
        (
          (vehicles as { data: { id: string; name: string; type: string; color: string | null }[] })
            .data || []
        ).map((v) => [v.id, v]),
      )

      const roster: RosterMember[] = memberRows.map((m) => {
        const profile = nameMap.get(m.user)
        const vehicle = m.vehicle ? vehicleMap.get(m.vehicle) : undefined
        const position = vehicle ? (posMap.get(vehicle.id) ?? null) : null
        return {
          id: m.id,
          userId: m.user,
          userName: profile?.name || 'Unknown',
          userAvatar: profile?.avatar_url || undefined,
          role: m.role as RosterMember['role'],
          vehicleId: vehicle?.id,
          vehicleType: vehicle?.type as RosterMember['vehicleType'],
          vehicleColor: vehicle?.color || undefined,
          vehicleName: vehicle?.name,
          position,
          status: deriveMemberStatus(position),
          joinLat: m.join_lat ?? undefined,
          joinLng: m.join_lng ?? undefined,
          joinName: m.join_name ?? undefined,
          assemblyRouteGeometry: (m.assembly_route_geometry as number[][]) || undefined,
          routeGeometry: (m.route_geometry as number[][]) || undefined,
        }
      })

      setMembers(roster)
    } catch (err) {
      console.error('[ConvoyRoster] fetchMembers failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handlePositionUpdate = useCallback((position: Position) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.vehicleId !== position.vehicle) return m
        const newStatus = deriveMemberStatus(position)
        return { ...m, position, status: newStatus }
      }),
    )
  }, [])

  const joinConvoy = useCallback(
    async (id: string) => {
      setConvoyId(id)
      setIsLoading(true)
      try {
        unsubRef.current?.()
        unsubRef.current = await subscribeToConvoyPositions(id, handlePositionUpdate)
        const memberChannel = supabase
          .channel(`convoy-members-roster-${id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'convoy_members', filter: `convoy=eq.${id}` },
            () => fetchMembers(id),
          )
          .subscribe()
        const prev = unsubRef.current
        unsubRef.current = () => {
          prev?.()
          void supabase.removeChannel(memberChannel)
        }
        await fetchMembers(id)
        intervalRef.current = setInterval(() => fetchMembers(id), 60_000)
      } catch (err) {
        console.error('[ConvoyRoster] joinConvoy failed:', err)
        setIsLoading(false)
      }
    },
    [fetchMembers, handlePositionUpdate],
  )

  const leaveConvoy = useCallback(() => {
    unsubRef.current?.()
    unsubRef.current = null
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setConvoyId(null)
    setMembers([])
    setFocusMemberId(null)
  }, [])

  useEffect(() => {
    return () => {
      unsubRef.current?.()
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return (
    <ConvoyRosterContext.Provider
      value={{
        convoyId,
        members,
        isLoading,
        focusMemberId,
        setFocusMemberId,
        joinConvoy,
        leaveConvoy,
        refreshMembers: convoyId ? () => fetchMembers(convoyId) : async () => {},
      }}
    >
      {children}
    </ConvoyRosterContext.Provider>
  )
}

export { haversineDistance }
