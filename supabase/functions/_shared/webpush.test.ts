import { describe, it, expect, vi } from 'vitest'
import {
  base64UrlToBytes,
  bytesToBase64Url,
  rawToDerSignature,
  createVapidJwt,
  encryptPushPayload,
  sendWebPush,
  type PushSubscription,
} from './webpush'

async function makeVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ])
  const jwk = (await crypto.subtle.exportKey('jwk', keyPair.privateKey)) as JsonWebKey
  const x = base64UrlToBytes(jwk.x!)
  const y = base64UrlToBytes(jwk.y!)
  const d = base64UrlToBytes(jwk.d!)
  const publicKey = bytesToBase64Url(new Uint8Array([4, ...x, ...y]))
  return { publicKey, privateKey: bytesToBase64Url(d) }
}

async function makeSubscription(): Promise<PushSubscription> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const jwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey
  const x = base64UrlToBytes(jwk.x!)
  const y = base64UrlToBytes(jwk.y!)
  const auth = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))
  return {
    endpoint: 'https://push.example.com/endpoint-1',
    p256dh: bytesToBase64Url(new Uint8Array([4, ...x, ...y])),
    auth,
  }
}

describe('base64 url encoding', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    expect(bytesToBase64Url(base64UrlToBytes(bytesToBase64Url(bytes)))).toBe(
      bytesToBase64Url(bytes),
    )
  })
})

describe('rawToDerSignature', () => {
  it('produces a DER SEQUENCE for low-byte values', () => {
    const raw = new Uint8Array(64)
    for (let i = 0; i < 64; i++) raw[i] = i + 1
    const der = rawToDerSignature(raw)
    expect(der[0]).toBe(0x30)
    expect(der.length).toBe(70)
    expect(der[1]).toBe(68)
  })

  it('pads integers with a leading zero when the high bit is set', () => {
    const raw = new Uint8Array(64)
    for (let i = 0; i < 32; i++) raw[i] = 0x80 + i
    for (let i = 32; i < 64; i++) raw[i] = 0xff
    const der = rawToDerSignature(raw)
    expect(der[0]).toBe(0x30)
    expect(der.length).toBe(72)
  })
})

describe('createVapidJwt', () => {
  it('issues a three-part JWT with the correct audience', async () => {
    const keys = await makeVapidKeys()
    const { token, publicKeyB64Url } = await createVapidJwt(
      'https://push.example.com/endpoint-1',
      keys,
      'mailto:test@example.com',
    )
    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    const payload = JSON.parse(atob(parts[1]))
    expect(payload.aud).toBe('https://push.example.com/endpoint-1')
    expect(payload.sub).toBe('mailto:test@example.com')
    expect(publicKeyB64Url).toBe(keys.publicKey)
  })
})

describe('encryptPushPayload', () => {
  it('returns aes128gcm header followed by ciphertext', async () => {
    const keys = await makeVapidKeys()
    const sub = await makeSubscription()
    const body = await encryptPushPayload(sub, '{"title":"hi"}')
    // 16 salt + 4 record size + 1 idlen (65) + 65 uncompressed point = 86-byte header
    expect(body[16]).toBe(0x00)
    expect(body[17]).toBe(0x00)
    expect(body[18]).toBe(0x10)
    expect(body[19]).toBe(0x00)
    expect(body[20]).toBe(65)
    expect(body.length).toBeGreaterThan(86)
    void keys
  })
})

describe('sendWebPush', () => {
  it('posts an aes128gcm payload with a vapid authorization header', async () => {
    const keys = await makeVapidKeys()
    const sub = await makeSubscription()
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', mockFetch)

    await sendWebPush(sub, '{"x":1}', keys, 'mailto:test@example.com')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(sub.endpoint)
    expect(init.headers.Authorization).toMatch(/^vapid t=.*, k=.*$/)
    expect(init.headers['Content-Encoding']).toBe('aes128gcm')
    expect(init.headers.TTL).toBe('86400')
    vi.unstubAllGlobals()
  })

  it('throws with statusCode on non-ok response', async () => {
    const keys = await makeVapidKeys()
    const sub = await makeSubscription()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gone', { status: 410 })))

    const err = await sendWebPush(sub, '{}', keys, 'mailto:test@example.com').catch(
      (e: unknown) => e,
    )
    expect((err as { statusCode?: number }).statusCode).toBe(410)
    vi.unstubAllGlobals()
  })
})
