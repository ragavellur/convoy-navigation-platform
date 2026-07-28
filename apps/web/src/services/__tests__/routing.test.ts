import { describe, it, expect } from 'vitest'
import {
  distanceBetween,
  findNearestPointOnRoute,
  isOffRoute,
  calculateTrafficSegments,
  OFF_ROUTE_THRESHOLD_METERS,
  POSITION_CHECK_INTERVAL_MS,
} from '../routing'
import type { RouteGeometry } from '../../types'

describe('distanceBetween', () => {
  it('returns 0 for same point', () => {
    expect(distanceBetween(12.34, 56.78, 12.34, 56.78)).toBe(0)
  })

  it('returns ~111km for 1 degree of latitude', () => {
    const dist = distanceBetween(0, 0, 1, 0)
    expect(dist).toBeGreaterThan(110_000)
    expect(dist).toBeLessThan(112_000)
  })

  it('is symmetric', () => {
    const d1 = distanceBetween(10, 20, 30, 40)
    const d2 = distanceBetween(30, 40, 10, 20)
    expect(d1).toBeCloseTo(d2, 5)
  })
})

describe('findNearestPointOnRoute', () => {
  it('returns distance 0 when point is exactly on a coordinate', () => {
    const route: Array<[number, number]> = [
      [0, 0],
      [1, 1],
    ]
    const result = findNearestPointOnRoute(0, 0, route)
    expect(result.distance).toBe(0)
    expect(result.index).toBe(0)
  })

  it('finds the nearest point index', () => {
    const route: Array<[number, number]> = [
      [0, 0],
      [10, 10],
    ]
    const result = findNearestPointOnRoute(9.5, 9.5, route)
    expect(result.index).toBe(1)
  })
})

describe('isOffRoute', () => {
  const geometry: RouteGeometry = {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [0, 0.01],
      [0, 0.02],
    ],
  }

  it('returns false when point is on the route', () => {
    expect(isOffRoute(0, 0, geometry)).toBe(false)
  })

  it('returns true when point is far from the route', () => {
    expect(isOffRoute(0.5, 0, geometry)).toBe(true)
  })
})

describe('calculateTrafficSegments', () => {
  const geometry: RouteGeometry = {
    type: 'LineString',
    coordinates: Array.from({ length: 100 }, (_, i) => [i * 0.01, i * 0.005] as [number, number]),
  }

  it('returns segments with valid structure', () => {
    const segments = calculateTrafficSegments(geometry, 3600, 50000)
    expect(segments.length).toBeGreaterThan(0)
    segments.forEach((seg) => {
      expect(seg.coordinates.length).toBeGreaterThan(0)
      expect(['free', 'light', 'moderate', 'heavy']).toContain(seg.congestion)
      expect(seg.color).toMatch(/^#[0-9a-f]{6}$/)
    })
  })

  it('handles single-point geometry', () => {
    const singlePointGeom: RouteGeometry = {
      type: 'LineString',
      coordinates: [[0, 0]],
    }
    const segments = calculateTrafficSegments(singlePointGeom, 100, 100)
    expect(segments.length).toBe(0)
  })

  it('calculates all congestion levels', () => {
    const singleCoord: RouteGeometry = {
      type: 'LineString',
      coordinates: [[0, 0]],
    }
    const segments = calculateTrafficSegments(singleCoord, 100, 100)
    expect(segments.length).toBe(0)
  })
})

describe('exports', () => {
  it('exports OFF_ROUTE_THRESHOLD_METERS as 50', () => {
    expect(OFF_ROUTE_THRESHOLD_METERS).toBe(50)
  })

  it('exports POSITION_CHECK_INTERVAL_MS as 3000', () => {
    expect(POSITION_CHECK_INTERVAL_MS).toBe(3000)
  })
})
