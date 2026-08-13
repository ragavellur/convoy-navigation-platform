import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { harness } from './helpers/supabaseTest'

vi.hoisted(() => {
  process.env.VITE_VAPID_PUBLIC_KEY = 'test-key'
})

vi.mock('../supabaseClient', async () => {
  const { harness } = await import('./helpers/supabaseTest')
  return { default: harness.supabase }
})

const mockUnsubscribe = vi.fn()
const mockSubscriptionObj = {
  endpoint: 'https://example.com',
  toJSON: () => ({ endpoint: 'https://example.com', keys: { p256dh: 'key1', auth: 'auth1' } }),
  unsubscribe: mockUnsubscribe,
}
const mockGetSubscription = vi.fn()
const mockSubscribe = vi.fn().mockResolvedValue(mockSubscriptionObj)
const mockReady = Promise.resolve({
  pushManager: {
    getSubscription: mockGetSubscription,
    subscribe: mockSubscribe,
  },
})

globalThis.atob = vi.fn((s: string) => s)

import {
  isPushSupported,
  getPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  getPermissionState,
} from '../pushNotifications'

beforeEach(() => {
  harness.reset()
  harness.auth.user = { id: 'user-1' }
  mockGetSubscription.mockReset()
  mockSubscribe.mockReset()
  mockUnsubscribe.mockReset()
  vi.stubGlobal('navigator', {
    serviceWorker: { ready: mockReady },
  })
  vi.stubGlobal('Notification', {
    permission: 'granted',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  })
  vi.stubGlobal('PushManager', {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pushNotifications', () => {
  it('isPushSupported returns true when push is available', async () => {
    vi.stubGlobal('window', { PushManager: {} })
    mockGetSubscription.mockResolvedValueOnce({ endpoint: 'https://example.com' })
    const result = await isPushSupported()
    expect(result).toBe(true)
  })

  it('isPushSupported returns false when no serviceWorker', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', { PushManager: {} })
    const result = await isPushSupported()
    expect(result).toBe(false)
  })

  it('getPushSubscription returns current subscription', async () => {
    mockGetSubscription.mockResolvedValueOnce({ endpoint: 'https://example.com' })
    const result = await getPushSubscription()
    expect(result).not.toBeNull()
  })

  it('subscribeToPush returns existing subscription', async () => {
    mockGetSubscription.mockResolvedValueOnce(mockSubscriptionObj)
    const result = await subscribeToPush()
    expect(result).not.toBeNull()
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('subscribeToPush creates new subscription when none exists', async () => {
    mockGetSubscription.mockResolvedValueOnce(null)
    mockSubscribe.mockResolvedValueOnce(mockSubscriptionObj)
    harness
      .mockFor('push_subscriptions', 'select')
      .mockResolvedValueOnce({ data: null, error: null })
    const insert = harness.mockFor('push_subscriptions', 'insert')

    const result = await subscribeToPush()
    expect(result).not.toBeNull()
    expect(mockSubscribe).toHaveBeenCalled()
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0].payload).toMatchObject({
      user: 'user-1',
      endpoint: 'https://example.com',
      p256dh: 'key1',
      auth: 'auth1',
    })
  })

  it('subscribeToPush skips saving an existing subscription', async () => {
    mockGetSubscription.mockResolvedValueOnce(null)
    mockSubscribe.mockResolvedValueOnce(mockSubscriptionObj)
    harness
      .mockFor('push_subscriptions', 'select')
      .mockResolvedValueOnce({ data: { id: 'sub-1' }, error: null })
    const insert = harness.mockFor('push_subscriptions', 'insert')

    const result = await subscribeToPush()
    expect(result).not.toBeNull()
    expect(insert).not.toHaveBeenCalled()
  })

  it('unsubscribeFromPush unsubscribes and removes', async () => {
    const sub = { unsubscribe: mockUnsubscribe }
    mockGetSubscription.mockResolvedValueOnce(sub)
    const remove = harness.mockFor('push_subscriptions', 'delete')

    const result = await unsubscribeFromPush()
    expect(result).toBe(true)
    expect(mockUnsubscribe).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls[0][0].filters).toEqual({ user: 'user-1' })
  })

  it('unsubscribeFromPush returns false when no subscription', async () => {
    mockGetSubscription.mockResolvedValueOnce(null)
    const result = await unsubscribeFromPush()
    expect(result).toBe(false)
  })

  it('unsubscribeFromPush still returns true when removal fails', async () => {
    const sub = { unsubscribe: mockUnsubscribe }
    mockGetSubscription.mockResolvedValueOnce(sub)
    harness.mockFor('push_subscriptions', 'delete').mockRejectedValueOnce(new Error('DB error'))

    const result = await unsubscribeFromPush()
    expect(result).toBe(true)
  })

  it('getPermissionState returns current permission', () => {
    expect(getPermissionState()).toBe('granted')
  })
})
