import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  searchPlaces,
  reverseGeocode,
  formatIndianAddress,
  localizedName,
  NominatimResult,
} from '../nominatim'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function resultWith(overrides: Partial<NominatimResult> = {}): NominatimResult {
  return {
    place_id: 1,
    licence: 'ODbL',
    osm_type: 'node',
    osm_id: 1,
    boundingbox: ['0', '0', '0', '0'],
    lat: '12',
    lon: '34',
    display_name: 'Test Place',
    class: 'place',
    type: 'city',
    importance: 0.5,
    ...overrides,
  }
}

function okResponse(result: unknown) {
  return { ok: true, json: () => Promise.resolve(result) }
}

function requestAt(index: number): { url: URL; headers: Record<string, string> } {
  const [url, init] = mockFetch.mock.calls[index]
  const parsed = new URL(url as string)
  const headers = (init as RequestInit)?.headers as Record<string, string>
  return { url: parsed, headers }
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('searchPlaces', () => {
  it('returns empty array for empty query', async () => {
    const result = await searchPlaces({ query: '' })
    expect(result).toEqual([])
  })

  it('returns results from local nominatim', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([resultWith({ display_name: 'Test Place' })]))
    const result = await searchPlaces({ query: 'test', limit: 5 })
    expect(result).toHaveLength(1)
    expect(result[0].display_name).toBe('Test Place')
  })

  it('falls back to public nominatim when local fails', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Local unavailable'))
      .mockResolvedValueOnce(okResponse([resultWith({ display_name: 'Public Place' })]))
    const result = await searchPlaces({ query: 'test' })
    expect(result).toHaveLength(1)
    expect(result[0].display_name).toBe('Public Place')
  })

  it('throws when both local and public fail', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Local down'))
      .mockRejectedValueOnce(new Error('Public down'))
    await expect(searchPlaces({ query: 'test' })).rejects.toThrow('Public down')
  })

  it('scopes search to India by default', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([resultWith()]))
    await searchPlaces({ query: 'pune' })
    const { url } = requestAt(0)
    expect(url.searchParams.get('countrycodes')).toBe('in')
    expect(url.searchParams.get('addressdetails')).toBe('1')
    expect(url.searchParams.get('namedetails')).toBe('1')
    expect(url.searchParams.get('dedupe')).toBe('1')
  })

  it('defaults bounded to 1 when viewbox is provided', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([resultWith()]))
    await searchPlaces({ query: 'pune', viewbox: [73.7, 18.4, 74.0, 18.6] })
    const { url } = requestAt(0)
    expect(url.searchParams.get('viewbox')).toBe('73.7,18.4,74,18.6')
    expect(url.searchParams.get('bounded')).toBe('1')
  })

  it('sets bounded to 0 when explicitly disabled', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([resultWith()]))
    await searchPlaces({ query: 'pune', viewbox: [73.7, 18.4, 74.0, 18.6], bounded: false })
    const { url } = requestAt(0)
    expect(url.searchParams.get('bounded')).toBe('0')
  })

  it('sends a supported Accept-Language header', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([resultWith()]))
    await searchPlaces({ query: 'pune' })
    const { headers } = requestAt(0)
    expect(headers['Accept-Language']).toContain('en')
  })

  it('tries structured postalcode search first when query contains an Indian PIN', async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse([]))
      .mockResolvedValueOnce(okResponse([]))
      .mockResolvedValueOnce(okResponse([]))
      .mockResolvedValueOnce(
        okResponse([resultWith({ place_id: 9, display_name: 'MG Road, Bangalore' })]),
      )
    const result = await searchPlaces({ query: 'MG Road Bangalore 560001' })
    expect(result[0].display_name).toBe('MG Road, Bangalore')

    const structured = requestAt(0)
    expect(structured.url.searchParams.get('postalcode')).toBe('560001')
    expect(structured.url.searchParams.get('street')).toBe('MG Road Bangalore')
    expect(structured.url.searchParams.get('q')).toBeNull()

    const fallback = requestAt(3)
    expect(fallback.url.searchParams.get('q')).toBe('MG Road Bangalore 560001')
    expect(fallback.url.searchParams.get('postalcode')).toBeNull()
  })
})

describe('formatIndianAddress', () => {
  it('builds road, locality, city, postcode, state', () => {
    const address = formatIndianAddress({
      display_name: 'Raw, Display, Name',
      address: {
        road: 'FC Road',
        suburb: 'Shivajinagar',
        city: 'Pune',
        state: 'Maharashtra',
        postcode: '411005',
        country_code: 'in',
      },
    })
    expect(address).toBe('FC Road, Shivajinagar, Pune, 411005, Maharashtra')
  })

  it('omits India as country but keeps foreign country', () => {
    const inAddress = formatIndianAddress({
      display_name: 'x',
      address: { city: 'Mumbai', state: 'Maharashtra', country: 'India', country_code: 'in' },
    })
    expect(inAddress).not.toContain('India')

    const foreignAddress = formatIndianAddress({
      display_name: 'x',
      address: { city: 'Kathmandu', state: 'Bagmati', country: 'Nepal', country_code: 'np' },
    })
    expect(foreignAddress).toContain('Nepal')
  })

  it('falls back to display_name when address is missing', () => {
    expect(formatIndianAddress({ display_name: 'Only Name' })).toBe('Only Name')
  })
})

describe('localizedName', () => {
  it('returns a preferred Indic name when present', () => {
    expect(localizedName({ namedetails: { name: 'Pune', 'name:hi': 'पुणे' } })).toBe('पुणे')
  })

  it('falls back to default name', () => {
    expect(localizedName({ namedetails: { name: 'Pune' } })).toBe('Pune')
  })

  it('returns undefined without namedetails', () => {
    expect(localizedName({})).toBeUndefined()
  })
})

describe('reverseGeocode', () => {
  it('returns result on success', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(resultWith({ display_name: 'Reverse Place' })))
    const result = await reverseGeocode(12.34, 56.78)
    expect(result).not.toBeNull()
    expect(result!.display_name).toBe('Reverse Place')
  })

  it('throws on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(reverseGeocode(12.34, 56.78)).rejects.toThrow('Nominatim reverse geocode failed')
  })

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    await expect(reverseGeocode(12.34, 56.78)).rejects.toThrow('Network error')
  })
})
