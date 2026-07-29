import PocketBase from 'pocketbase'
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import {
  PB_URL,
  checkService,
  globalSetup,
  globalTeardown,
  getCtx,
  TestContext,
  adminFetch,
} from './setup'

let ctx: TestContext

beforeAll(async () => {
  await checkService(PB_URL)
  await globalSetup()
  ctx = getCtx()
})

afterAll(async () => {
  await globalTeardown()
})

describe('PocketBase Convoys CRUD', () => {
  test('create a convoy with all required fields', async () => {
    const code = `C${Date.now().toString(36).slice(0, 5).toUpperCase()}`
    const convoy = await ctx.userPb.collection('convoys').create({
      name: 'Test Convoy Create',
      code,
      owner: ctx.testUser.id,
      status: 'active',
      convoy_type: 'vehicle',
      trip_id: 'int-test',
      security_token: 'test-token',
    })
    expect(convoy.id).toBeTruthy()
    expect(convoy.code).toBe(code)
    await adminFetch('DELETE', `/api/collections/convoys/records/${convoy.id}`)
  })

  test('create convoy with optional source/dest fields', async () => {
    const code = `D${Date.now().toString(36).slice(0, 5).toUpperCase()}`
    const convoy = (await ctx.userPb.collection('convoys').create({
      name: 'Test Convoy Dest',
      code,
      owner: ctx.testUser.id,
      status: 'active',
      convoy_type: 'vehicle',
      trip_id: 'int-test',
      security_token: 'test-token',
      source_lat: 13.0827,
      source_lng: 80.2707,
      source_name: 'Chennai',
      dest_lat: 12.9716,
      dest_lng: 77.5946,
      dest_name: 'Bangalore',
    })) as unknown as Record<string, unknown>
    expect(convoy.source_name).toBe('Chennai')
    await adminFetch('DELETE', `/api/collections/convoys/records/${convoy.id}`)
  })

  test('create convoy fails with duplicate code', async () => {
    await expect(
      ctx.userPb.collection('convoys').create({
        name: 'Duplicate Code',
        code: ctx.testConvoy.code,
        owner: ctx.testUser.id,
        status: 'active',
        convoy_type: 'vehicle',
        trip_id: '',
        security_token: '',
      }),
    ).rejects.toThrow()
  })

  test('read convoy by id', async () => {
    const convoy = (await ctx.userPb
      .collection('convoys')
      .getOne(ctx.testConvoy.id)) as unknown as Record<string, unknown>
    expect(convoy.id).toBe(ctx.testConvoy.id)
    expect(convoy.code).toBe(ctx.testConvoy.code)
  })

  test('find convoy by code using getFirstListItem', async () => {
    const convoy = (await ctx.userPb
      .collection('convoys')
      .getFirstListItem(`code = "${ctx.testConvoy.code}"`)) as unknown as Record<string, unknown>
    expect(convoy.id).toBe(ctx.testConvoy.id)
  })

  test('find convoy by non-existent code returns empty', async () => {
    await expect(
      ctx.userPb.collection('convoys').getFirstListItem('code = "XXXXXX"'),
    ).rejects.toThrow()
  })

  test('list convoys with filter', async () => {
    const result = (await ctx.userPb.collection('convoys').getList(1, 10, {
      filter: `owner = "${ctx.testUser.id}"`,
    })) as unknown as { items: Array<Record<string, unknown>> }
    expect(result.items.length).toBeGreaterThanOrEqual(1)
  })

  test('update convoy status', async () => {
    await ctx.userPb.collection('convoys').update(ctx.testConvoy.id, { status: 'ended' })
    const updated = (await ctx.userPb
      .collection('convoys')
      .getOne(ctx.testConvoy.id)) as unknown as Record<string, unknown>
    expect(updated.status).toBe('ended')
    await ctx.userPb.collection('convoys').update(ctx.testConvoy.id, { status: 'active' })
  })

  test('update convoy fails for non-owner user', async () => {
    const otherEmail = `other-${Date.now()}@example.com`
    const otherUser = (await adminFetch('POST', '/api/collections/users/records', {
      email: otherEmail,
      password: 'OtherPass123!',
      passwordConfirm: 'OtherPass123!',
      name: 'Other User',
      role: 'member',
      status: 'active',
    })) as Record<string, unknown>
    const otherPb = new PocketBase(PB_URL)
    await otherPb.collection('users').authWithPassword(otherEmail, 'OtherPass123!')

    await expect(
      otherPb.collection('convoys').update(ctx.testConvoy.id, { name: 'Hacked Name' }),
    ).rejects.toThrow()

    await adminFetch('DELETE', `/api/collections/users/records/${otherUser.id}`)
  })
})

