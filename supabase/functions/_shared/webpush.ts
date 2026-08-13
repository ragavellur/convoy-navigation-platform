export interface PushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

export interface VapidKeys {
  publicKey: string
  privateKey: string
}

const encoder = new TextEncoder()

export function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const bin = atob(b64 + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hkdf(
  input: ArrayBuffer | Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', input, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

function encodeInt(bytes: Uint8Array): Uint8Array {
  let i = 0
  while (i < bytes.length - 1 && bytes[i] === 0) i++
  const trimmed = bytes.slice(i)
  const body = trimmed[0] & 0x80 ? new Uint8Array([0, ...trimmed]) : trimmed
  return new Uint8Array([0x02, body.length, ...body])
}

export function rawToDerSignature(raw: Uint8Array): Uint8Array {
  const r = encodeInt(raw.slice(0, 32))
  const s = encodeInt(raw.slice(32))
  const body = new Uint8Array([...r, ...s])
  return new Uint8Array([0x30, body.length, ...body])
}

function b64urlJson(value: Record<string, string>): string {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)))
}

export async function createVapidJwt(
  audience: string,
  keys: VapidKeys,
  subject: string,
): Promise<{ token: string; publicKeyB64Url: string }> {
  const pub = base64UrlToBytes(keys.publicKey)
  const x = pub.slice(1, 33)
  const y = pub.slice(33, 65)
  const d = base64UrlToBytes(keys.privateKey)

  const header = b64urlJson({ typ: 'JWT', alg: 'ES256' })
  const payload = b64urlJson({
    aud: audience,
    exp: String(Math.floor(Date.now() / 1000) + 12 * 3600),
    sub: subject,
  })
  const signingInput = encoder.encode(`${header}.${payload}`)

  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToBase64Url(x),
      y: bytesToBase64Url(y),
      d: bytesToBase64Url(d),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const raw = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput),
  )
  const der = rawToDerSignature(raw)

  return {
    token: `${header}.${payload}.${bytesToBase64Url(der)}`,
    publicKeyB64Url: bytesToBase64Url(pub),
  }
}

export async function encryptPushPayload(
  subscription: PushSubscription,
  payload: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const clientRaw = base64UrlToBytes(subscription.p256dh)
  const clientX = clientRaw.slice(1, 33)
  const clientY = clientRaw.slice(33, 65)

  const clientKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: bytesToBase64Url(clientX), y: bytesToBase64Url(clientY) },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const ephKey = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey },
    ephKey.privateKey,
    256,
  )
  const ephJwk = (await crypto.subtle.exportKey('jwk', ephKey.publicKey)) as JsonWebKey
  const ephX = base64UrlToBytes(ephJwk.x!)
  const ephY = base64UrlToBytes(ephJwk.y!)

  const authSecret = base64UrlToBytes(subscription.auth)
  const prk = await hkdf(shared, authSecret, encoder.encode('Content-Encoding: auth\u0000'), 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const context = new Uint8Array([...encoder.encode('P-256\u0000'), 32, ...clientX, 32, ...ephX])

  const ikm = await hkdf(
    prk,
    salt,
    new Uint8Array([...encoder.encode('Content-Encoding: aes128gcm\u0000'), ...context]),
    32,
  )
  const nonce = await hkdf(
    prk,
    salt,
    new Uint8Array([...encoder.encode('Content-Encoding: nonce\u0000'), ...context]),
    12,
  )

  const aesKey = await crypto.subtle.importKey('raw', ikm, 'AES-GCM', false, ['encrypt'])
  const plaintext = new Uint8Array([...encoder.encode(payload), 0x02])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext),
  )

  const ephPoint = new Uint8Array([4, ...ephX, ...ephY])
  const recordSize = new Uint8Array([0x00, 0x00, 0x10, 0x00])
  const header = new Uint8Array([...salt, ...recordSize, 65, ...ephPoint])

  return new Uint8Array([...header, ...ciphertext])
}

export async function sendWebPush(
  subscription: PushSubscription,
  payload: string,
  vapid: VapidKeys,
  subject: string,
): Promise<void> {
  const body = await encryptPushPayload(subscription, payload)
  const { token, publicKeyB64Url } = await createVapidJwt(subscription.endpoint, vapid, subject)

  let response: Response
  try {
    response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${token}, k=${publicKeyB64Url}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    throw Object.assign(new Error(`Push network error: ${(err as Error).message}`), {
      statusCode: status ?? 0,
    })
  }

  if (!response.ok) {
    throw Object.assign(new Error(`Push failed: ${response.status} ${response.statusText}`), {
      statusCode: response.status,
    })
  }
}
