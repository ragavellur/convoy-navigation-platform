import pb from './pocketbase'
import { getRoute } from './osrm'
import type { RosterMember } from '../stores/ConvoyRosterContext'
import type { RouteGeometry } from '../types'

const CLEANUP_INTERVAL_MS = 60 * 1000
const INACTIVE_THRESHOLD_MS = 30 * 60 * 1000

let cleanupTimer: ReturnType<typeof setInterval> | null = null

export async function pauseConvoy(convoyId: string): Promise<void> {
  await pb.collection('convoys').update(convoyId, { status: 'paused' })
}

export async function resumeConvoy(convoyId: string): Promise<void> {
  await pb.collection('convoys').update(convoyId, { status: 'active' })
}

export async function autoCalculateAssemblyPoint(
  convoyId: string,
  members: RosterMember[],
): Promise<void> {
  const convoy = await pb
    .collection('convoys')
    .getOne(convoyId)
    .catch(() => null)
  if (!convoy) return
  const destLat = convoy.dest_lat
  const destLng = convoy.dest_lng
  if (destLat == null || destLng == null) return

  const points = members
    .map((m) => {
      if (m.joinLat != null && m.joinLng != null) return { lat: m.joinLat, lng: m.joinLng }
      if (m.position) return { lat: m.position.lat, lng: m.position.lng }
      return null
    })
    .filter((p): p is { lat: number; lng: number } => p !== null)

  if (points.length < 2) return

  const centroid = {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  }

  let meetingPoint = centroid
  try {
    const response = await getRoute({
      origin: [centroid.lng, centroid.lat],
      destination: [destLng, destLat],
      alternatives: false,
      steps: false,
    })
    const geom = response.routes[0]?.geometry as RouteGeometry | undefined
    const coords = geom?.coordinates as [number, number][] | undefined
    if (coords && coords.length > 0) {
      meetingPoint = { lat: coords[0][1], lng: coords[0][0] }
    }
  } catch {
    // fall back to centroid
  }

  await pb.collection('convoys').update(convoyId, {
    source_lat: meetingPoint.lat,
    source_lng: meetingPoint.lng,
    source_name: 'Auto-calculated meeting point',
    phase: 'assembling',
    assembled_members: [],
  })
}

export async function clearAssemblyPoint(convoyId: string): Promise<void> {
  await pb.collection('convoys').update(convoyId, {
    source_lat: null,
    source_lng: null,
    source_name: '',
    phase: 'forming',
    assembled_members: [],
  })
}

export async function transitionPhase(convoyId: string, phase: string): Promise<void> {
  const data: Record<string, unknown> = { phase }
  if (phase === 'assembling') {
    data.assembled_members = []
  }
  await pb.collection('convoys').update(convoyId, data)
}

export async function endConvoy(convoyId: string): Promise<void> {
  await pb.collection('convoys').update(convoyId, { status: 'ended', phase: 'completed' })
  const members = await pb.collection('convoy_members').getFullList({
    filter: `convoy = "${convoyId}" && status = "active"`,
  })
  for (const member of members) {
    await pb.collection('convoy_members').update(member.id, { status: 'inactive' })
  }
}

export async function markMemberInactive(memberId: string): Promise<void> {
  await pb.collection('convoy_members').update(memberId, { status: 'inactive' })
}

export async function cleanupStaleConvoys(): Promise<number> {
  const threshold = new Date(Date.now() - INACTIVE_THRESHOLD_MS).toISOString()
  const stale = await pb.collection('convoys').getFullList({
    filter: `status = "active" && created < "${threshold}"`,
  })
  for (const convoy of stale) {
    await endConvoy(convoy.id)
  }
  return stale.length
}

export function startSessionCleanup(): void {
  if (cleanupTimer) return
  cleanupTimer = setInterval(async () => {
    try {
      await cleanupStaleConvoys()
    } catch {
      // Silent fail for background cleanup
    }
  }, CLEANUP_INTERVAL_MS)
}

export function stopSessionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
}
