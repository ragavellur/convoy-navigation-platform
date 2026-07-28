import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  mockUnsubscribe: vi.fn(),
  notifyMemberJoined: vi.fn(),
  notifyMemberLeft: vi.fn(),
}))

vi.mock('../pocketbase', () => ({
  default: {
    collection: () => ({
      subscribe: mocks.mockSubscribe,
      unsubscribe: mocks.mockUnsubscribe,
    }),
  },
}))

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
})

describe('notifications', () => {
  it('subscribeToConvoyNotifications subscribes to convoy_members', async () => {
    mocks.mockSubscribe.mockResolvedValueOnce(vi.fn())
    const unsub = await subscribeToConvoyNotifications('c1', vi.fn())
    expect(mocks.mockSubscribe).toHaveBeenCalledWith('*', expect.any(Function))
    expect(typeof unsub).toBe('function')
  })

  it('invokes onNotification on create event', async () => {
    const onNotification = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(vi.fn())
    await subscribeToConvoyNotifications('c1', onNotification)
    const handler = mocks.mockSubscribe.mock.calls[0][1]
    handler({
      action: 'create',
      record: {
        convoy: 'c1',
        id: 'n1',
        user: 'u1',
        created: '2024-01-01',
        expand: { user: { name: 'Alice' } },
      },
    })
    expect(onNotification).toHaveBeenCalled()
    expect(mocks.notifyMemberJoined).toHaveBeenCalled()
  })

  it('invokes onNotification on delete event', async () => {
    const onNotification = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(vi.fn())
    await subscribeToConvoyNotifications('c1', onNotification)
    const handler = mocks.mockSubscribe.mock.calls[0][1]
    handler({
      action: 'delete',
      record: {
        convoy: 'c1',
        id: 'n1',
        user: 'u1',
        created: '2024-01-01',
        expand: { user: { name: 'Bob' } },
      },
    })
    expect(onNotification).toHaveBeenCalled()
    expect(mocks.notifyMemberLeft).toHaveBeenCalled()
  })

  it('skips notification when convoy does not match', async () => {
    const onNotification = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(vi.fn())
    await subscribeToConvoyNotifications('c1', onNotification)
    const handler = mocks.mockSubscribe.mock.calls[0][1]
    handler({
      action: 'create',
      record: { convoy: 'c2', id: 'n1', user: 'u1', created: '2024-01-01' },
    })
    expect(onNotification).not.toHaveBeenCalled()
  })

  it('uses fallback name when expand is missing', async () => {
    const onNotification = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(vi.fn())
    await subscribeToConvoyNotifications('c1', onNotification)
    const handler = mocks.mockSubscribe.mock.calls[0][1]
    handler({
      action: 'create',
      record: { convoy: 'c1', id: 'n1', user: 'u1', created: '' },
    })
    expect(onNotification).toHaveBeenCalled()
    expect(mocks.notifyMemberJoined).toHaveBeenCalled()
  })

  it('subscribeToConvoyStatus calls onStatusChange', async () => {
    const onStatusChange = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(vi.fn())
    await subscribeToConvoyStatus('c1', onStatusChange)
    const handler = mocks.mockSubscribe.mock.calls[0][1]
    handler({ record: { status: 'active' } })
    expect(onStatusChange).toHaveBeenCalledWith('active')
  })

  it('unsubscribeAll calls unsubscribe on collections', async () => {
    unsubscribeAll()
    expect(mocks.mockUnsubscribe).toHaveBeenCalledWith('*')
  })

  it('subscribeToConvoyNotifications cleans up previous subscription', async () => {
    const prevUnsub = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(prevUnsub)
    await subscribeToConvoyNotifications('c1', vi.fn())
    const onNotification = vi.fn()
    const nextUnsub = vi.fn()
    mocks.mockSubscribe.mockResolvedValueOnce(nextUnsub)
    await subscribeToConvoyNotifications('c1', onNotification)
    expect(prevUnsub).toHaveBeenCalled()
  })
})
