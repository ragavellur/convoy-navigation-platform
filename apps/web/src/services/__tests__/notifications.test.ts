import { describe, it, expect, beforeEach, vi } from 'vitest'
import { harness } from './helpers/supabaseTest'

const mocks = vi.hoisted(() => ({
  notifyMemberJoined: vi.fn(),
  notifyMemberLeft: vi.fn(),
}))

vi.mock('../supabaseClient', async () => {
  const { harness } = await import('./helpers/supabaseTest')
  return { default: harness.supabase }
})

vi.mock('../pushSender', () => ({
  notifyMemberJoined: mocks.notifyMemberJoined,
  notifyMemberLeft: mocks.notifyMemberLeft,
}))

import {
  subscribeToConvoyNotifications,
  subscribeToConvoyStatus,
  unsubscribeAll,
} from '../notifications'

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  harness.reset()
})

describe('notifications', () => {
  it('subscribeToConvoyNotifications subscribes to convoy_members', async () => {
    const unsub = await subscribeToConvoyNotifications('c1', vi.fn())
    expect(typeof unsub).toBe('function')
    expect(harness.channels).toHaveLength(1)
    expect(harness.channels[0].name).toBe('convoy-members-c1')
    expect(harness.channels[0].handlers).toHaveLength(1)
  })

  it('invokes onNotification and notifies member joined on INSERT', async () => {
    harness
      .mockFor('profiles', 'select')
      .mockResolvedValueOnce({ data: { name: 'Alice' }, error: null })
    const onNotification = vi.fn()
    await subscribeToConvoyNotifications('c1', onNotification)
    const handler = harness.channels[0].handlers[0].handler

    await handler({
      eventType: 'INSERT',
      new: { id: 'n1', convoy: 'c1', user: 'u1', created_at: '2024-01-01T00:00:00Z' },
    })

    expect(onNotification).toHaveBeenCalledTimes(1)
    expect(onNotification.mock.calls[0][0].type).toBe('member_joined')
    expect(mocks.notifyMemberJoined).toHaveBeenCalledWith('c1', 'Alice')
  })

  it('invokes onNotification and notifies member left on DELETE', async () => {
    harness
      .mockFor('profiles', 'select')
      .mockResolvedValueOnce({ data: { name: 'Bob' }, error: null })
    const onNotification = vi.fn()
    await subscribeToConvoyNotifications('c1', onNotification)
    const handler = harness.channels[0].handlers[0].handler

    await handler({
      eventType: 'DELETE',
      old: { id: 'n1', convoy: 'c1', user: 'u1', created_at: '2024-01-01T00:00:00Z' },
    })

    expect(onNotification).toHaveBeenCalledTimes(1)
    expect(onNotification.mock.calls[0][0].type).toBe('member_left')
    expect(mocks.notifyMemberLeft).toHaveBeenCalledWith('c1', 'Bob')
  })

  it('ignores UPDATE events', async () => {
    const onNotification = vi.fn()
    await subscribeToConvoyNotifications('c1', onNotification)
    const handler = harness.channels[0].handlers[0].handler

    await handler({ eventType: 'UPDATE', new: { id: 'n1', convoy: 'c1', user: 'u1' } })

    expect(onNotification).not.toHaveBeenCalled()
    expect(mocks.notifyMemberJoined).not.toHaveBeenCalled()
    expect(mocks.notifyMemberLeft).not.toHaveBeenCalled()
  })

  it('uses fallback name when profile is missing', async () => {
    harness.mockFor('profiles', 'select').mockResolvedValueOnce({ data: null, error: null })
    const onNotification = vi.fn()
    await subscribeToConvoyNotifications('c1', onNotification)
    const handler = harness.channels[0].handlers[0].handler

    await handler({
      eventType: 'INSERT',
      new: { id: 'n1', convoy: 'c1', user: 'u1', created_at: '2024-01-01T00:00:00Z' },
    })

    expect(onNotification).toHaveBeenCalled()
    expect(mocks.notifyMemberJoined).toHaveBeenCalledWith('c1', 'A member')
  })

  it('subscribeToConvoyStatus calls onStatusChange', async () => {
    const onStatusChange = vi.fn()
    await subscribeToConvoyStatus('c1', onStatusChange)
    expect(harness.channels[0].name).toBe('convoys-c1')
    const handler = harness.channels[0].handlers[0].handler
    handler({ eventType: 'UPDATE', new: { status: 'active' } })
    expect(onStatusChange).toHaveBeenCalledWith('active')
  })

  it('unsubscribeAll removes all channels', async () => {
    await subscribeToConvoyNotifications('c1', vi.fn())
    unsubscribeAll()
    expect(harness.channels[0].removed).toBe(true)
  })

  it('subscribeToConvoyNotifications cleans up previous subscription', async () => {
    await subscribeToConvoyNotifications('c1', vi.fn())
    await subscribeToConvoyNotifications('c1', vi.fn())
    expect(harness.channels[0].removed).toBe(true)
  })
})
