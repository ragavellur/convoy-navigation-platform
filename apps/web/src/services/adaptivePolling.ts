export type MovementState = 'stationary' | 'urban' | 'highway'

export interface AdaptivePollingConfig {
  intervalMs: number
  distanceThresholdM: number
}

const CONFIGS: Record<MovementState, AdaptivePollingConfig> = {
  stationary: { intervalMs: 30000, distanceThresholdM: 0 },
  urban: { intervalMs: 5000, distanceThresholdM: 15 },
  highway: { intervalMs: 3000, distanceThresholdM: 40 },
}

const URBAN_SPEED_THRESHOLD_KMH = 40

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function classifyMovement(
  speed: number | null,
  prevLat: number | null,
  prevLng: number | null,
  currLat: number,
  currLng: number,
): MovementState {
  if (speed !== null) {
    const speedKmh = speed * 3.6
    if (speedKmh > URBAN_SPEED_THRESHOLD_KMH) return 'highway'
    if (speedKmh > 1) return 'urban'
    return 'stationary'
  }

  if (prevLat !== null && prevLng !== null) {
    const dist = haversineDistance(prevLat, prevLng, currLat, currLng)
    if (dist > 40) return 'highway'
    if (dist > 2) return 'urban'
    return 'stationary'
  }

  return 'urban'
}

export function getPollingConfig(state: MovementState): AdaptivePollingConfig {
  return CONFIGS[state]
}

export function shouldPublish(
  state: MovementState,
  prevLat: number | null,
  prevLng: number | null,
  currLat: number,
  currLng: number,
): boolean {
  const config = CONFIGS[state]
  if (config.distanceThresholdM === 0) return true
  if (prevLat === null || prevLng === null) return true
  const dist = haversineDistance(prevLat, prevLng, currLat, currLng)
  return dist >= config.distanceThresholdM
}
