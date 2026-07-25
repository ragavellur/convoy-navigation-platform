import pb from './pocketbase'

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

export async function endConvoy(convoyId: string): Promise<void> {
  await pb.collection('convoys').update(convoyId, { status: 'ended' })
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
