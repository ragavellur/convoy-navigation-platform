import PocketBase from 'pocketbase'

export const PB_URL = process.env.VITE_POCKETBASE_URL || 'http://localhost:8090'
export const OSRM_URL = process.env.VITE_OSRM_URL || 'http://localhost:5001'
export const NOMINATIM_URL = process.env.VITE_NOMINATIM_URL || 'http://localhost:8080'
export const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@convoy.local'
export const ADMIN_PASS = process.env.POCKETBASE_ADMIN_PASSWORD || 'admin123456'

export type TestContext = {
  adminToken: string
  userPb: PocketBase
  testUser: { id: string; email: string; password: string }
  testConvoy: { id: string; code: string }
  testVehicle: { id: string }
}

const CTX: TestContext = {} as TestContext
export function getCtx(): TestContext {
  return CTX
}

export async function checkService(url: string, timeout = 3000): Promise<void> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok && res.status !== 404 && res.status !== 400) {
      clearTimeout(id)
      throw new Error(`Service at ${url} returned ${res.status}`)
    }
  } catch (err) {
    clearTimeout(id)
    if (err instanceof Error && err.message.includes('Service at')) throw err
    throw new Error(`Service at ${url} not reachable. Ensure Docker containers are running.`, {
      cause: err,
    })
  }
  clearTimeout(id)
}

export async function adminFetch(
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown> | Array<Record<string, unknown>>> {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${CTX.adminToken}`,
      'Content-Type': 'application/json',
    },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${PB_URL}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Admin API ${method} ${path} failed: ${JSON.stringify(err)}`)
  }
  if (res.status === 204) return {}
  return res.json()
}

export async function globalSetup(): Promise<TestContext> {
  const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASS }),
  })
  if (!authRes.ok) throw new Error('Admin auth failed')
  const authData = await authRes.json()
  CTX.adminToken = authData.token as string

  // Ensure push_subscriptions collection exists (may not be on dev server)
  try {
    await adminFetch('GET', '/api/collections/push_subscriptions')
  } catch {
    try {
      const allCols = (await adminFetch('GET', '/api/collections?perPage=100')) as {
        items: Array<{ name: string; id: string }>
      }
      const usersColId =
        (
          (allCols.items || []).find((c: Record<string, unknown>) => c.name === 'users') as
            { id: string } | undefined
        )?.id || ''
      await adminFetch('POST', '/api/collections', {
        name: 'push_subscriptions',
        schema: [
          {
            name: 'user',
            type: 'relation',
            options: { collectionId: usersColId, maxSelect: 1, cascadeDelete: true },
          },
          { name: 'endpoint', type: 'text', required: true, options: { max: 512 } },
          { name: 'p256dh', type: 'text', options: { max: 256 } },
          { name: 'auth', type: 'text', options: { max: 256 } },
          { name: 'user_agent', type: 'text', options: { max: 512 } },
        ],
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      } as Record<string, unknown>)
    } catch {
      /* collection may already exist from parallel process */
    }
  }

  const email = `int-test-${Date.now()}@example.com`
  const password = 'IntTestPass123!'
  const user = (await adminFetch('POST', '/api/collections/users/records', {
    email,
    password,
    passwordConfirm: password,
    name: 'Integration Test User',
    role: 'member',
    status: 'active',
  })) as Record<string, unknown>
  CTX.testUser = { id: user.id as string, email, password }

  CTX.userPb = new PocketBase(PB_URL)
  await CTX.userPb.collection('users').authWithPassword(email, password)

  const code = `I${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`
  const convoy = (await adminFetch('POST', '/api/collections/convoys/records', {
    name: 'Integration Test Convoy',
    code,
    owner: user.id,
    status: 'active',
    convoy_type: 'vehicle',
    trip_id: 'int-test',
    security_token: 'int-test-token',
  })) as Record<string, unknown>
  CTX.testConvoy = { id: convoy.id as string, code }

  const vehicle = (await adminFetch('POST', '/api/collections/vehicles/records', {
    name: 'Integration Test Vehicle',
    license_plate: `INT-${Date.now().toString(36).slice(0, 6).toUpperCase()}`,
    type: 'car',
    status: 'active',
    owner: user.id,
  })) as Record<string, unknown>
  CTX.testVehicle = { id: vehicle.id as string }

  return CTX
}

export async function globalTeardown(): Promise<void> {
  if (!CTX.testConvoy?.id) return

  const cols = ['positions', 'messages', 'push_subscriptions', 'cached_routes', 'convoy_members']
  for (const col of cols) {
    try {
      const records = (await adminFetch(
        'GET',
        `/api/collections/${col}/records?filter=${encodeURIComponent(`convoy = "${CTX.testConvoy.id}"`)}&fields=id&perPage=100`,
      )) as { items: Array<{ id: string }> }
      const items = records.items || []
      for (const r of items) {
        await adminFetch('DELETE', `/api/collections/${col}/records/${r.id}`)
      }
    } catch {
      /* ok */
    }
  }

  await adminFetch('DELETE', `/api/collections/vehicles/records/${CTX.testVehicle.id}`).catch(
    () => {},
  )
  await adminFetch('DELETE', `/api/collections/convoys/records/${CTX.testConvoy.id}`).catch(
    () => {},
  )
  await adminFetch('DELETE', `/api/collections/users/records/${CTX.testUser.id}`).catch(() => {})

  CTX.userPb?.authStore.clear()
  CTX.userPb = null!
  CTX.adminToken = ''
}
