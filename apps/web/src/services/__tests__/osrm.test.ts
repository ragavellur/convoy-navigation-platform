import { describe, it, expect, beforeEach, vi } from 'vitest'
import { formatDistance, formatDuration, getRouteSummary, getRoute } from '../osrm'

describe('formatDistance', () => {
  it('formats meters under 1000', () => expect(formatDistance(500)).toBe('500 m'))
  it('formats exactly 1000 as km', () => expect(formatDistance(1000)).toBe('1.0 km'))
  it('formats km with one decimal', () => expect(formatDistance(12345)).toBe('12.3 km'))
})

describe('formatDuration', () => {
  it('formats minutes only', () => expect(formatDuration(300)).toBe('5 min'))
  it('formats hours and minutes', () => expect(formatDuration(3660)).toBe('1h 1m'))
  it('formats multiple hours', () => expect(formatDuration(7200)).toBe('2h 0m'))
})

describe('getRouteSummary', () => {
  it('extracts summary from route', () => {
    const route = {
      distance: 50000,
      duration: 1800,
      legs: [
        { steps: [{ name: 'Start', distance: 100, duration: 10 }], distance: 100, duration: 10 },
      ],
    }
    const summary = getRouteSummary(route as any)
    expect(summary.distance).toBe(50000)
    expect(summary.duration).toBe(1800)
    expect(summary.steps).toHaveLength(1)
  })
})

describe('getRoute', () => {
  const mockFetch = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  const validResponse = {
    code: 'Ok',
    routes: [
      {
        distance: 50000,
        duration: 1800,
        geometry: { type: 'LineString', coordinates: [[0, 0]] },
        legs: [{ steps: [], distance: 50000, duration: 1800 }],
        weight: 1800,
      },
    ],
    waypoints: [{ location: [0, 0], name: 'Start' }],
  }

  it('fetches from local OSRM', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })
    const result = await getRoute({ origin: [12, 34], destination: [56, 78] })
    expect(result.code).toBe('Ok')
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('localhost:5001'))
  })

  it('falls back to public OSRM when local returns 0 distance', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ code: 'Ok', routes: [{ distance: 0 }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validResponse),
      })
    const result = await getRoute({ origin: [12, 34], destination: [56, 78] })
    expect(result.code).toBe('Ok')
  })

  it('falls back to public when local fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Local error')).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })
    const result = await getRoute({ origin: [12, 34], destination: [56, 78] })
    expect(result.code).toBe('Ok')
  })

  it('uses foot profile for walking routes', async () => {
    const response = {
      code: 'Ok',
      routes: [
        {
          distance: 1000,
          duration: 100,
          geometry: { type: 'LineString', coordinates: [[]] },
          legs: [{ steps: [], distance: 1000, duration: 100 }],
          weight: 100,
        },
      ],
      waypoints: [],
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    })
    const result = await getRoute({ origin: [12, 34], destination: [56, 78], profile: 'foot' })
    expect(result.routes[0].duration).toBeGreaterThan(100)
  })
})
