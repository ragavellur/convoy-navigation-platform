const LOCAL_NOMINATIM_URL = 'http://localhost:8080'
const PUBLIC_NOMINATIM_URL = 'https://nominatim.openstreetmap.org'
const USER_AGENT = 'ConvoyNavigationPlatform/1.0'

export interface NominatimResult {
  place_id: number
  licence: string
  osm_type: string
  osm_id: number
  boundingbox: [string, string, string, string]
  lat: string
  lon: string
  display_name: string
  class: string
  type: string
  importance: number
}

export interface SearchParams {
  query: string
  limit?: number
  viewbox?: [number, number, number, number]
  bounded?: boolean
}

async function fetchFromNominatim(
  baseUrl: string,
  params: URLSearchParams,
  headers: Record<string, string> = {},
): Promise<NominatimResult[]> {
  const response = await fetch(`${baseUrl}/search?${params.toString()}`, {
    headers: { 'Accept-Language': 'en', ...headers },
  })
  if (!response.ok) {
    throw new Error(`Nominatim search failed: ${response.status}`)
  }
  return await response.json()
}

function buildSearchParams(params: SearchParams): URLSearchParams {
  const sp = new URLSearchParams({
    q: params.query,
    format: 'json',
    limit: String(params.limit ?? 5),
    addressdetails: '1',
    extratags: '1',
  })
  if (params.viewbox) {
    sp.set(
      'viewbox',
      `${params.viewbox[0]},${params.viewbox[1]},${params.viewbox[2]},${params.viewbox[3]}`,
    )
    sp.set('bounded', params.bounded ? '1' : '0')
  }
  return sp
}

export async function searchPlaces(params: SearchParams): Promise<NominatimResult[]> {
  const { query } = params
  if (!query || query.length < 2) return []

  const sp = buildSearchParams(params)

  try {
    const results = await fetchFromNominatim(LOCAL_NOMINATIM_URL, sp)
    if (results.length > 0) return results
  } catch {
    // Local Nominatim unavailable, fall through to public
  }

  try {
    return await fetchFromNominatim(PUBLIC_NOMINATIM_URL, sp, { 'User-Agent': USER_AGENT })
  } catch (error) {
    console.error('Nominatim search error (local + public failed):', error)
    throw error
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<NominatimResult | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    addressdetails: '1',
  })

  try {
    const response = await fetch(`${LOCAL_NOMINATIM_URL}/reverse?${params.toString()}`, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': USER_AGENT,
      },
    })

    if (!response.ok) {
      throw new Error(`Nominatim reverse geocode failed: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Nominatim reverse geocode error:', error)
    throw error
  }
}
