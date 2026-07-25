import pb from './pocketbase'

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

export async function subscribeToConvoyNotifications(
  convoyId: string,
  onNotification: (notification: ConvoyNotification) => void,
): Promise<() => void> {
  if (activeUnsub) {
    activeUnsub()
    activeUnsub = null
  }

  const unsub = await pb.collection('convoy_members').subscribe('*', (event) => {
    if (event.record.convoy !== convoyId) return
    const notification: ConvoyNotification = {
      id: event.record.id,
      convoy: event.record.convoy,
      user: event.record.user,
      type: event.action === 'create' ? 'member_joined' : 'member_left',
      message:
        event.action === 'create' ? 'A member joined the convoy' : 'A member left the convoy',
      read: false,
      created: event.record.created || new Date().toISOString(),
    }
    onNotification(notification)
  })

  activeUnsub = () => {
    unsub()
    activeUnsub = null
  }

  return activeUnsub
}

export async function subscribeToConvoyStatus(
  convoyId: string,
  onStatusChange: (status: string) => void,
): Promise<() => void> {
  const unsub = await pb.collection('convoys').subscribe(convoyId, (event) => {
    onStatusChange(event.record.status)
  })

  return unsub
}

export function unsubscribeAll(): void {
  if (activeUnsub) {
    activeUnsub()
    activeUnsub = null
  }
  pb.collection('convoy_members').unsubscribe('*')
  pb.collection('convoys').unsubscribe('*')
}