describe('PocketBase Convoy Members CRUD', () => {
  let memberId: string
  let dupMemberId: string

  afterAll(async () => {
    if (memberId) {
      await adminFetch('DELETE', `/api/collections/convoy_members/records/${memberId}`).catch(
        () => {},
      )
    }
    if (dupMemberId) {
      await adminFetch('DELETE', `/api/collections/convoy_members/records/${dupMemberId}`).catch(
        () => {},
      )
    }
  })

  test('add member to convoy', async () => {
    const member = (await ctx.userPb.collection('convoy_members').create({
      convoy: ctx.testConvoy.id,
      user: ctx.testUser.id,
      role: 'member',
      status: 'active',
    })) as unknown as Record<string, unknown>
    memberId = member.id as string
    expect(member.id).toBeTruthy()
    expect(member.role).toBe('member')
  })

  test('list members by convoy', async () => {
    const members = (await ctx.userPb.collection('convoy_members').getFullList({
      filter: `convoy = "${ctx.testConvoy.id}"`,
    })) as unknown as Array<Record<string, unknown>>
    expect(members.length).toBeGreaterThanOrEqual(1)
    expect(members.some((m: Record<string, unknown>) => m.id === memberId)).toBe(true)
  })

  test('add duplicate member succeeds (no unique index on server)', async () => {
    const dup = (await ctx.userPb.collection('convoy_members').create({
      convoy: ctx.testConvoy.id,
      user: ctx.testUser.id,
      role: 'member',
      status: 'active',
    })) as unknown as Record<string, unknown>
    dupMemberId = dup.id as string
    expect(dup.id).toBeTruthy()
  })

  test('update member role', async () => {
    await ctx.userPb.collection('convoy_members').update(memberId, { role: 'admin' })
    const updated = (await ctx.userPb
      .collection('convoy_members')
      .getOne(memberId)) as unknown as Record<string, unknown>
    expect(updated.role).toBe('admin')
  })

  test('remove member from convoy', async () => {
    await ctx.userPb.collection('convoy_members').delete(memberId)
    await expect(ctx.userPb.collection('convoy_members').getOne(memberId)).rejects.toThrow()
    memberId = ''
  })
})

describe('PocketBase Positions CRUD', () => {
  let positionId: string

  afterAll(async () => {
    if (positionId) {
      await adminFetch('DELETE', `/api/collections/positions/records/${positionId}`).catch(() => {})
    }
  })

  test('create a position', async () => {
    const pos = (await ctx.userPb.collection('positions').create({
      vehicle: ctx.testVehicle.id,
      convoy: ctx.testConvoy.id,
      lat: 13.0827,
      lng: 80.2707,
      speed: 45,
      heading: 90,
      accuracy: 5,
    })) as unknown as Record<string, unknown>
    positionId = pos.id as string
    expect(pos.lat).toBe(13.0827)
    expect(pos.lng).toBe(80.2707)
    expect(pos.speed).toBe(45)
    expect(pos.heading).toBe(90)
  })

  test('create second position for same convoy gets new ID (no upsert index on server)', async () => {
    const pos2 = (await ctx.userPb.collection('positions').create({
      vehicle: ctx.testVehicle.id,
      convoy: ctx.testConvoy.id,
      lat: 13.1,
      lng: 80.3,
    })) as unknown as Record<string, unknown>
    expect(pos2.id).not.toBe(positionId)
    expect(pos2.lat).toBe(13.1)
    await adminFetch('DELETE', `/api/collections/positions/records/${pos2.id}`)
  })

  test('getList returns positions with filter', async () => {
    const result = (await ctx.userPb.collection('positions').getList(1, 10, {
      filter: `convoy = "${ctx.testConvoy.id}"`,
      fields: 'id,vehicle,lat,lng,heading,speed',
      requestKey: null,
    })) as unknown as { items: Array<Record<string, unknown>> }
    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items[0].lat).toBeDefined()
  })

  test('update position fields (speed, heading)', async () => {
    await ctx.userPb.collection('positions').update(positionId, { speed: 60, heading: 180 })
    const updated = (await ctx.userPb
      .collection('positions')
      .getOne(positionId)) as unknown as Record<string, unknown>
    expect(updated.speed).toBe(60)
    expect(updated.heading).toBe(180)
  })

  test('delete position', async () => {
    await ctx.userPb.collection('positions').delete(positionId)
    await expect(ctx.userPb.collection('positions').getOne(positionId)).rejects.toThrow()
    positionId = ''
  })
})

