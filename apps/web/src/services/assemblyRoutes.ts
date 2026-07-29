import { getRoute } from './osrm'
import type { Route } from '../types'
import type { RosterMember } from '../stores/ConvoyRosterContext'

export interface AssemblyRoute {
  memberId: string
  userId: string
  userName: string
  vehicleColor?: string
  route: Route
  distance: number
  duration: number
}

function sourcePoint(m: RosterMember): { lat: number; lng: number } | null {
  if (m.joinLat != null && m.joinLng != null) return { lat: m.joinLat, lng: m.joinLng }
  if (m.position) return m.position
  return null
}

export async function computeAssemblyRoutes(
  members: RosterMember[],
  assemblyPoint: { lat: number; lng: number },
): Promise<AssemblyRoute[]> {
  const withSource = members.filter((m) => sourcePoint(m))

  if (withSource.length === 0) return []

  const results = await Promise.allSettled(
    withSource.map(async (member) => {
      const sp = sourcePoint(member)!
      const origin: [number, number] = [sp.lng, sp.lat]
      const dest: [number, number] = [assemblyPoint.lng, assemblyPoint.lat]
      const response = await getRoute({
        origin,
        destination: dest,
        alternatives: false,
        steps: false,
      })
      const route = response.routes[0]
      return {
        memberId: member.id,
        userId: member.userId,
        userName: member.userName,
        vehicleColor: member.vehicleColor,
        route,
        distance: route.distance,
        duration: route.duration,
      } satisfies AssemblyRoute
    }),
  )

  const assemblyRoutes: AssemblyRoute[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      assemblyRoutes.push(result.value)
    } else {
      console.warn('[AssemblyRoute] Failed to compute route:', result.reason)
    }
  }

  return assemblyRoutes
}
