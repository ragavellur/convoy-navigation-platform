import supabase from './supabaseClient'
import { notifyMemberJoined, notifyMemberLeft } from './pushSender'

export interface ConvoyNotification {
  id: string
  convoy: string
  user: string
  type: 'member_joined' | 'member_left' | 'session_ended' | 'session_paused'
  message: string
  read: boolean
  created: string
}

let activeUnsub: (() => void) | null = null

/** Resolve a member's display name (cached). */
async function getMemberName(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle()
  return data?.name || 'A member'
}

export async function subscribeToConvoyNotifications(
  convoyId: string,
  onNotification: (notification: ConvoyNotification) => void,
): Promise<() => void> {
  if (activeUnsub) {
    activeUnsub()
    activeUnsub = null
  }

  const channel = supabase
    .channel(`convoy-members-${convoyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'convoy_members', filter: `convoy=eq.${convoyId}` },
      async (payload) => {
        const isInsert = payload.eventType === 'INSERT'
        const isDelete = payload.eventType === 'DELETE'
        if (payload.eventType === 'UPDATE') return

        const row = (isInsert ? payload.new : payload.old) as {
          id: string
          convoy: string
          user: string
          created_at?: string
        }
        const notification: ConvoyNotification = {
          id: row.id,
          convoy: row.convoy,
          user: row.user,
          type: isInsert ? 'member_joined' : 'member_left',
          message: isInsert ? 'A member joined the convoy' : 'A member left the convoy',
          read: false,
          created: row.created_at || new Date().toISOString(),
        }
        onNotification(notification)

        if (isInsert) {
          notifyMemberJoined(convoyId, await getMemberName(row.user))
        } else if (isDelete) {
          notifyMemberLeft(convoyId, await getMemberName(row.user))
        }
      },
    )
    .subscribe()

  activeUnsub = () => {
    void supabase.removeChannel(channel)
    activeUnsub = null
  }

  return activeUnsub
}

export async function subscribeToConvoyStatus(
  convoyId: string,
  onStatusChange: (status: string) => void,
): Promise<() => void> {
  const channel = supabase
    .channel(`convoys-${convoyId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'convoys', filter: `id=eq.${convoyId}` },
      (payload) => {
        const row = payload.new as { status: string }
        onStatusChange(row.status)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export function unsubscribeAll(): void {
  if (activeUnsub) {
    activeUnsub()
    activeUnsub = null
  }
  void supabase.removeAllChannels()
}
