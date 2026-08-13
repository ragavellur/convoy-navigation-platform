import { describe, it, expect, beforeEach, vi } from 'vitest'
import { harness } from './helpers/supabaseTest'

vi.mock('../supabaseClient', async () => {
  const { harness } = await import('./helpers/supabaseTest')
  return { default: harness.supabase }
})

import {
  getSimulationStatus,
  startSimulation,
  simulationTick,
  stopSimulation,
  restartSimulation,
  clearSimulationPositions,
  getSimulationLogs,
  cleanupPositions,
} from '../simulation'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  harness.reset()
  harness.auth.session = { access_token: 'tok-123' }
})

describe('getSimulationStatus', () => {
  it('returns status on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ running: true, convoyId: 'c1' }),
    })
    const result = await getSimulationStatus('c1')
    expect(result.running).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/simulation/status/c1'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
      }),
    )
  })

  it('throws on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    await expect(getSimulationStatus('c1')).rejects.toThrow('Failed to get simulation status')
  })
})

describe('simulationTick', () => {
  it('ticks the simulation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, running: true, phase: 'assembling', positions: [] }),
    })
    const result = await simulationTick('c1')
    expect(result.running).toBe(true)
    expect(result.phase).toBe('assembling')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/simulation/tick')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok-123')
    expect(JSON.parse(init.body)).toEqual({ convoyId: 'c1' })
  })

  it('throws with server error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Not a member' }),
    })
    await expect(simulationTick('c1')).rejects.toThrow('Not a member')
  })
})

describe('startSimulation', () => {
  it('starts simulation with default params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, pid: 123 }),
    })
    const result = await startSimulation('c1')
    expect(result.success).toBe(true)
    expect(result.pid).toBe(123)
  })

  it('throws with server error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Already running' }),
    })
    await expect(startSimulation('c1')).rejects.toThrow('Already running')
  })

  it('throws with unknown error when json parse fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('parse error')),
    })
    await expect(startSimulation('c1')).rejects.toThrow('Unknown error')
  })
})

describe('stopSimulation', () => {
  it('stops simulation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })
    const result = await stopSimulation('c1')
    expect(result.success).toBe(true)
  })
})

describe('restartSimulation', () => {
  it('restarts simulation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, clearedPositions: 10 }),
    })
    const result = await restartSimulation('c1')
    expect(result.success).toBe(true)
    expect(result.clearedPositions).toBe(10)
  })

  it('throws on error with custom error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Simulation not found' }),
    })
    await expect(restartSimulation('c1')).rejects.toThrow('Simulation not found')
  })

  it('throws on error with fallback message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('parse error')),
    })
    await expect(restartSimulation('c1')).rejects.toThrow('Unknown error')
  })
})

describe('clearSimulationPositions', () => {
  it('clears positions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, deleted: 5 }),
    })
    const result = await clearSimulationPositions('c1')
    expect(result.success).toBe(true)
    expect(result.deleted).toBe(5)
  })
})

describe('getSimulationLogs', () => {
  it('returns logs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ logs: [{ type: 'info', line: 'started', time: 't1' }] }),
    })
    const result = await getSimulationLogs('c1')
    expect(result.logs).toHaveLength(1)
  })
})

describe('cleanupPositions', () => {
  it('cleans up positions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, deleted: 3, kept: 10 }),
    })
    const result = await cleanupPositions('c1')
    expect(result.success).toBe(true)
    expect(result.deleted).toBe(3)
  })
})
