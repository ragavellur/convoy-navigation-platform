import supabase from './supabaseClient'
import { notifyChatMessage } from './pushSender'

export interface ChatMessage {
  id: string
  convoy: string
  sender: string
  senderName: string
  type: 'text' | 'system'
  content: string
  duration?: number
  location_lat?: number
  location_lng?: number
  created: string
  updated: string
}

let chatUnsub: (() => void) | null = null

/** Resolve a convoy id or 6-char join code into a convoy record id. */
async function resolveConvoyRecordId(codeOrId: string): Promise<string> {
  const { data: byId } = await supabase
    .from('convoys')
    .select('id')
    .eq('id', codeOrId)
    .maybeSingle()
  if (byId) return byId.id
  const { data: byCode } = await supabase
    .from('convoys')
    .select('id')
    .eq('code', codeOrId)
    .maybeSingle()
  if (byCode) return byCode.id
  return codeOrId
}

const nameCache = new Map<string, string>()

/** Resolve a user's display name from the profiles table (cached). */
async function getSenderName(userId: string): Promise<string> {
  const cached = nameCache.get(userId)
  if (cached) return cached
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle()
  const name = data?.name || 'A member'
  nameCache.set(userId, name)
  return name
}

function mapMessageRow(
  row: {
    id: string
    convoy: string
    sender: string
    type: string
    content: string
    duration: number | null
    location_lat: number | null
    location_lng: number | null
    created_at: string
    updated_at: string
  },
  senderName: string,
): ChatMessage {
  return {
    id: row.id,
    convoy: row.convoy,
    sender: row.sender,
    senderName,
    type: (row.type as ChatMessage['type']) || 'text',
    content: row.content,
    duration: row.duration ?? undefined,
    location_lat: row.location_lat ?? undefined,
    location_lng: row.location_lng ?? undefined,
    created: row.created_at,
    updated: row.updated_at,
  }
}

export async function sendTextMessage(
  convoyId: string,
  senderId: string,
  senderName: string,
  content: string,
): Promise<ChatMessage> {
  const recordId = await resolveConvoyRecordId(convoyId)
  const { data, error } = await supabase
    .from('messages')
    .insert({
      convoy: recordId,
      sender: senderId,
      type: 'text',
      content,
    })
    .select('*')
    .single()
  if (error) throw error
  return mapMessageRow(data, senderName)
}

export async function getMessages(convoyId: string, limit = 50): Promise<ChatMessage[]> {
  const recordId = await resolveConvoyRecordId(convoyId)
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('convoy', recordId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const rows = (data || []).reverse()
  const names = await Promise.all(rows.map((row) => getSenderName(row.sender)))
  return rows.map((row, i) => mapMessageRow(row, names[i]))
}

export async function subscribeToMessages(
  convoyId: string,
  onMessage: (message: ChatMessage) => void,
  currentUserId?: string,
): Promise<() => void> {
  chatUnsub?.()

  const recordId = await resolveConvoyRecordId(convoyId)

  const channel = supabase
    .channel(`messages-${recordId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `convoy=eq.${recordId}` },
      async (payload) => {
        const row = payload.new as {
          id: string
          convoy: string
          sender: string
          type: string
          content: string
          duration: number | null
          location_lat: number | null
          location_lng: number | null
          created_at: string
          updated_at: string
        }
        const senderName = await getSenderName(row.sender)
        const msg = mapMessageRow(row, senderName)
        onMessage(msg)
        if (row.sender !== currentUserId) {
          notifyChatMessage(recordId, senderName, row.content)
        }
      },
    )
    .subscribe()

  chatUnsub = () => {
    void supabase.removeChannel(channel)
    chatUnsub = null
  }

  return chatUnsub
}

export function unsubscribeMessages(): void {
  chatUnsub?.()
}
