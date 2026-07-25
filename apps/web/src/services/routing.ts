import type { RouteGeometry } from '../types'

const OFF_ROUTE_THRESHOLD_METERS = 50
const POSITION_CHECK_INTERVAL_MS = 3000

export function distanceBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function findNearestPointOnRoute(
  lat: number,
  lng: number,
  routeCoords: Array<[number, number]>,
): { distance: number; index: number } {
  let minDist = Infinity
  let nearestIdx = 0

  for (let i = 0; i < routeCoords.length; i++) {
    const dist = distanceBetween(lat, lng, routeCoords[i][1], routeCoords[i][0])
    if (dist < minDist) {
      minDist = dist
      nearestIdx = i
    }
  }

  return { distance: minDist, index: nearestIdx }
}

export function isOffRoute(
  currentLat: number,
  currentLng: number,
  routeGeometry: RouteGeometry,
): boolean {
  const { distance } = findNearestPointOnRoute(currentLat, currentLng, routeGeometry.coordinates)
  return distance > OFF_ROUTE_THRESHOLD_METERS
}

export function calculateTrafficSegments(
  routeGeometry: RouteGeometry,
  routeDuration: number,
  routeDistance: number,
): Array<{
  coordinates: Array<[number, number]>
  congestion: 'free' | 'light' | 'moderate' | 'heavy'
  color: string
}> {
  const coords = routeGeometry.coordinates
  const segmentSize = Math.max(1, Math.floor(coords.length / 20))
  const avgSpeed = routeDistance / routeDuration
  const segments: Array<{
    coordinates: Array<[number, number]>
    congestion: 'free' | 'light' | 'moderate' | 'heavy'
    color: string
  }> = []

  for (let i = 0; i < coords.length; i += segmentSize) {
    const segmentCoords = coords.slice(i, i + segmentSize + 1)
    const segmentStart = coords[Math.min(i, coords.length - 1)]
    const segmentEnd = coords[Math.min(i + segmentSize, coords.length - 1)]

    const segDist = distanceBetween(segmentStart[1], segmentStart[0], segmentEnd[1], segmentEnd[0])

    const seededRandom =
      Math.abs(Math.sin(segmentStart[0] * 1000 + segmentStart[1] * 500)) * 0.4 + 0.8
    const segmentSpeed = avgSpeed * seededRandom
    const speedRatio = segmentSpeed / avgSpeed

    let congestion: 'free' | 'light' | 'moderate' | 'heavy'
    let color: string

    if (speedRatio > 1.1) {
      congestion = 'free'
      color = '#22c55e'
    } else if (speedRatio > 0.85) {
      congestion = 'light'
      color = '#84cc16'
    } else if (speedRatio > 0.6) {
      congestion = 'moderate'
      color = '#f59e0b'
    } else {
      congestion = 'heavy'
      color = '#ef4444'
    }

    if (segDist > 0) {
      segments.push({ coordinates: segmentCoords, congestion, color })
    }
  }

  return segments
}

export { OFF_ROUTE_THRESHOLD_METERS, POSITION_CHECK_INTERVAL_MS }
