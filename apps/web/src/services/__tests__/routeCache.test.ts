import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockGetFullList: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock('pocketbase', () => ({
  default: function () {
    return {
      collection: () => ({
        getFullList: mocks.mockGetFullList,
        create: mocks.mockCreate,
        update: mocks.mockUpdate,
      }),
    }
  },
}))

import { getCachedRoute, cacheRoute } from '../routeCache'

beforeEach(() => {
  mocks.mockGetFullList.mockReset()
  mocks.mockCreate.mockReset()
  mocks.mockUpdate.mockReset()
})

describe('routeCache', () => {
  it('getCachedRoute returns null on cache miss', async () => {
    mocks.mockGetFullList.mockResolvedValueOnce([])
    const result = await getCachedRoute([12, 34], [56, 78])
    expect(result).toBeNull()
  })

  it('getCachedRoute returns null on error', async () => {
    mocks.mockGetFullList.mockRejectedValueOnce(new Error('DB error'))
    const result = await getCachedRoute([12, 34], [56, 78])
    expect(result).toBeNull()
  })

  it('cacheRoute creates new entry when no existing', async () => {
    mocks.mockGetFullList.mockResolvedValueOnce([])
    mocks.mockCreate.mockResolvedValueOnce({ id: 'r1' })
    await cacheRoute([12, 34], [56, 78], 50000, 1800, '{}', '[]')
    expect(mocks.mockCreate).toHaveBeenCalled()
  })

  it('cacheRoute updates existing entry', async () => {
    mocks.mockGetFullList.mockResolvedValueOnce([{ id: 'r1' }])
    mocks.mockUpdate.mockResolvedValueOnce({})
    await cacheRoute([12, 34], [56, 78], 50000, 1800, '{}', '[]')
    expect(mocks.mockUpdate).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ distance: 50000 }),
    )
  })

  it('cacheRoute handles errors silently', async () => {
    mocks.mockGetFullList.mockRejectedValueOnce(new Error('DB error'))
    await expect(cacheRoute([12, 34], [56, 78], 50000, 1800, '{}', '[]')).resolves.not.toThrow()
  })

  it('getCachedRoute returns null for expired cache', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    mocks.mockGetFullList.mockResolvedValueOnce([{ id: 'r1', created: oldDate }])
    const result = await getCachedRoute([12, 34], [56, 78])
    expect(result).toBeNull()
  })
})
