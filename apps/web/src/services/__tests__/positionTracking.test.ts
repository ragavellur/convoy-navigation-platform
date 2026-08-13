import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { harness } from './helpers/supabaseTest'

const mocks = vi.hoisted(() => ({
  mockQueuePendingPosition: vi.fn(),
  mockGetPendingPositions: vi.fn(),
  mockRemovePendingPosition: vi.fn(),
}))

vi.mock('../supabaseClient', async () => {
  const { harness } = await import('./helpers/supabaseTest')
  return { default: harness.supabase }
})

vi.mock('../../lib/db', () => ({
  queuePendingPosition: mocks.mockQueuePendingPosition,
  getPendingPositions: mocks.mockGetPendingPositions,
  removePendingPosition: mocks.mockRemovePendingPosition,
}))

import {
  hasMovedSignificantly,
  resetPositionThreshold,
  publishPosition,
  flushPendingPositions,
  subscribeToConvoyPositions,
  getLatestPositions,
  setPositionPublishingEnabled,
  unsubscribePositions,
  buildMemberDisplayPositions,
} from '../positionTracking'

const positionRow = {
  id: 'p1',
  vehicle: 'v1',
  convoy: 'c1',
  lat: 10,
  lng: 20,
  speed: null,
  heading: null,
  accuracy: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  harness.reset()
  resetPositionThreshold()
  setPositionPublishingEnabled(true)
  vi.stubGlobal('navigator', { onLine: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('hasMovedSignificantly', () => {
  it('returns true on first call for a vehicle', () => {
    expect(hasMovedSignificantly(0, 0, 'v1')).toBe(true)
  })

  it('returns false if below threshold after publish', async () => {
    harness.mockFor('positions', 'select').mockResolvedValueOnce({ data: null, error: null })
    harness.mockFor('positions', 'upsert').mockResolvedValueOnce({ data: positionRow, error: null })
    await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 0, lng: 0 })
    expect(hasMovedSignificantly(0.00001, 0.00001, 'v1')).toBe(false)
  })
})

describe('publishPosition', () => {
  it('returns null if not moved significantly', async () => {
    harness.mockFor('positions', 'select').mockResolvedValue({ data: null, error: null })
    harness.mockFor('positions', 'upsert').mockResolvedValue({ data: positionRow, error: null })

    const first = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 0, lng: 0 })
    expect(first).not.toBeNull()

    const second = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 0, lng: 0 })
    expect(second).toBeNull()
  })

  it('creates new position when no existing record', async () => {
    harness.mockFor('positions', 'select').mockResolvedValueOnce({ data: null, error: null })
    const upsert = harness.mockFor('positions', 'upsert')
    upsert.mockResolvedValueOnce({ data: positionRow, error: null })

    const result = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 })
    expect(result).not.toBeNull()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0].payload).toMatchObject({
      vehicle: 'v1',
      convoy: 'c1',
      lat: 10,
      lng: 20,
    })
  })

  it('updates existing position record', async () => {
    harness
      .mockFor('positions', 'select')
      .mockResolvedValueOnce({ data: { id: 'p1' }, error: null })
    const update = harness.mockFor('positions', 'update')
    update.mockResolvedValueOnce({ data: positionRow, error: null })

    const result = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 })
    expect(result).not.toBeNull()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0].filters).toEqual({ id: 'p1' })
  })

  it('queues offline positions when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    mocks.mockQueuePendingPosition.mockResolvedValueOnce(undefined)
    const result = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 })
    expect(result).toBeNull()
    expect(mocks.mockQueuePendingPosition).toHaveBeenCalled()
  })
})

describe('position publishing gate', () => {
  it('blocks publishPosition when disabled', async () => {
    setPositionPublishingEnabled(false)
    const result = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 })
    expect(result).toBeNull()
    expect(harness.findOps('positions')).toHaveLength(0)
  })

  it('does not queue pending positions when disabled', async () => {
    setPositionPublishingEnabled(false)
    vi.stubGlobal('navigator', { onLine: false })
    const result = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 })
    expect(result).toBeNull()
    expect(mocks.mockQueuePendingPosition).not.toHaveBeenCalled()
  })

  it('returns 0 from flushPendingPositions when disabled', async () => {
    setPositionPublishingEnabled(false)
    mocks.mockGetPendingPositions.mockResolvedValueOnce([
      { id: 'p1', vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 },
    ])
    const count = await flushPendingPositions()
    expect(count).toBe(0)
    expect(mocks.mockGetPendingPositions).not.toHaveBeenCalled()
  })

  it('resumes publishing once re-enabled', async () => {
    setPositionPublishingEnabled(false)
    setPositionPublishingEnabled(true)
    harness.mockFor('positions', 'select').mockResolvedValueOnce({ data: null, error: null })
    harness.mockFor('positions', 'upsert').mockResolvedValueOnce({ data: positionRow, error: null })
    const result = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 })
    expect(result).not.toBeNull()
  })
})

