import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { harness } from './helpers/supabaseTest'

vi.mock('../supabaseClient', async () => {
  const { harness } = await import('./helpers/supabaseTest')
  return { default: harness.supabase }
})

import {
  generateShareToken,
  buildShareUrl,
  createLocationShare,
  findActiveShare,
  resolveShareToken,
  revokeShare,
  listMyShares,
} from '../shareLocation'

beforeEach(() => {
  harness.reset()
  vi.stubGlobal('window', { location: { origin: 'https://convoy.test' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('generateShareToken', () => {
  it('returns a token of the requested length', () => {
    const token = generateShareToken()
    expect(token).toHaveLength(24)
    expect(generateShareToken(32)).toHaveLength(32)
  })

  it('uses only URL-safe characters', () => {
    const token = generateShareToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateShareToken()))
    expect(tokens.size).toBe(100)
  })
})

describe('buildShareUrl', () => {
  it('builds the /s/<token> URL from the current origin', () => {
    expect(buildShareUrl('abc123')).toBe('https://convoy.test/s/abc123')
  })
})

describe('createLocationShare', () => {
  it('inserts a share row and returns token + share id', async () => {
    harness
      .mockFor('location_shares', 'insert')
      .mockResolvedValueOnce({ data: { id: 'share-1', token: 'tok123' }, error: null })
    const result = await createLocationShare('c1', 'My trip')
    expect(result).toEqual({ token: 'tok123', shareId: 'share-1' })
    const op = harness.lastOp('location_shares', 'insert')
    expect(op?.payload).toMatchObject({ convoy: 'c1', display_name: 'My trip' })
    expect(op?.payload?.token).toMatch(/^[A-Za-z0-9_-]{24}$/)
  })

  it('throws on insert error', async () => {
    harness
      .mockFor('location_shares', 'insert')
      .mockResolvedValueOnce({ data: null, error: new Error('no') })
    await expect(createLocationShare('c1')).rejects.toThrow('no')
  })
})

describe('findActiveShare', () => {
  it('returns an active share for the convoy', async () => {
    harness.mockFor('location_shares', 'select').mockResolvedValueOnce({
      data: {
        id: 'share-1',
        token: 'tok123',
        convoy: 'c1',
        display_name: 'My trip',
        status: 'active',
      },
      error: null,
    })
    const result = await findActiveShare('c1')
    expect(result).toEqual({
      id: 'share-1',
      token: 'tok123',
      convoy: 'c1',
      displayName: 'My trip',
      status: 'active',
    })
    const op = harness.lastOp('location_shares', 'select')
    expect(op?.filters).toMatchObject({ convoy: 'c1', status: 'active' })
  })

  it('returns null when no active share exists', async () => {
    harness.mockFor('location_shares', 'select').mockResolvedValueOnce({ data: null, error: null })
    expect(await findActiveShare('c1')).toBeNull()
  })
})

describe('resolveShareToken', () => {
  it('returns the resolved convoy for an active share', async () => {
    harness.mockFor('resolve_share_token', 'rpc').mockResolvedValueOnce({
      data: [
        {
          convoy: 'c1',
          convoy_name: 'Trip One',
          owner_name: 'Owner',
          phase: 'in_transit',
          display_name: null,
          status: 'active',
        },
      ],
      error: null,
    })
    const result = await resolveShareToken('tok123')
    expect(result).toEqual({
      convoy: 'c1',
      convoyName: 'Trip One',
      ownerName: 'Owner',
      phase: 'in_transit',
      displayName: null,
      status: 'active',
    })
    expect(harness.lastOp('resolve_share_token', 'rpc')?.payload).toEqual({ token: 'tok123' })
  })

  it('returns null for an unknown or revoked token', async () => {
    harness.mockFor('resolve_share_token', 'rpc').mockResolvedValueOnce({ data: [], error: null })
    expect(await resolveShareToken('badtoken')).toBeNull()
  })
})

describe('revokeShare', () => {
  it('updates the share status to revoked', async () => {
    harness.mockFor('location_shares', 'update').mockResolvedValueOnce({ data: null, error: null })
    await revokeShare('share-1')
    const op = harness.lastOp('location_shares', 'update')
    expect(op?.payload).toEqual({ status: 'revoked' })
    expect(op?.filters).toEqual({ id: 'share-1' })
  })
})

describe('listMyShares', () => {
  it('maps rows to MyShare objects', async () => {
    harness.mockFor('location_shares', 'select').mockResolvedValueOnce({
      data: [
        { id: 's1', token: 't1', convoy: 'c1', display_name: 'A', status: 'active' },
        { id: 's2', token: 't2', convoy: 'c2', display_name: null, status: 'revoked' },
      ],
      error: null,
    })
    const result = await listMyShares()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 's1',
      token: 't1',
      convoy: 'c1',
      displayName: 'A',
      status: 'active',
    })
    expect(result[1]).toEqual({
      id: 's2',
      token: 't2',
      convoy: 'c2',
      displayName: null,
      status: 'revoked',
    })
  })
})
