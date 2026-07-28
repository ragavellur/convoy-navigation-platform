import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  notifyMemberJoined,
  notifyMemberLeft,
  notifyConvoyEnded,
  notifyOffRoute,
  notifyChatMessage,
  notifySimulationStarted,
  notifySimulationStopped,
} from '../pushSender'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

vi.mock('../pocketbase', () => ({
  default: {
    authStore: { isValid: true },
  },
}))

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('window', { location: { origin: 'https://convoy.test' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function expectPushCall(fn: () => Promise<void>, expectedTitleSubstring: string) {
  mockFetch.mockResolvedValueOnce({ ok: true })
  await fn()
  expect(mockFetch).toHaveBeenCalledTimes(1)
  const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
  expect(callBody.title).toContain(expectedTitleSubstring)
}

describe('pushSender', () => {
  it('notifyMemberJoined', async () => {
    await expectPushCall(() => notifyMemberJoined('c1', 'Alice'), 'Member Joined')
  })

  it('notifyMemberLeft', async () => {
    await expectPushCall(() => notifyMemberLeft('c1', 'Bob'), 'Member Left')
  })

  it('notifyConvoyEnded', async () => {
    await expectPushCall(() => notifyConvoyEnded('c1'), 'Convoy Ended')
  })

  it('notifyOffRoute', async () => {
    await expectPushCall(() => notifyOffRoute('c1', 'Charlie'), 'Off Route')
  })

  it('notifyChatMessage', async () => {
    await expectPushCall(() => notifyChatMessage('c1', 'Dave', 'Hello!'), 'Message from Dave')
  })

  it('notifyChatMessage truncates long messages', async () => {
    const longMsg = 'x'.repeat(100)
    mockFetch.mockResolvedValueOnce({ ok: true })
    await notifyChatMessage('c1', 'Dave', longMsg)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.body.length).toBe(83)
    expect(body.body.endsWith('...')).toBe(true)
  })

  it('notifySimulationStarted', async () => {
    await expectPushCall(() => notifySimulationStarted('c1'), 'Simulation Started')
  })

  it('notifySimulationStopped', async () => {
    await expectPushCall(() => notifySimulationStopped('c1'), 'Simulation Stopped')
  })

  it('handles fetch failure gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    await expect(notifyConvoyEnded('c1')).resolves.not.toThrow()
  })
})
