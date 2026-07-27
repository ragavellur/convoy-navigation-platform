import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import pb from '../services/pocketbase'
import type { Position } from '../services/positionTracking'
import { getLatestPositions, subscribeToConvoyPositions } from '../services/positionTracking'
import { deriveMemberStatus, type MemberStatus, haversineDistance } from '../utils/memberStatus'

export interface RosterMember {
  id: string
  userId: string
  userName: string
  userAvatar?: string
  role: 'host' | 'member' | 'viewer'
  vehicleId?: string
  vehicleType?: 'car' | 'truck' | 'motorcycle' | 'other'
  vehicleColor?: string
  vehicleName?: string
  position: Position | null
  status: MemberStatus
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
      const [memberRecords, positions] = await Promise.all([
        pb.collection('convoy_members').getFullList({
          filter: `convoy = "${id}" && status = "active"`,
          expand: 'user,vehicle',
        }),
        getLatestPositions(id),
      ])

      const posMap = new Map<string, Position>()
      for (const pos of positions) {
        posMap.set(pos.vehicle, pos)
      }

      const roster: RosterMember[] = memberRecords.map((m) => {
        const vehicle = m.expand?.vehicle
        const position = vehicle ? (posMap.get(vehicle.id) ?? null) : null
        const user = m.expand?.user
        return {
          id: m.id,
          userId: m.user,
          userName: user?.name ?? 'Unknown',
          userAvatar: user?.avatar,
          role: m.role,
          vehicleId: vehicle?.id,
          vehicleType: vehicle?.type,
          vehicleColor: vehicle?.color,
          vehicleName: vehicle?.name,
          position,
          status: deriveMemberStatus(position),
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
