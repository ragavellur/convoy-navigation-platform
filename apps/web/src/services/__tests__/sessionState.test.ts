import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

const mockUpdate = vi.fn()
const mockGetFullList = vi.fn()

vi.mock('../pocketbase', () => ({
  default: {
    collection: () => ({
      update: mockUpdate,
      getFullList: mockGetFullList,
    }),
  },
}))

import {
  endConvoy,
  pauseConvoy,
  resumeConvoy,
  markMemberInactive,
  cleanupStaleConvoys,
  startSessionCleanup,
  stopSessionCleanup,
  transitionPhase,
} from '../sessionState'

beforeEach(() => {
  mockUpdate.mockReset()
  mockGetFullList.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  stopSessionCleanup()
})

describe('sessionState', () => {
  it('pauseConvoy updates status to paused', async () => {
    mockUpdate.mockResolvedValueOnce({})
    await pauseConvoy('c1')
    expect(mockUpdate).toHaveBeenCalledWith('c1', { status: 'paused' })
  })

  it('resumeConvoy updates status to active', async () => {
    mockUpdate.mockResolvedValueOnce({})
    await resumeConvoy('c1')
    expect(mockUpdate).toHaveBeenCalledWith('c1', { status: 'active' })
  })

  it('endConvoy updates convoy and its members', async () => {
    mockUpdate.mockResolvedValueOnce({})
    mockGetFullList.mockResolvedValueOnce([{ id: 'm1' }, { id: 'm2' }])
    mockUpdate.mockResolvedValue({})
    await endConvoy('c1')
    expect(mockUpdate).toHaveBeenCalledWith('c1', { status: 'ended', phase: 'completed' })
    expect(mockGetFullList).toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith('m1', { status: 'inactive' })
    expect(mockUpdate).toHaveBeenCalledWith('m2', { status: 'inactive' })
  })

  it('markMemberInactive updates member', async () => {
    mockUpdate.mockResolvedValueOnce({})
    await markMemberInactive('m1')
    expect(mockUpdate).toHaveBeenCalledWith('m1', { status: 'inactive' })
  })

  it('transitionPhase updates phase and resets assembled_members for assembling', async () => {
    mockUpdate.mockResolvedValueOnce({})
    await transitionPhase('c1', 'assembling')
    expect(mockUpdate).toHaveBeenCalledWith('c1', { phase: 'assembling', assembled_members: [] })
    mockUpdate.mockResolvedValueOnce({})
    await transitionPhase('c1', 'in_transit')
    expect(mockUpdate).toHaveBeenCalledWith('c1', { phase: 'in_transit' })
  })

  it('cleanupStaleConvoys finds and ends stale convoys', async () => {
    mockGetFullList.mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([])
    mockUpdate.mockResolvedValue({})
    const count = await cleanupStaleConvoys()
    expect(count).toBe(1)
  })

  it('startSessionCleanup sets up interval', async () => {
    vi.useFakeTimers()
    mockGetFullList.mockResolvedValue([])
    startSessionCleanup()
    expect(mockGetFullList).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60000)
    expect(mockGetFullList).toHaveBeenCalled()
  })

  it('stopSessionCleanup clears interval', async () => {
    vi.useFakeTimers()
    startSessionCleanup()
    stopSessionCleanup()
    vi.advanceTimersByTime(60000)
    expect(mockGetFullList).not.toHaveBeenCalled()
  })
})
