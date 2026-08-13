import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { harness } from './helpers/supabaseTest'

vi.mock('../supabaseClient', async () => {
  const { harness } = await import('./helpers/supabaseTest')
  return { default: harness.supabase }
})

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
  harness.reset()
})

afterEach(() => {
  vi.useRealTimers()
  stopSessionCleanup()
})

describe('sessionState', () => {
  it('pauseConvoy updates status to paused', async () => {
    await pauseConvoy('c1')
    expect(harness.lastPayload('convoys', 'update')).toEqual({ status: 'paused' })
    expect(harness.findOps('convoys', 'update')[0].filters).toEqual({ id: 'c1' })
  })

  it('resumeConvoy updates status to active', async () => {
    await resumeConvoy('c1')
    expect(harness.lastPayload('convoys', 'update')).toEqual({ status: 'active' })
  })

  it('endConvoy updates convoy and its members', async () => {
    harness
      .mockFor('convoy_members', 'select')
      .mockResolvedValueOnce({ data: [{ id: 'm1' }, { id: 'm2' }], error: null })
    await endConvoy('c1')
    expect(harness.lastPayload('convoys', 'update')).toEqual({
      status: 'ended',
      phase: 'completed',
    })
    const memberUpdates = harness.findOps('convoy_members', 'update')
    expect(memberUpdates).toHaveLength(2)
    expect(memberUpdates[0]).toMatchObject({
      payload: { status: 'inactive' },
      filters: { id: 'm1' },
    })
    expect(memberUpdates[1]).toMatchObject({
      payload: { status: 'inactive' },
      filters: { id: 'm2' },
    })
  })

  it('markMemberInactive updates member', async () => {
    await markMemberInactive('m1')
    expect(harness.lastPayload('convoy_members', 'update')).toEqual({ status: 'inactive' })
    expect(harness.findOps('convoy_members', 'update')[0].filters).toEqual({ id: 'm1' })
  })

  it('transitionPhase updates phase and resets assembled_members for assembling', async () => {
    await transitionPhase('c1', 'assembling')
    expect(harness.lastPayload('convoys', 'update')).toEqual({
      phase: 'assembling',
      assembled_members: [],
    })

    await transitionPhase('c1', 'in_transit')
    expect(harness.lastPayload('convoys', 'update')).toEqual({ phase: 'in_transit' })
  })

  it('cleanupStaleConvoys finds and ends stale convoys', async () => {
    harness
      .mockFor('convoys', 'select')
      .mockResolvedValueOnce({ data: [{ id: 'c1' }], error: null })
    harness.mockFor('convoy_members', 'select').mockResolvedValueOnce({ data: [], error: null })
    const count = await cleanupStaleConvoys()
    expect(count).toBe(1)
    expect(harness.lastPayload('convoys', 'update')).toEqual({
      status: 'ended',
      phase: 'completed',
    })
  })

  it('startSessionCleanup sets up interval', async () => {
    vi.useFakeTimers()
    harness.mockFor('convoys', 'select').mockResolvedValue({ data: [], error: null })
    startSessionCleanup()
    expect(harness.findOps('convoys', 'select')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(60000)
    expect(harness.findOps('convoys', 'select').length).toBeGreaterThan(0)
  })

  it('stopSessionCleanup clears interval', async () => {
    vi.useFakeTimers()
    startSessionCleanup()
    stopSessionCleanup()
    await vi.advanceTimersByTimeAsync(60000)
    expect(harness.findOps('convoys', 'select')).toHaveLength(0)
  })
})
