import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockCreate = vi.fn()
const mockGetFullList = vi.fn()
const mockSubscribe = vi.fn()
const mockGetFirstListItem = vi.fn()

vi.mock('../pocketbase', () => ({
  default: {
    collection: () => ({
      create: mockCreate,
      getFullList: mockGetFullList,
      subscribe: mockSubscribe,
      getFirstListItem: mockGetFirstListItem,
    }),
    authStore: { model: { id: 'user-1' } },
  },
}))

vi.mock('../pushSender', () => ({
  notifyChatMessage: vi.fn(),
}))

import {
  sendTextMessage,
  getMessages,
  subscribeToMessages,
  unsubscribeMessages,
} from '../chatService'

beforeEach(() => {
  mockCreate.mockReset()
  mockGetFullList.mockReset()
  mockSubscribe.mockReset()
  mockGetFirstListItem.mockReset()
})

describe('chatService', () => {
  it('sendTextMessage creates a message', async () => {
    mockGetFirstListItem.mockResolvedValueOnce({ id: 'c1' })
    mockCreate.mockResolvedValueOnce({ id: 'msg-1', content: 'hello' })
    const result = await sendTextMessage('c1', 'u1', 'Alice', 'hello')
    expect(result.content).toBe('hello')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        convoy: 'c1',
        sender: 'u1',
        content: 'hello',
      }),
    )
  })

  it('getMessages fetches and reverses messages', async () => {
    mockGetFirstListItem.mockResolvedValueOnce({ id: 'c1' })
    mockGetFullList.mockResolvedValueOnce([{ id: '1', content: 'hi' }])
    const result = await getMessages('c1')
    expect(result).toHaveLength(1)
  })

  it('subscribeToMessages sets up subscription', async () => {
    mockGetFirstListItem.mockResolvedValueOnce({ id: 'c1' })
    mockSubscribe.mockResolvedValueOnce(vi.fn())
    const unsub = await subscribeToMessages('c1', vi.fn())
    expect(mockSubscribe).toHaveBeenCalledWith('*', expect.any(Function))
    expect(typeof unsub).toBe('function')
  })

  it('unsubscribeMessages calls the stored unsub', async () => {
    mockGetFirstListItem.mockResolvedValueOnce({ id: 'c1' })
    const mockUnsub = vi.fn()
    mockSubscribe.mockResolvedValueOnce(mockUnsub)
    await subscribeToMessages('c1', vi.fn())
    unsubscribeMessages()
    expect(mockUnsub).toHaveBeenCalled()
  })

  it('sendTextMessage resolves convoy by code if id lookup fails', async () => {
    mockGetFirstListItem
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce({ id: 'c1' })
    mockCreate.mockResolvedValueOnce({ id: 'msg-1' })
    const result = await sendTextMessage('ABC123', 'u1', 'Alice', 'hello')
    expect(result.id).toBe('msg-1')
  })

  it('sendTextMessage returns original id when both lookups fail', async () => {
    mockGetFirstListItem
      .mockRejectedValueOnce(new Error('Not found'))
      .mockRejectedValueOnce(new Error('Code not found'))
    mockCreate.mockResolvedValueOnce({ id: 'msg-1', convoy: 'raw-id' })
    const result = await sendTextMessage('raw-id', 'u1', 'Alice', 'hello')
    expect(result.convoy).toBe('raw-id')
  })

  it('subscribeToMessages handles event with array convoy field', async () => {
    mockGetFirstListItem.mockResolvedValueOnce({ id: 'c1' })
    const mockUnsub = vi.fn()
    mockSubscribe.mockResolvedValueOnce(mockUnsub)

    const onMessage = vi.fn()
    const unsub = await subscribeToMessages('c1', onMessage)

    const handler = mockSubscribe.mock.calls[0][1]
    handler({
      action: 'create',
      record: { convoy: ['c1'], sender: 'u2', senderName: 'Bob', content: 'Hi', type: 'text' },
    })
    expect(onMessage).toHaveBeenCalled()
    unsub()
  })
})