describe('flushPendingPositions', () => {
  it('returns 0 when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const count = await flushPendingPositions()
    expect(count).toBe(0)
  })

  it('flushes pending positions', async () => {
    mocks.mockGetPendingPositions.mockResolvedValueOnce([
      { id: 'p1', vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 },
    ])
    harness.mockFor('positions', 'select').mockResolvedValueOnce({ data: null, error: null })
    mocks.mockRemovePendingPosition.mockResolvedValueOnce(undefined)
    const count = await flushPendingPositions()
    expect(count).toBe(1)
    expect(mocks.mockRemovePendingPosition).toHaveBeenCalledWith('p1')
  })
})

describe('subscribeToConvoyPositions', () => {
  it('subscribes and returns unsub function', async () => {
    const unsub = await subscribeToConvoyPositions('c1', vi.fn())
    expect(typeof unsub).toBe('function')
    expect(harness.channels).toHaveLength(1)
    expect(harness.channels[0].name).toBe('positions-c1')
    expect(harness.channels[0].handlers).toHaveLength(1)
  })

  it('calls onPosition when event arrives', async () => {
    const onPosition = vi.fn()
    await subscribeToConvoyPositions('c1', onPosition)
    const handler = harness.channels[0].handlers[0].handler
    handler({ eventType: 'INSERT', new: positionRow })
    expect(onPosition).toHaveBeenCalledTimes(1)
    expect(onPosition.mock.calls[0][0]).toMatchObject({ id: 'p1', lat: 10, lng: 20, convoy: 'c1' })
  })

  it('cleans up previous subscription', async () => {
    await subscribeToConvoyPositions('c1', vi.fn())
    await subscribeToConvoyPositions('c2', vi.fn())
    expect(harness.channels[0].removed).toBe(true)
  })
})

describe('getLatestPositions', () => {
  it('fetches positions list', async () => {
    harness
      .mockFor('positions', 'select')
      .mockResolvedValueOnce({ data: [positionRow], error: null })
    const result = await getLatestPositions('c1')
    expect(result).toHaveLength(1)
    expect(result[0].lat).toBe(10)
  })
})

describe('unsubscribePositions', () => {
  it('does nothing when no active subscription', () => {
    const result = unsubscribePositions()
    expect(result).toBeUndefined()
  })
})

describe('buildMemberDisplayPositions', () => {
  const gpsPosition = {
    id: 'p1',
    vehicle: 'v1',
    convoy: 'c1',
    lat: 12.34,
    lng: 56.78,
    speed: 42,
    heading: 90,
    accuracy: null,
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
  }

  const members = [
    {
      vehicleId: 'v1',
      position: gpsPosition,
      joinLat: 10,
      joinLng: 20,
    },
    {
      vehicleId: 'v2',
      position: null,
      joinLat: 30,
      joinLng: 40,
    },
    {
      vehicleId: 'v3',
      position: {
        ...gpsPosition,
        vehicle: 'v3',
        id: 'p3',
        lat: 1,
        lng: 2,
      },
      joinLat: undefined,
      joinLng: undefined,
    },
    {
      vehicleId: undefined,
      position: gpsPosition,
      joinLat: 50,
      joinLng: 60,
    },
  ]

  it('uses GPS position in real mode', () => {
    const result = buildMemberDisplayPositions(members, false)
    expect(result.get('v1')).toEqual({ lat: 12.34, lng: 56.78, heading: 90, speed: 42 })
  })

  it('skips members without a reported position in real mode', () => {
    const result = buildMemberDisplayPositions(members, false)
    expect(result.has('v2')).toBe(false)
  })

  it('uses join location in simulation mode', () => {
    const result = buildMemberDisplayPositions(members, true)
    expect(result.get('v1')).toEqual({ lat: 10, lng: 20, heading: null, speed: null })
  })

  it('skips members without join location in simulation mode', () => {
    const result = buildMemberDisplayPositions(members, true)
    expect(result.has('v3')).toBe(false)
  })

  it('skips members without a vehicleId', () => {
    const real = buildMemberDisplayPositions(members, false)
    const sim = buildMemberDisplayPositions(members, true)
    expect(real.has('undefined')).toBe(false)
    expect(sim.has('undefined')).toBe(false)
  })
})
