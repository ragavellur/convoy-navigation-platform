import supabase from './supabaseClient'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer
}

export async function isPushSupported(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.getSubscription()
  return subscription !== null || Notification.permission !== 'denied'
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('VAPID public key not configured')
    return null
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  await saveSubscription(subscription)
  return subscription
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.getSubscription()
  if (!subscription) return false

  await subscription.unsubscribe()
  await removeSubscription()
  return true
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id
  if (!userId) return

  const data = subscription.toJSON()
  const endpoint = data.endpoint
  if (!endpoint) return
  const keys = data.keys as { p256dh: string; auth: string }

  try {
    const { data: existing } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user', userId)
      .eq('endpoint', endpoint)
      .maybeSingle()
    if (existing) return

    await supabase.from('push_subscriptions').insert({
      user: userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent,
    })
  } catch {
    // collection might not exist yet
  }
}

async function removeSubscription(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id
  if (!userId) return

  try {
    await supabase.from('push_subscriptions').delete().eq('user', userId)
  } catch {
    // silent fail
  }
}

export function getPermissionState(): NotificationPermission {
  return Notification.permission
}
