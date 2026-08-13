import { describe, it, expect, beforeEach, vi } from 'vitest'
import { harness } from './helpers/supabaseTest'
import { notifyChatMessage } from '../pushSender'

vi.mock('../supabaseClient', async () => {
  const { harness } = await import('./helpers/supabaseTest')
  return { default: harness.supabase }
})

vi.mock('../pushSender', () => ({
  notifyChatMessage: vi.fn(),
}))

import {
  sendTextMessage,
  getMessages,
  subscribeToMessages,
  unsubscribeMessages,
} from '../chatService'

const mockNotifyChatMessage = vi.mocked(notifyChatMessage)

beforeEach(() => {
  harness.reset()
  mockNotifyChatMessage.mockReset()
})

const messageRow = {
  id: 'msg-1',
  convoy: 'c1',
  sender: 'u1',
  type: 'text',
  content: 'hello',
  duration: null,
  location_lat: null,
  location_lng: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('chatService', () => {
  it('sendTextMessage creates a message', async () => {
    harness.mockFor('convoys', 'select').mockResolvedValueOnce({ data: { id: 'c1' }, error: null })
    const insert = harness.mockFor('messages', 'insert')
    insert.mockResolvedValueOnce({ data: messageRow, error: null })

    const result = await sendTextMessage('c1', 'u1', 'Alice', 'hello')
    expect(result.content).toBe('hello')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0].payload).toEqual({
      convoy: 'c1',
      sender: 'u1',
      type: 'text',
      content: 'hello',
    })
  })

  it('sendTextMessage resolves convoy by code if id lookup fails', async () => {
    harness
      .mockFor('convoys', 'select')
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'c1' }, error: null })
    const insert = harness.mockFor('messages', 'insert')
    insert.mockResolvedValueOnce({ data: { ...messageRow, convoy: 'c1' }, error: null })

    const result = await sendTextMessage('ABC123', 'u1', 'Alice', 'hello')
    expect(result.convoy).toBe('c1')
    expect(insert.mock.calls[0][0].payload.convoy).toBe('c1')
  })

  it('sendTextMessage returns original id when both lookups fail', async () => {
    harness.mockFor('convoys', 'select').mockResolvedValue({ data: null, error: null })
    const insert = harness.mockFor('messages', 'insert')
    insert.mockResolvedValueOnce({ data: { ...messageRow, convoy: 'raw-id' }, error: null })

    const result = await sendTextMessage('raw-id', 'u1', 'Alice', 'hello')
    expect(result.convoy).toBe('raw-id')
  })

  it('getMessages fetches and reverses messages', async () => {
    harness.mockFor('convoys', 'select').mockResolvedValueOnce({ data: { id: 'c1' }, error: null })
    harness.mockFor('messages', 'select').mockResolvedValueOnce({ data: [messageRow], error: null })
    harness
      .mockFor('profiles', 'select')
      .mockResolvedValueOnce({ data: { name: 'Alice' }, error: null })

    const result = await getMessages('c1')
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('hello')
    expect(result[0].senderName).toBe('Alice')
  })

  it('subscribeToMessages sets up subscription', async () => {
    harness.mockFor('convoys', 'select').mockResolvedValueOnce({ data: { id: 'c1' }, error: null })
    const unsub = await subscribeToMessages('c1', vi.fn())
    expect(typeof unsub).toBe('function')
    expect(harness.channels[0].name).toBe('messages-c1')
    expect(harness.channels[0].handlers).toHaveLength(1)
  })

  it('subscribeToMessages delivers message and notifies others', async () => {
    harness.mockFor('convoys', 'select').mockResolvedValueOnce({ data: { id: 'c1' }, error: null })
    harness
      .mockFor('profiles', 'select')
      .mockResolvedValueOnce({ data: { name: 'Bob' }, error: null })

    const onMessage = vi.fn()
    await subscribeToMessages('c1', onMessage, 'me')
    const handler = harness.channels[0].handlers[0].handler

    await handler({
      eventType: 'INSERT',
      new: { ...messageRow, sender: 'u2', content: 'Hi', created_at: '2024-01-01T00:00:00Z' },
    })

    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onMessage.mock.calls[0][0].senderName).toBe('Bob')
    expect(mockNotifyChatMessage).toHaveBeenCalledWith('c1', 'Bob', 'Hi')
  })

  it('does not notify own messages', async () => {
    harness.mockFor('convoys', 'select').mockResolvedValueOnce({ data: { id: 'c1' }, error: null })
    harness
      .mockFor('profiles', 'select')
      .mockResolvedValueOnce({ data: { name: 'Me' }, error: null })

    const onMessage = vi.fn()
    await subscribeToMessages('c1', onMessage, 'u2')
    const handler = harness.channels[0].handlers[0].handler

    await handler({
      eventType: 'INSERT',
      new: { ...messageRow, sender: 'u2', content: 'Hi' },
    })

    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(mockNotifyChatMessage).not.toHaveBeenCalled()
  })

  it('unsubscribeMessages removes the channel', async () => {
    harness.mockFor('convoys', 'select').mockResolvedValueOnce({ data: { id: 'c1' }, error: null })
    await subscribeToMessages('c1', vi.fn())
    unsubscribeMessages()
    expect(harness.channels[0].removed).toBe(true)
  })
})
