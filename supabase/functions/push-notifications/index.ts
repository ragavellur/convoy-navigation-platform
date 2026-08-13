import { sendWebPush, type VapidKeys } from '../_shared/webpush.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_EMAIL = Deno.env.get('VAPID_EMAIL') ?? 'mailto:raga.vellur@gmail.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function rest(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...(options.headers ?? {}),
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DB ${options.method ?? 'GET'} ${path} failed: ${res.status} ${text}`)
  }
  if (res.status === 204) return null
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (e) {
    console.error('rest bad json', options.method ?? 'GET', path, 'status', res.status)
    throw e
  }
}

export async function getUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new HttpError(401, 'Missing authorization token')
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  })
  if (!res.ok) throw new HttpError(401, 'Invalid or expired token')
  const data = (await res.json()) as { id?: string }
  if (!data.id) throw new HttpError(401, 'Invalid or expired token')
  return data.id
}

export async function requireOwner(userId: string, convoyId: string): Promise<void> {
  const rows = (await rest(`/convoys?select=owner&id=eq.${convoyId}`)) as { owner?: string }[]
  const convoy = rows?.[0]
  if (!convoy) throw new HttpError(404, 'Convoy not found')
  if (convoy.owner !== userId) {
    throw new HttpError(403, 'Only the convoy owner can send push notifications')
  }
}

interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export async function handlePushSend(userId: string, body: Record<string, unknown>) {
  const {
    convoyId,
    title,
    body: bodyText,
    url,
  } = body as {
    convoyId: string
    title: string
    body: string
    url?: string
  }
  if (!convoyId || !title || !bodyText) {
    throw new HttpError(400, 'convoyId, title, and body are required')
  }
  await requireOwner(userId, convoyId)
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new HttpError(503, 'Push notifications not configured (missing VAPID keys)')
  }

  const subscriptions = (await rest(
    '/push_subscriptions?select=id,endpoint,p256dh,auth',
  )) as PushSubscriptionRow[]
  if (!subscriptions.length) {
    return { success: true, sent: 0, total: 0, message: 'No active subscribers' }
  }

  const payload = JSON.stringify({
    title,
    body: bodyText,
    icon: '/icons/logo.png',
    badge: '/icons/icon-192x192.png',
    url: url || '/map?convoy=' + convoyId,
    convoyId,
  })

  const vapid: VapidKeys = { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY }
  let sent = 0
  let failed = 0
  let deletedInvalid = 0
  for (const sub of subscriptions) {
    try {
      await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        vapid,
        VAPID_EMAIL,
      )
      sent++
    } catch (err) {
      failed++
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await rest(`/push_subscriptions?id=eq.${sub.id}`, { method: 'DELETE' }).catch(() => {})
        deletedInvalid++
      }
    }
  }

  return { success: true, sent, failed, deletedInvalid, total: subscriptions.length }
}

export async function route(req: Request, parts: string[]): Promise<Response> {
  const path = parts.join('/')

  if (req.method === 'GET' && path === 'health') {
    return json({ status: 'ok' })
  }

  const userId = await getUserId(req)
  const body =
    req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {}

  if (req.method === 'POST' && (path === 'push/send' || path === 'api/push/send')) {
    return json(await handlePushSend(userId, body))
  }

  throw new HttpError(404, 'Not found')
}

if (typeof Deno !== 'undefined') {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const url = new URL(req.url)
    let pathname = url.pathname
    for (const prefix of ['/functions/v1/push-notifications', '/push-notifications']) {
      if (pathname.startsWith(prefix)) {
        pathname = pathname.slice(prefix.length)
        break
      }
    }
    const parts = pathname.split('/').filter(Boolean)
    try {
      return await route(req, parts)
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      return json({ error: (err as Error).message ?? 'Internal error' }, 500)
    }
  })
}
