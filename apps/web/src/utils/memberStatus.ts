import type { Position } from '../services/positionTracking'

export type MemberStatus = 'in-transit' | 'stopped' | 'offline'

const IN_TRANSIT_SPEED_THRESHOLD = 0.5
const OFFLINE_THRESHOLD_MS = 30_000

export function deriveMemberStatus(
  position: Position | null | undefined,
  now = Date.now(),
): MemberStatus {
  if (!position) return 'offline'

  const age = now - new Date(position.updated).getTime()
  if (age > OFFLINE_THRESHOLD_MS) return 'offline'

  const speed = position.speed ?? 0
  return speed >= IN_TRANSIT_SPEED_THRESHOLD ? 'in-transit' : 'stopped'
}

export function formatSpeedKmh(speed: number | null | undefined): string {
  if (speed == null) return '—'
  return `${Math.round(speed * 3.6)} km/h`
}

export function formatETA(
  distanceMeters: number | null | undefined,
  speedMs: number | null | undefined,
): string {
  if (!distanceMeters || !speedMs || speedMs < 0.1) return '—'
  const seconds = Math.round(distanceMeters / speedMs)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