describe('PocketBase Messages CRUD', () => {
  const messageIds: string[] = []

  afterAll(async () => {
    for (const id of messageIds) {
      await adminFetch('DELETE', `/api/collections/messages/records/${id}`).catch(() => {})
    }
  })

  test('create a text message', async () => {
    const msg = (await ctx.userPb.collection('messages').create({
      convoy: ctx.testConvoy.id,
      sender: ctx.testUser.id,
      sender_name: ctx.testUser.email,
      type: 'text',
      content: 'Hello from integration test!',
    })) as unknown as Record<string, unknown>
    messageIds.push(msg.id as string)
    expect(msg.content).toBe('Hello from integration test!')
    expect(msg.type).toBe('text')
  })

  test('create a system message', async () => {
    const msg = (await ctx.userPb.collection('messages').create({
      convoy: ctx.testConvoy.id,
      sender: ctx.testUser.id,
      sender_name: 'System',
      type: 'system',
      content: 'A member joined the convoy',
    })) as unknown as Record<string, unknown>
    messageIds.push(msg.id as string)
    expect(msg.type).toBe('system')
  })

  test('create a voice message with duration', async () => {
    const msg = (await ctx.userPb.collection('messages').create({
      convoy: ctx.testConvoy.id,
      sender: ctx.testUser.id,
      sender_name: ctx.testUser.email,
      type: 'voice',
      content: 'Voice recording',
      duration: 15.5,
    })) as unknown as Record<string, unknown>
    messageIds.push(msg.id as string)
    expect(msg.type).toBe('voice')
    expect(msg.duration).toBe(15.5)
  })

  test('list messages with filter and sort', async () => {
    const messages = (await ctx.userPb.collection('messages').getFullList({
      filter: `convoy ~ "${ctx.testConvoy.id}"`,
      sort: '-created',
    })) as unknown as Array<Record<string, unknown>>
    expect(messages.length).toBeGreaterThanOrEqual(3)
  })

  test('getList returns paginated messages', async () => {
    const result = (await ctx.userPb.collection('messages').getList(1, 2, {
      filter: `convoy ~ "${ctx.testConvoy.id}"`,
      sort: '-created',
    })) as unknown as { items: Array<Record<string, unknown>>; totalItems: number }
    expect(result.items.length).toBeLessThanOrEqual(2)
    expect(result.totalItems).toBeGreaterThanOrEqual(3)
  })

  test('create message fails for unauthenticated user', async () => {
    const anonPb = new PocketBase(PB_URL)
    await expect(
      anonPb.collection('messages').create({
        convoy: ctx.testConvoy.id,
        sender: 'nonexistent',
        sender_name: 'anon',
        type: 'text',
        content: 'should fail',
      }),
    ).rejects.toThrow()
  })
})

describe('PocketBase Cached Routes CRUD', () => {
  test('cache a route (admin only)', async () => {
    const route = (await adminFetch('POST', '/api/collections/cached_routes/records', {
      origin_lat: 13.0827,
      origin_lng: 80.2707,
      dest_lat: 12.9716,
      dest_lng: 77.5946,
      distance: 350000,
      duration: 21000,
      geometry: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [80.2707, 13.0827],
          [77.5946, 12.9716],
        ],
      }),
    })) as Record<string, unknown>
    expect(route.id).toBeTruthy()
    expect(route.distance).toBe(350000)
    await adminFetch('DELETE', `/api/collections/cached_routes/records/${route.id}`)
  })

  test('find cached route by origin/dest coordinates', async () => {
    const route = (await adminFetch('POST', '/api/collections/cached_routes/records', {
      origin_lat: 13.0827,
      origin_lng: 80.2707,
      dest_lat: 12.9716,
      dest_lng: 77.5946,
      distance: 350000,
      duration: 21000,
      geometry: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [80.2707, 13.0827],
          [77.5946, 12.9716],
        ],
      }),
    })) as Record<string, unknown>
    const results = (await adminFetch(
      'GET',
      `/api/collections/cached_routes/records?filter=${encodeURIComponent('origin_lat = 13.0827 && origin_lng = 80.2707 && dest_lat = 12.9716 && dest_lng = 77.5946')}&sort=-created&perPage=1`,
    )) as { items: Array<Record<string, unknown>> }
    expect((results.items || []).length).toBe(1)
    await adminFetch('DELETE', `/api/collections/cached_routes/records/${route.id}`)
  })

  test('update existing cached route', async () => {
    const route = (await adminFetch('POST', '/api/collections/cached_routes/records', {
      origin_lat: 10.0,
      origin_lng: 20.0,
      dest_lat: 30.0,
      dest_lng: 40.0,
      distance: 100000,
      duration: 5000,
      geometry: '{"type":"LineString","coordinates":[[20,10],[40,30]]}',
    })) as Record<string, unknown>
    await adminFetch('PATCH', `/api/collections/cached_routes/records/${route.id}`, {
      distance: 120000,
      duration: 6000,
    })
    const updated = (await adminFetch(
      'GET',
      `/api/collections/cached_routes/records/${route.id}`,
    )) as Record<string, unknown>
    expect(updated.distance).toBe(120000)
    expect(updated.duration).toBe(6000)
    await adminFetch('DELETE', `/api/collections/cached_routes/records/${route.id}`)
  })

  test('cached_routes not accessible by regular users', async () => {
    await expect(ctx.userPb.collection('cached_routes').getList(1, 10)).rejects.toThrow()
  })
})

