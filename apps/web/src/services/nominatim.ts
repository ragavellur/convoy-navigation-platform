const NOMINATIM_BASE_URL = 'http://localhost:8080'

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

export async function searchPlaces(params: SearchParams): Promise<NominatimResult[]> {
  const { query, limit = 5, viewbox, bounded = false } = params

  if (!query || query.length < 2) return []

  const searchParams = new URLSearchParams({
    q: query,
    format: 'json',
    limit: String(limit),
    addressdetails: '1',
    extratags: '1',
  })

  if (viewbox) {
    searchParams.set('viewbox', `${viewbox[0]},${viewbox[1]},${viewbox[2]},${viewbox[3]}`)
    searchParams.set('bounded', bounded ? '1' : '0')
  }

  try {
    const response = await fetch(`${NOMINATIM_BASE_URL}/search?${searchParams.toString()}`, {
      headers: {
        'Accept-Language': 'en',
      },
    })

    if (!response.ok) {
      throw new Error(`Nominatim search failed: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Nominatim search error:', error)
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
    const response = await fetch(`${NOMINATIM_BASE_URL}/reverse?${params.toString()}`, {
      headers: {
        'Accept-Language': 'en',
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
