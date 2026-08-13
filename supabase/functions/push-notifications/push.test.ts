import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { base64UrlToBytes, bytesToBase64Url } from '../_shared/webpush'

interface FetchCall {
  url: string
}

let fetchCalls: FetchCall[]
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response>

const envMap: Record<string, string> = {}

async function makeVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ])
  const jwk = (await crypto.subtle.exportKey('jwk', keyPair.privateKey)) as JsonWebKey
  const x = base64UrlToBytes(jwk.x!)
  const y = base64UrlToBytes(jwk.y!)
  const d = base64UrlToBytes(jwk.d!)
  return {
    publicKey: bytesToBase64Url(new Uint8Array([4, ...x, ...y])),
    privateKey: bytesToBase64Url(d),
  }
}

async function makeSubscription(): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const jwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey
  const x = base64UrlToBytes(jwk.x!)
  const y = base64UrlToBytes(jwk.y!)
  const auth = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))
  return {
    endpoint: 'https://push.example.com/s1',
    p256dh: bytesToBase64Url(new Uint8Array([4, ...x, ...y])),
    auth,
  }
}

let mod: typeof import('./index')

beforeEach(async () => {
  vi.resetModules()
  const vapid = await makeVapidKeys()
  envMap['SUPABASE_URL'] = 'https://project.supabase.co'
  envMap['SUPABASE_ANON_KEY'] = 'anon-key'
  envMap['SUPABASE_SERVICE_ROLE_KEY'] = 'service-role-key'
  envMap['VAPID_PUBLIC_KEY'] = vapid.publicKey
  envMap['VAPID_PRIVATE_KEY'] = vapid.privateKey
  envMap['VAPID_EMAIL'] = 'mailto:test@example.com'
  vi.stubGlobal('Deno', {
    env: { get: (k: string) => envMap[k] ?? undefined },
    serve: vi.fn(),
  })
  fetchCalls = []
  fetchImpl = async (url) => {
    fetchCalls.push({ url: String(url) })
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  vi.stubGlobal('fetch', fetchImpl)
  mod = await import('./index')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function authorizedRequest(method: string, path: string, body?: Record<string, unknown>): Request {
  const headers: Record<string, string> = { Authorization: 'Bearer jwt-token' }
  if (body) headers['Content-Type'] = 'application/json'
  return new Request(`https://project.supabase.co/functions/v1/push-notifications${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

function respondJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function routeResponse(req: Request, parts: string[]): Promise<Response> {
  try {
    return await mod.route(req, parts)
  } catch (err) {
    if (err instanceof mod.HttpError) return mod.json({ error: err.message }, err.status)
    throw err
  }
}

function stubOwnerFlow(
  ownerId: string,
  subscription: { endpoint: string; p256dh: string; auth: string } | null,
) {
  fetchImpl = async (url) => {
    const u = String(url)
    fetchCalls.push({ url: u })
    if (u.endsWith('/auth/v1/user')) return respondJson({ id: ownerId })
    if (u.includes('/rest/v1/convoys?')) return respondJson([{ owner: 'user-1' }])
    if (u.includes('/rest/v1/push_subscriptions?')) {
      return subscription ? respondJson([{ id: 'sub-1', ...subscription }]) : respondJson([])
    }
    return new Response('created', { status: 201 })
  }
  vi.stubGlobal('fetch', fetchImpl)
}

describe('push-notifications', () => {
  it('responds ok on GET /health without auth', async () => {
    const res = await routeResponse(new Request('http://x/health'), ['health'])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('rejects requests without an authorization token', async () => {
    const res = await routeResponse(new Request('http://x/push/send', { method: 'POST' }), [
      'push',
      'send',
    ])
    expect(res.status).toBe(401)
  })

  it('rejects invalid payloads with 400', async () => {
    stubOwnerFlow('user-1', null)
    const res = await routeResponse(authorizedRequest('POST', '/push/send', { convoyId: 'c1' }), [
      'push',
      'send',
    ])
    expect(res.status).toBe(400)
  })

  it('rejects non-owner senders with 403', async () => {
    stubOwnerFlow('user-2', null)
    const res = await routeResponse(
      authorizedRequest('POST', '/push/send', { convoyId: 'c1', title: 't', body: 'b' }),
      ['push', 'send'],
    )
    expect(res.status).toBe(403)
  })

  it('sends the payload to every subscription', async () => {
    const sub = await makeSubscription()
    stubOwnerFlow('user-1', sub)
    const res = await routeResponse(
      authorizedRequest('POST', '/push/send', { convoyId: 'c1', title: 'T', body: 'B', url: '/x' }),
      ['push', 'send'],
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true, sent: 1, failed: 0, deletedInvalid: 0, total: 1 })
    expect(fetchCalls.some((c) => c.url === sub.endpoint)).toBe(true)
  })

  it('deletes dead subscriptions and continues', async () => {
    const sub = await makeSubscription()
    let subsLoaded = false
    fetchImpl = async (url) => {
      const u = String(url)
      fetchCalls.push({ url: u })
      if (u.endsWith('/auth/v1/user')) return respondJson({ id: 'user-1' })
      if (u.includes('/rest/v1/convoys?')) return respondJson([{ owner: 'user-1' }])
      if (u.includes('/rest/v1/push_subscriptions?')) {
        if (!subsLoaded) {
          subsLoaded = true
          return respondJson([{ id: 'sub-1', ...sub }])
        }
        return respondJson([])
      }
      return new Response('gone', { status: 410 })
    }
    vi.stubGlobal('fetch', fetchImpl)
    const res = await routeResponse(
      authorizedRequest('POST', '/push/send', { convoyId: 'c1', title: 'T', body: 'B' }),
      ['push', 'send'],
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.failed).toBe(1)
    expect(data.deletedInvalid).toBe(1)
    expect(
      fetchCalls.some(
        (c) => c.url.includes('/rest/v1/push_subscriptions?') && !c.url.includes('select'),
      ),
    ).toBe(true)
  })

  it('returns 503 when VAPID keys are missing', async () => {
    delete envMap['VAPID_PUBLIC_KEY']
    delete envMap['VAPID_PRIVATE_KEY']
    vi.resetModules()
    mod = await import('./index')
    stubOwnerFlow('user-1', null)
    const res = await routeResponse(
      authorizedRequest('POST', '/push/send', { convoyId: 'c1', title: 'T', body: 'B' }),
      ['push', 'send'],
    )
    expect(res.status).toBe(503)
  })
})
