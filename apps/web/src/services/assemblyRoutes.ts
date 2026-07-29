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

export async function computeAssemblyRoutes(
  members: RosterMember[],
  ownerUserId: string,
  assemblyPoint: { lat: number; lng: number },
): Promise<AssemblyRoute[]> {
  const nonOwnerMembers = members.filter((m) => m.userId !== ownerUserId && m.position)

  if (nonOwnerMembers.length === 0) return []

  const results = await Promise.allSettled(
    nonOwnerMembers.map(async (member) => {
      const origin: [number, number] = [member.position!.lng, member.position!.lat]
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
