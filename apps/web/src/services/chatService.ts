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

async function resolveConvoyRecordId(codeOrId: string): Promise<string> {
  const existing = await pb
    .collection('convoys')
    .getFirstListItem(`id = "${codeOrId}"`)
    .catch(() => null)
  if (existing) return existing.id
  const byCode = await pb
    .collection('convoys')
    .getFirstListItem(`code = "${codeOrId}"`)
    .catch(() => null)
  if (byCode) return byCode.id
  return codeOrId
}

export async function sendTextMessage(
  convoyId: string,
  senderId: string,
  senderName: string,
  content: string,
): Promise<ChatMessage> {
  const recordId = await resolveConvoyRecordId(convoyId)
  return pb.collection('messages').create({
    convoy: recordId,
    sender: senderId,
    sender_name: senderName,
    type: 'text',
    content,
  })
}

export async function getMessages(convoyId: string, limit = 50): Promise<ChatMessage[]> {
  const recordId = await resolveConvoyRecordId(convoyId)
  const records = await pb.collection('messages').getFullList<ChatMessage>({
    filter: `convoy ~ "${recordId}"`,
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

  const recordId = await resolveConvoyRecordId(convoyId)

  const unsub = await pb.collection('messages').subscribe('*', (event) => {
    const eventConvoy = Array.isArray(event.record.convoy)
      ? event.record.convoy[0]
      : event.record.convoy
    if (eventConvoy !== recordId) return
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
