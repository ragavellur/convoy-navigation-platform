import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.hoisted(() => {
  process.env.VITE_VAPID_PUBLIC_KEY = 'test-key'
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
const mockGetFullList = vi.fn()
const mockCreate = vi.fn()
const mockDelete = vi.fn()

vi.mock('../pocketbase', () => ({
  default: {
    authStore: { record: { id: 'user-1' } },
    collection: () => ({
      getFullList: mockGetFullList,
      create: mockCreate,
      delete: mockDelete,
    }),
  },
}))

globalThis.atob = vi.fn((s: string) => s)

import {
  isPushSupported,
  getPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  getPermissionState,
} from '../pushNotifications'

beforeEach(() => {
  mockGetSubscription.mockReset()
  mockSubscribe.mockReset()
  mockUnsubscribe.mockReset()
  mockGetFullList.mockReset()
  mockCreate.mockReset()
  mockDelete.mockReset()
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
  })

  it('unsubscribeFromPush unsubscribes and removes', async () => {
    const sub = { unsubscribe: mockUnsubscribe }
    mockGetSubscription.mockResolvedValueOnce(sub)
    mockGetFullList.mockResolvedValueOnce([{ id: 'sub-1' }])
    mockDelete.mockResolvedValueOnce({})
    const result = await unsubscribeFromPush()
    expect(result).toBe(true)
    expect(mockUnsubscribe).toHaveBeenCalled()
    expect(mockDelete).toHaveBeenCalledWith('sub-1')
  })

  it('unsubscribeFromPush returns false when no subscription', async () => {
    mockGetSubscription.mockResolvedValueOnce(null)
    const result = await unsubscribeFromPush()
    expect(result).toBe(false)
  })

  it('getPermissionState returns current permission', () => {
    expect(getPermissionState()).toBe('granted')
  })

  it('subscribeToPush creates new subscription when none exists', async () => {
    mockGetSubscription.mockResolvedValueOnce(null)
    mockSubscribe.mockResolvedValueOnce(mockSubscriptionObj)
    mockGetFullList.mockResolvedValueOnce([])
    mockCreate.mockResolvedValueOnce({ id: 'sub-1' })
    const result = await subscribeToPush()
    expect(result).not.toBeNull()
    expect(mockSubscribe).toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalled()
  })

  it('unsubscribeFromPush does nothing when getFullList fails', async () => {
    const sub = { unsubscribe: mockUnsubscribe }
    mockGetSubscription.mockResolvedValueOnce(sub)
    mockGetFullList.mockRejectedValueOnce(new Error('DB error'))
    const result = await unsubscribeFromPush()
    expect(result).toBe(true)
  })
})
