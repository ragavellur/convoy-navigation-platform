import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { harness } from './helpers/supabaseTest'

const mocks = vi.hoisted(() => ({
  mockHaversineDistance: vi.fn(),
}))

vi.mock('../supabaseClient', async () => {
  const { harness } = await import('./helpers/supabaseTest')
  return { default: harness.supabase }
})

vi.mock('../positionTracking', () => ({
  haversineDistance: mocks.mockHaversineDistance,
}))

import {
  addReading,
  flushBuffer,
  flushAll,
  startAggregation,
  stopAggregation,
  resetBuffers,
} from '../telemetryAggregator'

beforeEach(() => {
  vi.useFakeTimers()
  mocks.mockHaversineDistance.mockReset()
  harness.reset()
  resetBuffers()
  stopAggregation()
})

afterEach(() => {
  vi.useRealTimers()
})

function makeReading(lat: number, lng: number, speed: number | null = null, ts = 0) {
  return { lat, lng, speed, heading: null, timestamp: ts }
}

function upsertMock() {
  return harness.mockFor('telemetry_aggregated', 'upsert')
}

describe('addReading', () => {
  it('stores readings and flushBuffer retrieves summary', async () => {
    mocks.mockHaversineDistance.mockReturnValue(100)
    const upsert = upsertMock()

    addReading('v1', 'c1', makeReading(10, 20, 30, 1000))
    addReading('v1', 'c1', makeReading(10.01, 20.01, 50, 2000))

    await flushBuffer('v1', 'c1')
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('caps buffer at 120 readings (drops oldest)', async () => {
    mocks.mockHaversineDistance.mockReturnValue(1)
    const upsert = upsertMock()

    for (let i = 0; i < 130; i++) {
      addReading('v1', 'c1', makeReading(i * 0.001, i * 0.001, 10, i))
    }

    await flushBuffer('v1', 'c1')
    expect(upsert.mock.calls[0][0].payload.point_count).toBe(120)
  })

  it('separates buffers by vehicle/convoy pair', async () => {
    mocks.mockHaversineDistance.mockReturnValue(50)
    const upsert = upsertMock()

    addReading('v1', 'c1', makeReading(10, 20, 30, 1000))
    addReading('v1', 'c1', makeReading(10.01, 20.01, 40, 2000))
    addReading('v2', 'c1', makeReading(20, 30, 60, 1000))
    addReading('v2', 'c1', makeReading(20.01, 30.01, 70, 2000))

    await flushAll()
    expect(upsert).toHaveBeenCalledTimes(2)
  })
})

describe('flushBuffer', () => {
  it('returns early for empty buffer', async () => {
    await flushBuffer('v1', 'c1')
    expect(upsertMock()).not.toHaveBeenCalled()
  })

  it('returns early for single reading (not enough for summary)', async () => {
    addReading('v1', 'c1', makeReading(10, 20, 30, 1000))
    await flushBuffer('v1', 'c1')
    expect(upsertMock()).not.toHaveBeenCalled()
  })

  it('computes correct summary and upserts record', async () => {
    mocks.mockHaversineDistance.mockReturnValue(100)
    const upsert = upsertMock()

    addReading('v1', 'c1', makeReading(10, 20, 30, 1000))
    addReading('v1', 'c1', makeReading(10.01, 20.01, 50, 2000))

    await flushBuffer('v1', 'c1')

    expect(upsert).toHaveBeenCalledTimes(1)
    const payload = upsert.mock.calls[0][0].payload
    expect(payload.vehicle).toBe('v1')
    expect(payload.point_count).toBe(2)
    expect(payload.avg_speed).toBe(50)
    expect(payload.max_speed).toBe(50)
    expect(payload.distance_traveled).toBe(100)
    expect(payload.start_lat).toBe(10)
    expect(payload.start_lng).toBe(20)
    expect(payload.end_lat).toBe(10.01)
    expect(payload.end_lng).toBe(20.01)
    expect(payload.hour_bucket).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/)
    expect(payload.route_polyline).toContain('LineString')
  })

  it('handles null speeds (avg=0, max=0)', async () => {
    mocks.mockHaversineDistance.mockReturnValue(50)
    const upsert = upsertMock()

    addReading('v1', 'c1', makeReading(10, 20, null, 1000))
    addReading('v1', 'c1', makeReading(10.01, 20.01, null, 2000))

    await flushBuffer('v1', 'c1')

    const payload = upsert.mock.calls[0][0].payload
    expect(payload.avg_speed).toBe(0)
    expect(payload.max_speed).toBe(0)
    expect(payload.distance_traveled).toBe(50)
    expect(payload.point_count).toBe(2)
  })

  it('clears buffer after flush', async () => {
    mocks.mockHaversineDistance.mockReturnValue(10)
    const upsert = upsertMock()

    addReading('v1', 'c1', makeReading(10, 20, 30, 1000))
    addReading('v1', 'c1', makeReading(10.01, 20.01, 40, 2000))
    await flushBuffer('v1', 'c1')
    expect(upsert).toHaveBeenCalledTimes(1)

    upsert.mockClear()
    await flushBuffer('v1', 'c1')
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('flushAll', () => {
  it('flushes all populated buffers', async () => {
    mocks.mockHaversineDistance.mockReturnValue(25)
    const upsert = upsertMock()

    addReading('v1', 'c1', makeReading(0, 0, 10, 1000))
    addReading('v1', 'c1', makeReading(0.01, 0.01, 20, 2000))
    addReading('v2', 'c1', makeReading(1, 1, 30, 1000))
    addReading('v2', 'c1', makeReading(1.01, 1.01, 40, 2000))

    await flushAll()
    expect(upsert).toHaveBeenCalledTimes(2)
  })
})

describe('startAggregation / stopAggregation', () => {
  it('calls flushAll on interval', async () => {
    mocks.mockHaversineDistance.mockReturnValue(10)
    const upsert = upsertMock()

    addReading('v1', 'c1', makeReading(0, 0, 10, 1000))
    addReading('v1', 'c1', makeReading(0.01, 0.01, 20, 2000))

    startAggregation(1000)
    expect(upsert).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(upsert).toHaveBeenCalled()
  })

  it('does not start duplicate timer', async () => {
    startAggregation(1000)
    startAggregation(1000)

    vi.advanceTimersByTime(5000)
  })

  it('stops periodic flushes', async () => {
    startAggregation(1000)
    stopAggregation()

    addReading('v1', 'c1', makeReading(0, 0, 10, 1000))
    addReading('v1', 'c1', makeReading(0.01, 0.01, 20, 2000))

    await vi.advanceTimersByTimeAsync(3000)
    expect(upsertMock()).not.toHaveBeenCalled()
  })
})

describe('resetBuffers', () => {
  it('clears all buffers', async () => {
    addReading('v1', 'c1', makeReading(0, 0, 10, 1000))
    addReading('v1', 'c1', makeReading(0.01, 0.01, 20, 2000))
    resetBuffers()

    await flushAll()
    expect(upsertMock()).not.toHaveBeenCalled()
  })
})
