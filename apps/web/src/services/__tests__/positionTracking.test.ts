import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockGetFirstListItem: vi.fn(),
  mockUpdate: vi.fn(),
  mockCreate: vi.fn(),
  mockSubscribe: vi.fn(),
  mockGetList: vi.fn(),
  mockQueuePendingPosition: vi.fn(),
  mockGetPendingPositions: vi.fn(),
  mockRemovePendingPosition: vi.fn(),
}))

vi.mock('../pocketbase', () => ({
  default: {
    collection: () => ({
      getFirstListItem: mocks.mockGetFirstListItem,
      update: mocks.mockUpdate,
      create: mocks.mockCreate,
      subscribe: mocks.mockSubscribe,
      getList: mocks.mockGetList,
    }),
  },
}))

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
  unsubscribePositions,
} from '../positionTracking'

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  resetPositionThreshold()
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
    mocks.mockGetFirstListItem.mockRejectedValueOnce(new Error('Not found'))
    mocks.mockCreate.mockResolvedValueOnce({ id: 'p1' })
    await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 0, lng: 0 })
    expect(hasMovedSignificantly(0.00001, 0.00001, 'v1')).toBe(false)
  })
})

describe('publishPosition', () => {
  it('returns null if not moved significantly', async () => {
    await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 0, lng: 0 })
    const result = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 0, lng: 0 })
    expect(result).toBeNull()
  })

  it('creates new position when no existing record', async () => {
    mocks.mockGetFirstListItem.mockRejectedValueOnce(new Error('Not found'))
    mocks.mockCreate.mockResolvedValueOnce({ id: 'p1', lat: 10, lng: 20 })
    const result = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 })
    expect(result).not.toBeNull()
    expect(mocks.mockCreate).toHaveBeenCalled()
  })

  it('updates existing position record', async () => {
    mocks.mockGetFirstListItem.mockResolvedValueOnce({ id: 'p1' })
    mocks.mockUpdate.mockResolvedValueOnce({ id: 'p1', lat: 10, lng: 20 })
    const result = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 })
    expect(result).not.toBeNull()
    expect(mocks.mockUpdate).toHaveBeenCalled()
  })

  it('queues offline positions when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    mocks.mockQueuePendingPosition.mockResolvedValueOnce(undefined)
    const result = await publishPosition({ vehicleId: 'v1', convoyId: 'c1', lat: 10, lng: 20 })
    expect(result).toBeNull()
    expect(mocks.mockQueuePendingPosition).toHaveBeenCalled()
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
    mocks.mockGetFirstListItem.mockRejectedValueOnce(new Error('Not found'))
    mocks.mockCreate.mockResolvedValueOnce({})
    mocks.mockRemovePendingPosition.mockResolvedValueOnce(undefined)
    const count = await flushPendingPositions()
    expect(count).toBe(1)
  })
})

describe('subscribeToConvoyPositions', () => {
  it('subscribes and returns unsub function', async () => {
    mocks.mockSubscribe.mockResolvedValueOnce(vi.fn())
    const unsub = await subscribeToConvoyPositions('c1', vi.fn())
    expect(mocks.mockSubscribe).toHaveBeenCalledWith('*', expect.any(Function))
    expect(typeof unsub).toBe('function')
  })

  it('calls onPosition when event matches convoy', async () => {
    const rawUnsub = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(rawUnsub)
    const onPosition = vi.fn()
    await subscribeToConvoyPositions('c1', onPosition)
    const handler = mocks.mockSubscribe.mock.calls[0][1]
    handler({ record: { convoy: 'c1', lat: 10, lng: 20 } })
    expect(onPosition).toHaveBeenCalled()
  })

  it('skips onPosition when convoy does not match', async () => {
    const rawUnsub = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(rawUnsub)
    const onPosition = vi.fn()
    await subscribeToConvoyPositions('c1', onPosition)
    const handler = mocks.mockSubscribe.mock.calls[0][1]
    handler({ record: { convoy: 'c2', lat: 10, lng: 20 } })
    expect(onPosition).not.toHaveBeenCalled()
  })

  it('cleans up previous subscription', async () => {
    const firstUnsub = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(firstUnsub)
    await subscribeToConvoyPositions('c1', vi.fn())
    const secondUnsub = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(secondUnsub)
    await subscribeToConvoyPositions('c2', vi.fn())
    expect(firstUnsub).toHaveBeenCalled()
  })
})

describe('getLatestPositions', () => {
  it('fetches positions list', async () => {
    mocks.mockGetList.mockResolvedValueOnce({ items: [{ id: 'p1', lat: 10 }] })
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
