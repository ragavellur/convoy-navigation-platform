import PocketBase from 'pocketbase'
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import {
  PB_URL,
  ADMIN_EMAIL,
  ADMIN_PASS,
  checkService,
  globalSetup,
  globalTeardown,
  getCtx,
  TestContext,
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

describe('PocketBase Auth Integration', () => {
  test('admin can authenticate with valid credentials', async () => {
    const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASS }),
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.token).toBeTruthy()
    expect(data.record.email).toBe(ADMIN_EMAIL)
  })

  test('admin auth fails with wrong password', async () => {
    const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: ADMIN_EMAIL, password: 'wrong-password-123' }),
    })
    expect(res.ok).toBe(false)
  })

  test('admin auth fails with non-existent email', async () => {
    const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: 'nonexistent@test.com', password: 'somepass' }),
    })
    expect(res.ok).toBe(false)
  })

  test('user can register with valid data', async () => {
    const email = `register-test-${Date.now()}@example.com`
    const res = await fetch(`${PB_URL}/api/collections/users/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getCtx().adminToken}`,
      },
      body: JSON.stringify({
        email,
        password: 'RegTestPass123!',
        passwordConfirm: 'RegTestPass123!',
        name: 'Register Test User',
        role: 'member',
        status: 'active',
      }),
    })
    expect(res.ok).toBe(true)
    const record = await res.json()
    expect(record.id).toBeTruthy()
    expect(record.email).toBe(email)

    await fetch(`${PB_URL}/api/collections/users/records/${record.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getCtx().adminToken}` },
    })
  })

  test('user registration fails with duplicate email', async () => {
    await expect(
      new PocketBase(PB_URL).collection('users').create({
        email: ctx.testUser.email,
        password: 'AnotherPass123!',
        passwordConfirm: 'AnotherPass123!',
        name: 'Duplicate User',
      }),
    ).rejects.toThrow()
  })

  test('user can login with correct credentials', async () => {
    const pb = new PocketBase(PB_URL)
    await pb.collection('users').authWithPassword(ctx.testUser.email, ctx.testUser.password)
    expect(pb.authStore.isValid).toBe(true)
    expect(pb.authStore.token).toBeTruthy()
    expect(pb.authStore.record?.id).toBe(ctx.testUser.id)
  })

  test('user login fails with wrong password', async () => {
    const pb = new PocketBase(PB_URL)
    await expect(
      pb.collection('users').authWithPassword(ctx.testUser.email, 'wrong-password'),
    ).rejects.toThrow()
  })

  test('user login fails with non-existent email', async () => {
    const pb = new PocketBase(PB_URL)
    await expect(
      pb.collection('users').authWithPassword('does-not-exist@test.com', 'somepass'),
    ).rejects.toThrow()
  })

  test('authenticated user can list convoys', async () => {
    const result = await ctx.userPb.collection('convoys').getList(1, 10, {
      filter: `id = "${ctx.testConvoy.id}"`,
    })
    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items[0].id).toBe(ctx.testConvoy.id)
  })

  test('auth token persists across new client instances', async () => {
    const newPb = new PocketBase(PB_URL)
    newPb.authStore.save(ctx.userPb.authStore.token, ctx.userPb.authStore.record)
    expect(newPb.authStore.isValid).toBe(true)
    const result = await newPb.collection('convoys').getOne(ctx.testConvoy.id)
    expect(result.id).toBe(ctx.testConvoy.id)
  })

  test('user can logout and auth store clears', async () => {
    const pb = new PocketBase(PB_URL)
    await pb.collection('users').authWithPassword(ctx.testUser.email, ctx.testUser.password)
    expect(pb.authStore.isValid).toBe(true)
    pb.authStore.clear()
    expect(pb.authStore.isValid).toBe(false)
    expect(pb.authStore.token).toBe('')
  })

  test('unauthenticated request to protected create rule fails', async () => {
    const anonPb = new PocketBase(PB_URL)
    await expect(
      anonPb.collection('convoys').create({
        name: 'Should Fail',
        code: 'FAIL01',
        owner: 'nonexistent',
        status: 'active',
        convoy_type: 'vehicle',
        trip_id: 'int-test',
        security_token: 'test-token',
      }),
    ).rejects.toThrow()
  })
})
