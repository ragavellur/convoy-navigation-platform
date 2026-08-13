import supabase from './supabaseClient'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export interface CachedRoute {
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
    const key = cacheKey(origin, dest)
    const { data } = await supabase
      .from('cached_routes')
      .select('*')
      .eq('origin_lat', key.origin_lat)
      .eq('origin_lng', key.origin_lng)
      .eq('dest_lat', key.dest_lat)
      .eq('dest_lng', key.dest_lng)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) return null
    const age = Date.now() - new Date(data.created_at).getTime()
    if (age > CACHE_TTL_MS) return null

    return {
      origin_lat: data.origin_lat,
      origin_lng: data.origin_lng,
      dest_lat: data.dest_lat,
      dest_lng: data.dest_lng,
      distance: data.distance,
      duration: data.duration,
      geometry: data.geometry,
      alternatives_json: data.alternatives_json || '',
      created: data.created_at,
    }
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
    const key = cacheKey(origin, dest)
    await supabase.from('cached_routes').upsert(
      {
        ...key,
        distance,
        duration,
        geometry,
        alternatives_json: alternativesJson,
      },
      { onConflict: 'origin_lat,origin_lng,dest_lat,dest_lng' },
    )
  } catch {
    // silently fail — caching is non-critical
  }
}
