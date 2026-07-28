import { describe, it, expect, beforeEach, vi } from 'vitest'
import { searchPlaces, reverseGeocode } from '../nominatim'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
})

describe('searchPlaces', () => {
  it('returns empty array for empty query', async () => {
    const result = await searchPlaces({ query: '' })
    expect(result).toEqual([])
  })

  it('returns results from local nominatim', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([{ place_id: 1, display_name: 'Test Place', lat: '12', lon: '34' }]),
    })
    const result = await searchPlaces({ query: 'test', limit: 5 })
    expect(result).toHaveLength(1)
    expect(result[0].display_name).toBe('Test Place')
  })

  it('falls back to public nominatim when local fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Local unavailable')).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([{ place_id: 2, display_name: 'Public Place', lat: '56', lon: '78' }]),
    })
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
})

describe('reverseGeocode', () => {
  it('returns result on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ place_id: 3, display_name: 'Reverse Place', lat: '12', lon: '34' }),
    })
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
