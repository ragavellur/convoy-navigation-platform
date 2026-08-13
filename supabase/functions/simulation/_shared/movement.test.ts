import { describe, it, expect } from 'vitest'
import {
  advance,
  computeMeetingPoint,
  coordIndexAt,
  findMeetingIdx,
  haversineKm,
  positionAt,
  type SimulationPlan,
  type VehiclePlan,
} from './movement'

function makeVehicle(
  userId: string,
  meetingIdx: number,
  speedVar: number,
  geometry: [number, number][] = [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
): VehiclePlan {
  return {
    vehicleId: `v-${userId}`,
    userId,
    memberId: `m-${userId}`,
    geometry,
    meetingIdx,
    speedVar,
  }
}

function makePlan(vehicles: VehiclePlan[]): SimulationPlan {
  return {
    startedAt: '2026-08-13T00:00:00.000Z',
    speedFactor: 10,
    interval: 2,
    waitAtMeeting: true,
    vehicles,
  }
}

describe('coordIndexAt', () => {
  it('advances 3 * speedFactor * speedVar per interval', () => {
    const ratePerSecond = (3 * 10 * 1) / 2
    expect(coordIndexAt(2, 10, 2, 1)).toBeCloseTo(ratePerSecond * 2)
    expect(coordIndexAt(0, 10, 2, 1)).toBe(0)
  })

  it('scales by speed variance and interval', () => {
    expect(coordIndexAt(4, 10, 2, 1.3)).toBeCloseTo(((3 * 10 * 1.3) / 2) * 4)
    expect(coordIndexAt(4, 20, 1, 1)).toBeCloseTo(3 * 20 * 4)
  })
})

describe('positionAt', () => {
  it('returns first coordinate at idx 0', () => {
    expect(
      positionAt(
        [
          [0, 1],
          [1, 2],
        ],
        0,
      ),
    ).toEqual({ lat: 1, lng: 0 })
  })

  it('interpolates fractional indices', () => {
    expect(
      positionAt(
        [
          [0, 0],
          [2, 2],
        ],
        0.5,
      ),
    ).toEqual({ lat: 1, lng: 1 })
  })

  it('clamps to last coordinate at the end', () => {
    expect(
      positionAt(
        [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
        5,
      ),
    ).toEqual({ lat: 2, lng: 2 })
  })
})

describe('computeMeetingPoint', () => {
  const ownerGeom = [
    [0, 0],
    [1, 1],
    [2, 2],
  ]

  it('finds the first coordinate shared with all members', () => {
    const other = [
      [0, 0],
      [1, 1],
      [5, 5],
    ]
    expect(computeMeetingPoint(ownerGeom, [other], { lat: 99, lng: 99 })).toEqual({
      lat: 0,
      lng: 0,
    })
  })

  it('falls back when no shared coordinate exists', () => {
    const other = [
      [9, 9],
      [8, 8],
    ]
    expect(computeMeetingPoint(ownerGeom, [other], { lat: 2, lng: 2 })).toEqual({ lat: 2, lng: 2 })
  })

  it('falls back when owner geometry is missing', () => {
    expect(computeMeetingPoint(null, [[[0, 0]]], { lat: 3, lng: 3 })).toEqual({ lat: 3, lng: 3 })
  })
})

describe('findMeetingIdx', () => {
  it('finds nearest index to the meeting point', () => {
    const geometry = [
      [0, 0],
      [1, 1],
      [2, 2],
    ]
    expect(findMeetingIdx(geometry, { lat: 1.05, lng: 1.05 })).toBe(1)
    expect(findMeetingIdx(geometry, { lat: 99, lng: 99 })).toBe(2)
  })
})

describe('haversineKm', () => {
  it('computes zero distance for identical points', () => {
    expect(haversineKm(18.5, 73.9, 18.5, 73.9)).toBe(0)
  })

  it('computes approximate distance between Pune and Mumbai', () => {
    const km = haversineKm(18.5204, 73.8567, 19.076, 72.8777)
    expect(km).toBeGreaterThan(100)
    expect(km).toBeLessThan(160)
  })
})

describe('advance', () => {
  const longGeometry: [number, number][] = Array.from({ length: 21 }, (_, i) => [i * 0.1, i * 0.1])

  it('caps vehicles at the meeting index during assembling', () => {
    const plan = makePlan([makeVehicle('a', 1, 1), makeVehicle('b', 15, 1.3, longGeometry)])
    const out = advance(plan, 0.5, 'assembling', [])
    expect(out.states[0].pos).toEqual({ lat: 1, lng: 1 })
    expect(out.states[0].arrived).toBe(false)
    expect(out.states[0].converged).toBe(true)
    expect(out.states[1].converged).toBe(false)
    expect(out.assembledMembers).toEqual(['a'])
  })

  it('transitions to in_transit once all members assembled', () => {
    const plan = makePlan([makeVehicle('a', 1, 1), makeVehicle('b', 1, 1.3)])
    const out = advance(plan, 1000, 'assembling', [])
    expect(out.nextPhase).toBe('in_transit')
    expect(out.assembledMembers).toEqual([])
  })

  it('continues past the meeting point in in_transit', () => {
    const plan = makePlan([makeVehicle('a', 1, 1)])
    const out = advance(plan, 1000, 'in_transit', [])
    expect(out.states[0].arrived).toBe(true)
    expect(out.nextPhase).toBe('completed')
  })

  it('does not cap during assembling when waitAtMeeting is off', () => {
    const plan = makePlan([makeVehicle('a', 1, 1)])
    plan.waitAtMeeting = false
    const out = advance(plan, 1000, 'assembling', [])
    expect(out.states[0].arrived).toBe(true)
    expect(out.nextPhase).toBe('completed')
  })

  it('returns completed without advancing when already completed', () => {
    const plan = makePlan([makeVehicle('a', 1, 1)])
    const out = advance(plan, 0, 'completed', [])
    expect(out.nextPhase).toBe('completed')
    expect(out.allArrived).toBe(true)
    expect(out.states[0].speed).toBe(0)
  })

  it('stops vehicles once arrived (speed 0)', () => {
    const plan = makePlan([makeVehicle('a', 1, 1)])
    const out = advance(plan, 1000, 'in_transit', [])
    expect(out.states[0].speed).toBe(0)
  })

  it('keeps previously assembled members in the set', () => {
    const plan = makePlan([makeVehicle('a', 1, 1), makeVehicle('b', 15, 1.3, longGeometry)])
    const out = advance(plan, 0.5, 'assembling', ['a'])
    expect(out.assembledMembers).toContain('a')
    expect(out.assembledMembers).not.toContain('b')
  })
})
