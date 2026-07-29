import pb from './pocketbase'
import type { RosterMember } from '../stores/ConvoyRosterContext'

export interface SessionState {
  convoyId: string
  status: 'active' | 'paused' | 'ended'
  lastActivity: string
}

const CLEANUP_INTERVAL_MS = 60 * 1000
const INACTIVE_THRESHOLD_MS = 30 * 60 * 1000

let cleanupTimer: ReturnType<typeof setInterval> | null = null

export async function pauseConvoy(convoyId: string): Promise<void> {
  await pb.collection('convoys').update(convoyId, { status: 'paused' })
}

export async function resumeConvoy(convoyId: string): Promise<void> {
  await pb.collection('convoys').update(convoyId, { status: 'active' })
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

export async function autoCalculateAssemblyPoint(
  convoyId: string,
  members: RosterMember[],
  ownerUserId: string,
): Promise<void> {
  const points = members
    .filter((m) => m.userId !== ownerUserId)
    .map((m) => {
      if (m.joinLat != null && m.joinLng != null)
        return { lat: m.joinLat, lng: m.joinLng, name: m.joinName }
      if (m.position) return { lat: m.position.lat, lng: m.position.lng, name: undefined }
      return null
    })
    .filter((p): p is { lat: number; lng: number; name: string | undefined } => p !== null)

  if (points.length === 0) return

  const centroid = {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  }

  await pb.collection('convoys').update(convoyId, {
    source_lat: centroid.lat,
    source_lng: centroid.lng,
    source_name: 'Auto-calculated meeting point',
    phase: 'assembling',
    assembled_members: [],
  })
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
