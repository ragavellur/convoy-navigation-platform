import { describe, it, expect } from 'vitest'
import { deriveMemberStatus, formatSpeedKmh, formatETA, haversineDistance } from '../memberStatus'
import type { Position } from '../../services/positionTracking'

function makePosition(overrides: Partial<Position> & { updated: string }): Position {
  return {
    id: '',
    vehicle: '',
    convoy: '',
    created: '',
    lat: 0,
    lng: 0,
    heading: 0,
    speed: 0,
    accuracy: 0,
    ...overrides,
  }
}

describe('deriveMemberStatus', () => {
  const now = Date.now()

  it('returns offline when position is null', () => {
    expect(deriveMemberStatus(null, now)).toBe('offline')
  })

  it('returns offline when position is stale (>30s)', () => {
    const pos = makePosition({ updated: new Date(now - 31000).toISOString() })
    expect(deriveMemberStatus(pos, now)).toBe('offline')
  })

  it('returns in-transit when speed >= 0.5', () => {
    const pos = makePosition({ speed: 1, updated: new Date(now).toISOString() })
    expect(deriveMemberStatus(pos, now)).toBe('in-transit')
  })

  it('returns stopped when speed < 0.5', () => {
    const pos = makePosition({ speed: 0.1, updated: new Date(now).toISOString() })
    expect(deriveMemberStatus(pos, now)).toBe('stopped')
  })

  it('returns stopped when speed is 0', () => {
    const pos = makePosition({ speed: 0, updated: new Date(now).toISOString() })
    expect(deriveMemberStatus(pos, now)).toBe('stopped')
  })
})

describe('formatSpeedKmh', () => {
  it('formats speed in km/h', () => {
    expect(formatSpeedKmh(10)).toBe('36 km/h')
  })

  it('returns em dash for null', () => {
    expect(formatSpeedKmh(null)).toBe('—')
  })

  it('returns em dash for undefined', () => {
    expect(formatSpeedKmh(undefined)).toBe('—')
  })
})

describe('formatETA', () => {
  it('returns em dash for null values', () => {
    expect(formatETA(null, null)).toBe('—')
  })

  it('returns em dash for 0 distance', () => {
    expect(formatETA(0, 10)).toBe('—')
  })

  it('returns seconds for < 60s', () => {
    expect(formatETA(500, 10)).toBe('50s')
  })

  it('returns minutes for < 60m', () => {
    expect(formatETA(30000, 10)).toBe('50m')
  })

  it('returns hours and minutes', () => {
    expect(formatETA(360000, 10)).toBe('10h 0m')
  })
})

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    expect(haversineDistance(12, 34, 12, 34)).toBe(0)
  })

  it('returns ~111km for 1 degree of latitude', () => {
    const dist = haversineDistance(0, 0, 1, 0)
    expect(dist).toBeGreaterThan(110_000)
    expect(dist).toBeLessThan(112_000)
  })
})