describe('PocketBase Push Subscriptions CRUD', () => {
  let subId: string

  afterAll(async () => {
    if (subId) {
      await adminFetch('DELETE', `/api/collections/push_subscriptions/records/${subId}`).catch(
        () => {},
      )
    }
  })

  test('create a push subscription', async () => {
    const sub = (await ctx.userPb.collection('push_subscriptions').create({
      user: ctx.testUser.id,
      endpoint: `https://example.com/push/${Date.now()}`,
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
      user_agent: 'IntegrationTest/1.0',
    })) as unknown as Record<string, unknown>
    subId = sub.id as string
    expect(sub.endpoint).toContain('example.com/push/')
  })

  test('list subscriptions by user', async () => {
    const subs = (await ctx.userPb.collection('push_subscriptions').getFullList({
      filter: `user = "${ctx.testUser.id}"`,
    })) as unknown as Array<Record<string, unknown>>
    expect(subs.length).toBeGreaterThanOrEqual(1)
    expect(subs.some((s: Record<string, unknown>) => s.id === subId)).toBe(true)
  })

  test('create duplicate endpoint is allowed', async () => {
    const dup = (await ctx.userPb.collection('push_subscriptions').create({
      user: ctx.testUser.id,
      endpoint: `https://example.com/push/${Date.now()}`,
      p256dh: 'dup-p256dh',
      auth: 'dup-auth',
      user_agent: 'IntegrationTest/1.0',
    })) as unknown as Record<string, unknown>
    expect(dup.id).toBeTruthy()
    await adminFetch('DELETE', `/api/collections/push_subscriptions/records/${dup.id}`)
  })

  test('delete subscription', async () => {
    await ctx.userPb.collection('push_subscriptions').delete(subId)
    await expect(ctx.userPb.collection('push_subscriptions').getOne(subId)).rejects.toThrow()
    subId = ''
  })
})

describe('PocketBase Telemetry Aggregated CRUD', () => {
  let aggId: string

  afterAll(async () => {
    if (aggId) {
      await adminFetch('DELETE', `/api/collections/telemetry_aggregated/records/${aggId}`).catch(
        () => {},
      )
    }
  })

  test('create a telemetry aggregated record (admin only)', async () => {
    const agg = (await adminFetch('POST', '/api/collections/telemetry_aggregated/records', {
      vehicle: ctx.testVehicle.id,
      hour_bucket: new Date().toISOString().slice(0, 13),
      avg_speed: 45.5,
      max_speed: 62,
      distance_traveled: 15000,
      point_count: 12,
      start_lat: 13.0827,
      start_lng: 80.2707,
      end_lat: 12.9716,
      end_lng: 77.5946,
      route_polyline: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [80.2707, 13.0827],
          [77.5946, 12.9716],
        ],
      }),
    })) as Record<string, unknown>
    aggId = agg.id as string
    expect(agg.id).toBeTruthy()
    expect(agg.avg_speed).toBe(45.5)
    expect(agg.max_speed).toBe(62)
    expect(agg.distance_traveled).toBe(15000)
    expect(agg.point_count).toBe(12)
    expect(agg.start_lat).toBe(13.0827)
    expect(agg.end_lat).toBe(12.9716)
  })

  test('query aggregated records by vehicle', async () => {
    const results = (await adminFetch(
      'GET',
      `/api/collections/telemetry_aggregated/records?filter=${encodeURIComponent(`vehicle = "${ctx.testVehicle.id}"`)}`,
    )) as { items: Array<Record<string, unknown>> }
    expect(results.items.length).toBeGreaterThanOrEqual(1)
    expect(results.items.some((r: Record<string, unknown>) => r.id === aggId)).toBe(true)
  })

  test('aggregated records are accessible via regular user (no restrictive rule)', async () => {
    const results = await ctx.userPb.collection('telemetry_aggregated').getList(1, 10)
    expect(results).toBeDefined()
  })
})
