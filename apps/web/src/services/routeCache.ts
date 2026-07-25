import PocketBase from 'pocketbase'

const POCKETBASE_URL = 'http://localhost:8090'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface CachedRoute {
  origin_lat: number
  origin_lng: number
  dest_lat: number
  dest_lng: number
  distance: number
  duration: number
  geometry: string
  alternatives_json: string
  created: string
}

function getPb(): PocketBase {
  return new PocketBase(POCKETBASE_URL)
}

function roundCoord(n: number): number {
  return Math.round(n * 10000) / 10000
}

function cacheKey(
  origin: [number, number],
  dest: [number, number],
): { origin_lat: number; origin_lng: number; dest_lat: number; dest_lng: number } {
  return {
    origin_lat: roundCoord(origin[1]),
    origin_lng: roundCoord(origin[0]),
    dest_lat: roundCoord(dest[1]),
    dest_lng: roundCoord(dest[0]),
  }
}

export async function getCachedRoute(
  origin: [number, number],
  dest: [number, number],
): Promise<CachedRoute | null> {
  try {
    const pb = getPb()
    const key = cacheKey(origin, dest)
    const results = await pb.collection('cached_routes').getFullList({
      filter: `origin_lat = ${key.origin_lat} && origin_lng = ${key.origin_lng} && dest_lat = ${key.dest_lat} && dest_lng = ${key.dest_lng}`,
      sort: '-created',
      limit: 1,
    })

    if (results.length === 0) return null

    const cached = results[0]
    const age = Date.now() - new Date(cached.created).getTime()
    if (age > CACHE_TTL_MS) return null

    return cached as unknown as CachedRoute
  } catch {
    return null
  }
}

export async function cacheRoute(
  origin: [number, number],
  dest: [number, number],
  distance: number,
  duration: number,
  geometry: string,
  alternativesJson: string,
): Promise<void> {
  try {
    const pb = getPb()
    const key = cacheKey(origin, dest)

    const existing = await pb.collection('cached_routes').getFullList({
      filter: `origin_lat = ${key.origin_lat} && origin_lng = ${key.origin_lng} && dest_lat = ${key.dest_lat} && dest_lng = ${key.dest_lng}`,
      limit: 1,
    })

    if (existing.length > 0) {
      await pb.collection('cached_routes').update(existing[0].id, {
        distance,
        duration,
        geometry,
        alternatives_json: alternativesJson,
      })
    } else {
      await pb.collection('cached_routes').create({
        ...key,
        distance,
        duration,
        geometry,
        alternatives_json: alternativesJson,
      })
    }
  } catch {
    // silently fail — caching is non-critical
  }
}
