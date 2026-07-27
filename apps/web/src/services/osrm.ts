import type { RouteResponse, RouteSummary } from '../types'

const LOCAL_OSRM_URL = 'http://localhost:5001'
const PUBLIC_OSRM_URL = 'https://router.project-osrm.org'

interface OSRMRouteParams {
  origin: [number, number]
  destination: [number, number]
  alternatives?: boolean
  steps?: boolean
  geometries?: 'geojson' | 'polyline' | 'polyline6'
}

async function fetchOSRM(
  base: string,
  coordinates: string,
  searchParams: URLSearchParams,
): Promise<RouteResponse> {
  const url = `${base}/route/v1/driving/${coordinates}?${searchParams.toString()}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`OSRM ${base} failed: ${response.status}`)
  const data = await response.json()
  if (data.code !== 'Ok') throw new Error(`OSRM error: ${data.code}`)
  return data
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
    const data = await fetchOSRM(LOCAL_OSRM_URL, coordinates, searchParams)
    const route = data.routes[0]
    if (route && route.distance > 0) return data
    console.warn('Local OSRM returned 0 distance, trying public...')
  } catch (e) {
    console.warn('Local OSRM failed, trying public:', e)
  }

  return fetchOSRM(PUBLIC_OSRM_URL, coordinates, searchParams)
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
