export interface LatLng {
  lat: number
  lng: number
}

export type Coord = [number, number]

export interface VehiclePlan {
  vehicleId: string
  userId: string
  memberId: string
  geometry: Coord[]
  meetingIdx: number
  speedVar: number
}

export interface SimulationPlan {
  startedAt: string
  speedFactor: number
  interval: number
  waitAtMeeting: boolean
  vehicles: VehiclePlan[]
}

export interface VehicleState {
  pos: LatLng
  idx: number
  arrived: boolean
  converged: boolean
  speed: number
}

export interface AdvanceInput {
  plan: SimulationPlan
  elapsedSec: number
  phase: string
  assembledMembers: string[]
}

export interface AdvanceOutput {
  states: VehicleState[]
  nextPhase: string
  assembledMembers: string[]
  allArrived: boolean
}

export const VEHICLE_SPEED_VARIANCE = 0.3
export const ASSEMBLY_DISTANCE_M = 80

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function coord4dp(coord: Coord): string {
  return `${Math.round(coord[1] * 10000)},${Math.round(coord[0] * 10000)}`
}

export function computeMeetingPoint(
  ownerGeom: Coord[] | null | undefined,
  otherGeoms: (Coord[] | null | undefined)[],
  fallback: LatLng,
): LatLng {
  if (!ownerGeom || ownerGeom.length < 2) return fallback
  const hashSets = otherGeoms
    .filter((g): g is Coord[] => Boolean(g && g.length >= 2))
    .map((g) => new Set(g.map(coord4dp)))
  if (hashSets.length === 0) return fallback
  for (const c of ownerGeom) {
    const h = coord4dp(c)
    if (hashSets.every((s) => s.has(h))) {
      return { lat: c[1], lng: c[0] }
    }
  }
  return fallback
}

export function findMeetingIdx(geometry: Coord[], meetingPoint: LatLng): number {
  if (!geometry || geometry.length < 2) return -1
  let best = -1
  let bestDist = Infinity
  for (let j = 0; j < geometry.length; j++) {
    const dLat = geometry[j][1] - meetingPoint.lat
    const dLng = geometry[j][0] - meetingPoint.lng
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)
    if (dist < bestDist) {
      bestDist = dist
      best = j
    }
  }
  return best
}

export function coordIndexAt(
  elapsedSec: number,
  speedFactor: number,
  interval: number,
  speedVar: number,
): number {
  const ratePerSecond = (3 * speedFactor * speedVar) / interval
  return ratePerSecond * elapsedSec
}

export function positionAt(geometry: Coord[], idx: number): LatLng {
  const last = geometry.length - 1
  if (last < 0) return { lat: 0, lng: 0 }
  if (idx >= last) return { lat: geometry[last][1], lng: geometry[last][0] }
  const i = Math.max(0, Math.floor(idx))
  const frac = idx - i
  const a = geometry[i]
  const b = geometry[i + 1]
  return {
    lat: a[1] + (b[1] - a[1]) * frac,
    lng: a[0] + (b[0] - a[0]) * frac,
  }
}

export function advanceVehicles(
  plan: SimulationPlan,
  elapsedSec: number,
  isAssembling: boolean,
): VehicleState[] {
  return plan.vehicles.map((v) => {
    const last = v.geometry.length - 1
    const capIdx = isAssembling && v.meetingIdx >= 0 ? v.meetingIdx : last
    let idx = coordIndexAt(elapsedSec, plan.speedFactor, plan.interval, v.speedVar)
    idx = Math.min(idx, capIdx)
    const arrived = idx >= last
    const converged = isAssembling && (idx >= v.meetingIdx || arrived)
    const waiting = arrived || (isAssembling && converged)
    return {
      pos: positionAt(v.geometry, idx),
      idx,
      arrived,
      converged,
      speed: waiting ? 0 : 15 * plan.speedFactor * v.speedVar,
    }
  })
}

export function advance(
  plan: SimulationPlan,
  elapsedSec: number,
  phase: string,
  assembled: string[],
): AdvanceOutput {
  if (phase === 'completed') {
    return {
      states: plan.vehicles.map((v) => ({
        pos: positionAt(v.geometry, v.geometry.length - 1),
        idx: v.geometry.length - 1,
        arrived: true,
        converged: true,
        speed: 0,
      })),
      nextPhase: 'completed',
      assembledMembers: assembled,
      allArrived: true,
    }
  }

  const isAssembling = phase === 'assembling' && plan.waitAtMeeting
  const states = advanceVehicles(plan, elapsedSec, isAssembling)

  const assembledSet = new Set(assembled)
  for (let i = 0; i < plan.vehicles.length; i++) {
    const s = states[i]
    if (s.arrived || (isAssembling && s.converged)) assembledSet.add(plan.vehicles[i].userId)
  }
  let nextAssembled = Array.from(assembledSet)
  let nextPhase = phase
  const allArrived = states.every((s) => s.arrived)

  if (phase === 'assembling' && nextAssembled.length >= plan.vehicles.length) {
    nextPhase = 'in_transit'
    nextAssembled = []
  }
  if (allArrived) {
    nextPhase = 'completed'
  }

  return {
    states,
    nextPhase,
    assembledMembers: nextAssembled,
    allArrived,
  }
}
