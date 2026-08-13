import { describe, it, expect, beforeEach, vi } from 'vitest'
import { harness } from './helpers/supabaseTest'

vi.mock('../supabaseClient', async () => {
  const { harness } = await import('./helpers/supabaseTest')
  return { default: harness.supabase }
})

import { getCachedRoute, cacheRoute } from '../routeCache'

beforeEach(() => {
  harness.reset()
})

const freshRow = {
  id: 'r1',
  origin_lat: 34,
  origin_lng: 12,
  dest_lat: 78,
  dest_lng: 56,
  distance: 50000,
  duration: 1800,
  geometry: '{"type":"LineString"}',
  alternatives_json: '[]',
  created_at: new Date().toISOString(),
}

describe('routeCache', () => {
  it('getCachedRoute returns null on cache miss', async () => {
    harness.mockFor('cached_routes', 'select').mockResolvedValueOnce({ data: null, error: null })
    const result = await getCachedRoute([12, 34], [56, 78])
    expect(result).toBeNull()
  })

  it('getCachedRoute returns null on error', async () => {
    harness.mockFor('cached_routes', 'select').mockRejectedValueOnce(new Error('DB error'))
    const result = await getCachedRoute([12, 34], [56, 78])
    expect(result).toBeNull()
  })

  it('getCachedRoute returns fresh cached route', async () => {
    harness
      .mockFor('cached_routes', 'select')
      .mockResolvedValueOnce({ data: freshRow, error: null })
    const result = await getCachedRoute([12, 34], [56, 78])
    expect(result).not.toBeNull()
    expect(result?.distance).toBe(50000)
    expect(result?.duration).toBe(1800)
    expect(result?.geometry).toBe('{"type":"LineString"}')
    expect(result?.created).toBe(freshRow.created_at)
  })

  it('getCachedRoute returns null for expired cache', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    harness
      .mockFor('cached_routes', 'select')
      .mockResolvedValueOnce({ data: { ...freshRow, created_at: oldDate }, error: null })
    const result = await getCachedRoute([12, 34], [56, 78])
    expect(result).toBeNull()
  })

  it('cacheRoute upserts entry with rounded coordinates and conflict key', async () => {
    const upsert = harness.mockFor('cached_routes', 'upsert')
    await cacheRoute([12.000001, 34.000004], [56, 78], 50000, 1800, '{}', '[]')
    expect(upsert).toHaveBeenCalledTimes(1)
    const op = upsert.mock.calls[0][0]
    expect(op.payload).toMatchObject({
      origin_lat: 34,
      origin_lng: 12,
      dest_lat: 78,
      dest_lng: 56,
      distance: 50000,
      duration: 1800,
      geometry: '{}',
      alternatives_json: '[]',
    })
    expect(op.options).toEqual({ onConflict: 'origin_lat,origin_lng,dest_lat,dest_lng' })
  })

  it('cacheRoute handles errors silently', async () => {
    harness.mockFor('cached_routes', 'upsert').mockRejectedValueOnce(new Error('DB error'))
    await expect(cacheRoute([12, 34], [56, 78], 50000, 1800, '{}', '[]')).resolves.not.toThrow()
  })
})
