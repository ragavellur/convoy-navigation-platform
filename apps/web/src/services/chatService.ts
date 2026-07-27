import pb from './pocketbase'

export interface ChatMessage {
  id: string
  convoy: string
  sender: string
  senderName: string
  type: 'text' | 'voice' | 'system'
  content: string
  duration?: number
  location_lat?: number
  location_lng?: number
  created: string
  updated: string
}

let chatUnsub: (() => void) | null = null

export async function sendTextMessage(
  convoyId: string,
  senderId: string,
  senderName: string,
  content: string,
): Promise<ChatMessage> {
  return pb.collection('messages').create({
    convoy: convoyId,
    sender: senderId,
    sender_name: senderName,
    type: 'text',
    content,
  })
}

export async function getMessages(convoyId: string, limit = 50): Promise<ChatMessage[]> {
  const records = await pb.collection('messages').getFullList<ChatMessage>({
    filter: `convoy = "${convoyId}"`,
    sort: '-created',
    limit,
  })
  return records.reverse()
}

export async function subscribeToMessages(
  convoyId: string,
  onMessage: (message: ChatMessage) => void,
): Promise<() => void> {
  chatUnsub?.()

  const unsub = await pb.collection('messages').subscribe('*', (event) => {
    if (event.record.convoy !== convoyId) return
    if (event.action === 'create') {
      onMessage(event.record as unknown as ChatMessage)
    }
  })

  chatUnsub = () => {
    unsub()
    chatUnsub = null
  }

  return chatUnsub
}

export async function sendTypingIndicator(
  _convoyId: string,
  _userId: string,
  _userName: string,
): Promise<void> {
  // Typing indicators via PocketBase realtime broadcast
  // Implemented via custom PocketBase hook or Redis pub/sub
}

export function unsubscribeMessages(): void {
  chatUnsub?.()
}
