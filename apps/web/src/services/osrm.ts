import type { RouteResponse, RouteSummary } from '../types'

const OSRM_BASE_URL = 'http://localhost:5001'

interface OSRMRouteParams {
  origin: [number, number]
  destination: [number, number]
  alternatives?: boolean
  steps?: boolean
  geometries?: 'geojson' | 'polyline' | 'polyline6'
}

export async function getRoute(params: OSRMRouteParams): Promise<RouteResponse> {
  const { origin, destination, alternatives = true, steps = true, geometries = 'geojson' } = params

  const coordinates = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`
  const searchParams = new URLSearchParams({
    overview: 'full',
    steps: String(steps),
    geometries,
    alternatives: String(alternatives),
  })

  try {
    const response = await fetch(
      `${OSRM_BASE_URL}/route/v1/driving/${coordinates}?${searchParams.toString()}`,
    )

    if (!response.ok) {
      throw new Error(`OSRM route failed: ${response.status}`)
    }

    const data = await response.json()

    if (data.code !== 'Ok') {
      throw new Error(`OSRM route error: ${data.code}`)
    }

    return data
  } catch (error) {
    console.error('OSRM route error:', error)
    throw error
  }
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes} min`
}

export function getRouteSummary(route: RouteResponse['routes'][0]): RouteSummary {
  return {
    distance: route.distance,
    duration: route.duration,
    steps: route.legs.flatMap((leg) => leg.steps),
  }
}
