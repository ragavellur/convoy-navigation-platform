import supabase from './supabaseClient'

export interface PushPayload {
  title: string
  body: string
  url?: string
}

async function getSimulationServiceUrl(): Promise<string> {
  const envUrl = import.meta.env.VITE_SIMULATION_API_URL
  if (envUrl) return envUrl
  return `${window.location.origin}/functions/v1/simulation`
}

async function sendPushNotification(convoyId: string, payload: PushPayload): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return

  try {
    const baseUrl = await getSimulationServiceUrl()
    await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ convoyId, ...payload }),
    })
  } catch (err) {
    console.warn('Push notification failed:', err)
  }
}

export async function notifyMemberJoined(convoyId: string, memberName: string): Promise<void> {
  await sendPushNotification(convoyId, {
    title: 'Member Joined',
    body: `${memberName} has joined the convoy`,
    url: `/map?convoy=${convoyId}`,
  })
}

export async function notifyMemberLeft(convoyId: string, memberName: string): Promise<void> {
  await sendPushNotification(convoyId, {
    title: 'Member Left',
    body: `${memberName} has left the convoy`,
    url: `/map?convoy=${convoyId}`,
  })
}

export async function notifyConvoyEnded(convoyId: string): Promise<void> {
  await sendPushNotification(convoyId, {
    title: 'Convoy Ended',
    body: 'The convoy session has been ended by the host',
    url: '/convoy',
  })
}

export async function notifyOffRoute(convoyId: string, memberName: string): Promise<void> {
  await sendPushNotification(convoyId, {
    title: 'Off Route',
    body: `${memberName} has deviated from the convoy route`,
    url: `/map?convoy=${convoyId}`,
  })
}

export async function notifyChatMessage(
  convoyId: string,
  senderName: string,
  preview: string,
): Promise<void> {
  await sendPushNotification(convoyId, {
    title: `Message from ${senderName}`,
    body: preview.length > 80 ? preview.slice(0, 80) + '...' : preview,
    url: `/map?convoy=${convoyId}`,
  })
}

export async function notifySimulationStarted(convoyId: string): Promise<void> {
  await sendPushNotification(convoyId, {
    title: 'Simulation Started',
    body: 'Simulation mode has been activated for this convoy',
    url: `/map?convoy=${convoyId}`,
  })
}

export async function notifySimulationStopped(convoyId: string): Promise<void> {
  await sendPushNotification(convoyId, {
    title: 'Simulation Stopped',
    body: 'Simulation mode has been deactivated for this convoy',
    url: `/map?convoy=${convoyId}`,
  })
}
