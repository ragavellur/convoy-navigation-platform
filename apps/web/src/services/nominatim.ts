const PUBLIC_NOMINATIM_URL = 'https://nominatim.openstreetmap.org'
const USER_AGENT = 'ConvoyNavigationPlatform/1.0'
const DEFAULT_COUNTRYCODES = 'in'
const PIN_PATTERN = /\b\d{6}\b/
const REQUEST_TIMEOUT_MS = 8000

function resolveNominatimUrl(): string {
  const fromEnv = import.meta.env.VITE_NOMINATIM_URL as string | undefined
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : PUBLIC_NOMINATIM_URL
}

const INDIC_LANGUAGES = [
  'hi',
  'bn',
  'gu',
  'kn',
  'ml',
  'mr',
  'ne',
  'pa',
  'ta',
  'te',
  'ur',
  'en',
] as const

const PREFERRED_NAME_LANGS = [
  'hi',
  'bn',
  'gu',
  'kn',
  'ml',
  'mr',
  'ne',
  'pa',
  'ta',
  'te',
  'ur',
] as const

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
  address?: Record<string, string>
  namedetails?: Record<string, string>
}

export interface SearchParams {
  query: string
  limit?: number
  viewbox?: [number, number, number, number]
  bounded?: boolean
  countrycodes?: string
  postalcode?: string
  street?: string
}

type NominatimFields = Pick<NominatimResult, 'address' | 'namedetails' | 'display_name'>

export function resolveAcceptLanguage(): string {
  if (typeof navigator === 'undefined') return 'en'
  const languages = navigator.languages ?? [navigator.language ?? 'en']
  const codes = languages
    .map((lang) => lang.toLowerCase())
    .map((lang) => INDIC_LANGUAGES.find((code) => lang === code || lang.startsWith(`${code}-`)))
    .filter((code): code is NonNullable<typeof code> => Boolean(code))
  return Array.from(new Set(codes)).length > 0 ? Array.from(new Set(codes)).join(',') : 'en'
}

function resolveCountryCodes(): string {
  const fromEnv = import.meta.env.VITE_NOMINATIM_COUNTRYCODES as string | undefined
  return fromEnv || DEFAULT_COUNTRYCODES
}

function buildSearchParams(params: SearchParams): URLSearchParams {
  const sp = new URLSearchParams({
    format: 'json',
    limit: String(params.limit ?? 5),
    addressdetails: '1',
    namedetails: '1',
    extratags: '1',
    dedupe: '1',
    countrycodes: params.countrycodes ?? resolveCountryCodes(),
  })
  if (params.postalcode) {
    sp.set('postalcode', params.postalcode)
    if (params.street) sp.set('street', params.street)
  } else if (params.query) {
    sp.set('q', params.query)
  }
  if (params.viewbox) {
    sp.set(
      'viewbox',
      `${params.viewbox[0]},${params.viewbox[1]},${params.viewbox[2]},${params.viewbox[3]}`,
    )
    sp.set('bounded', params.bounded === false ? '0' : '1')
  }
  return sp
}

async function fetchFromNominatim(
  baseUrl: string,
  params: URLSearchParams,
  headers: Record<string, string> = {},
): Promise<NominatimResult[]> {
  const response = await fetch(`${baseUrl}/search?${params.toString()}`, {
    headers: { 'Accept-Language': resolveAcceptLanguage(), ...headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Nominatim search failed: ${response.status}`)
  }
  return await response.json()
}

async function trySearch(params: SearchParams): Promise<NominatimResult[]> {
  const sp = buildSearchParams(params)
  const configured = resolveNominatimUrl()

  const attempts: Array<[string, Record<string, string>]> = []
  attempts.push([
    configured,
    configured === PUBLIC_NOMINATIM_URL ? { 'User-Agent': USER_AGENT } : {},
  ])
  if (configured !== PUBLIC_NOMINATIM_URL) {
    attempts.push([PUBLIC_NOMINATIM_URL, { 'User-Agent': USER_AGENT }])
  }

  let lastError: unknown = null
  let anyRequestSucceeded = false
  for (const [url, headers] of attempts) {
    try {
      const results = await fetchFromNominatim(url, sp, headers)
      if (results.length > 0) return results
      anyRequestSucceeded = true
    } catch (error) {
      lastError = error
    }
  }

  if (!anyRequestSucceeded && lastError) {
    console.error('Nominatim search error (all endpoints failed):', lastError)
    throw lastError
  }
  return []
}

function extractPin(query: string): string | null {
  const match = query.match(PIN_PATTERN)
  return match ? match[0] : null
}

function structuredByPin(params: SearchParams, pin: string): SearchParams {
  const street = params.query
    .replace(PIN_PATTERN, '')
    .trim()
    .replace(/^,+|,+$/g, '')
  if (!street) return { ...params, postalcode: pin, street: undefined }
  return { ...params, postalcode: pin, street }
}

export async function searchPlaces(params: SearchParams): Promise<NominatimResult[]> {
  const { query } = params
  if (!query || query.length < 2) return []

  const pin = extractPin(query)
  const candidates: SearchParams[] = []
  if (pin) candidates.push(structuredByPin(params, pin))
  candidates.push(params)
  if (params.viewbox) {
    candidates.push({ ...params, viewbox: undefined, bounded: undefined })
  }

  for (const candidate of candidates) {
    const results = await trySearch(candidate)
    if (results.length > 0) return results
  }
  return []
}

export async function reverseGeocode(lat: number, lon: number): Promise<NominatimResult | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    addressdetails: '1',
  })

  try {
    const response = await fetch(`${resolveNominatimUrl()}/reverse?${params.toString()}`, {
      headers: {
        'Accept-Language': resolveAcceptLanguage(),
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

export function localizedName(result: Pick<NominatimResult, 'namedetails'>): string | undefined {
  const names = result.namedetails
  if (!names) return undefined
  for (const lang of PREFERRED_NAME_LANGS) {
    const value = names[`name:${lang}`]
    if (value) return value
  }
  return names.name
}

export function formatIndianAddress(result: NominatimFields): string {
  const address = result.address
  if (!address) return result.display_name

  const groups: string[][] = [
    ['road', 'pedestrian', 'footway'],
    ['neighbourhood', 'suburb', 'city_district'],
    ['city', 'town', 'village'],
  ]
  const parts: string[] = []
  for (const keys of groups) {
    const value = keys.map((key) => address[key]).find(Boolean)
    if (value && !parts.includes(value)) parts.push(value)
  }
  if (address.postcode && !parts.includes(address.postcode)) parts.push(address.postcode)
  const state =
    (address.state_district && !parts.includes(address.state_district) && address.state_district) ||
    (address.state && !parts.includes(address.state) && address.state)
  if (state) parts.push(state)
  if (address.country_code !== 'in' && address.country && !parts.includes(address.country)) {
    parts.push(address.country)
  }
  return parts.length > 0 ? parts.join(', ') : result.display_name
}
