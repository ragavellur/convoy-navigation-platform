import pb from './pocketbase'
import { queuePendingPosition, getPendingPositions, removePendingPosition } from '../lib/db'
import { addReading, startAggregation, flushAll as flushTelemetry } from './telemetryAggregator'

export interface Position {
  id: string
  vehicle: string
  lat: number
  lng: number
  speed: number | null
  heading: number | null
  accuracy: number | null
  convoy: string
  created: string
  updated: string
}

const DISTANCE_THRESHOLD_M = 75
const MIN_PUBLISH_INTERVAL_MS = 3000
const TELEMETRY_INTERVAL_MS = 60000

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

let lastPublished: { lat: number; lng: number; vehicleId: string; time: number } | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let heartbeatVehicleId: string | null = null
let heartbeatConvoyId: string | null = null

export function hasMovedSignificantly(lat: number, lng: number, vehicleId: string): boolean {
  if (!lastPublished || lastPublished.vehicleId !== vehicleId) return true
  const dist = haversineDistance(lastPublished.lat, lastPublished.lng, lat, lng)
  const elapsed = Date.now() - lastPublished.time
  return dist >= DISTANCE_THRESHOLD_M || elapsed >= MIN_PUBLISH_INTERVAL_MS
}

export function resetPositionThreshold(): void {
  lastPublished = null
}

export async function publishPosition(params: {
  vehicleId: string
  convoyId: string
  lat: number
  lng: number
  speed?: number | null
  heading?: number | null
  accuracy?: number | null
}): Promise<Position | null> {
  if (!hasMovedSignificantly(params.lat, params.lng, params.vehicleId)) {
    return null
  }

  if (!navigator.onLine) {
    await queuePendingPosition({
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      vehicleId: params.vehicleId,
      convoyId: params.convoyId,
      lat: params.lat,
      lng: params.lng,
      speed: params.speed ?? undefined,
      heading: params.heading ?? undefined,
      accuracy: params.accuracy ?? undefined,
      timestamp: new Date().toISOString(),
    })
    lastPublished = {
      lat: params.lat,
      lng: params.lng,
      vehicleId: params.vehicleId,
      time: Date.now(),
    }
    return null
  }

  const data: Record<string, unknown> = {
    vehicle: params.vehicleId,
    convoy: params.convoyId,
    lat: params.lat,
    lng: params.lng,
  }
  if (params.speed != null) data.speed = params.speed
  if (params.heading != null) data.heading = params.heading
  if (params.accuracy != null) data.accuracy = params.accuracy

  let existing: Position | null = null
  try {
    existing = await pb
      .collection('positions')
      .getFirstListItem<Position>(
        `vehicle = "${params.vehicleId}" && convoy = "${params.convoyId}"`,
      )
  } catch {
    // not found — will create below
  }

  let result: Position
  if (existing) {
    result = (await pb.collection('positions').update(existing.id, data)) as unknown as Position
  } else {
    result = (await pb.collection('positions').create(data)) as unknown as Position
  }
  startAggregation(TELEMETRY_INTERVAL_MS)
  addReading(params.vehicleId, params.convoyId, {
    lat: params.lat,
    lng: params.lng,
    speed: params.speed ?? null,
    heading: params.heading ?? null,
    timestamp: Date.now(),
  })
  lastPublished = {
    lat: params.lat,
    lng: params.lng,
    vehicleId: params.vehicleId,
    time: Date.now(),
  }
  return result
}

export async function flushPendingPositions(): Promise<number> {
  if (!navigator.onLine) return 0
  const pending = await getPendingPositions()
  let flushed = 0

  for (const pos of pending) {
    try {
      const data: Record<string, unknown> = {
        vehicle: pos.vehicleId,
        convoy: pos.convoyId,
        lat: pos.lat,
        lng: pos.lng,
      }
      if (pos.speed != null) data.speed = pos.speed
      if (pos.heading != null) data.heading = pos.heading
      if (pos.accuracy != null) data.accuracy = pos.accuracy

      let existing: Position | null = null
      try {
        existing = await pb
          .collection('positions')
          .getFirstListItem<Position>(`vehicle = "${pos.vehicleId}" && convoy = "${pos.convoyId}"`)
      } catch {
        // not found
      }

      if (existing) {
        await pb.collection('positions').update(existing.id, data)
      } else {
        await pb.collection('positions').create(data)
      }
      await removePendingPosition(pos.id)
      flushed++
    } catch {
      // keep in queue for next attempt
    }
  }
  if (flushed > 0) {
    await flushTelemetry().catch(() => {})
  }
  return flushed
}

let positionUnsub: (() => void) | null = null

export async function subscribeToConvoyPositions(
  convoyId: string,
  onPosition: (position: Position) => void,
): Promise<() => void> {
  if (positionUnsub) {
    positionUnsub()
    positionUnsub = null
  }

  const unsub = await pb.collection('positions').subscribe('*', (event) => {
    if (event.record.convoy !== convoyId) return
    onPosition(event.record as unknown as Position)
  })

  positionUnsub = () => {
    unsub()
    positionUnsub = null
  }

  return positionUnsub
}

export async function getLatestPositions(convoyId: string): Promise<Position[]> {
  const result = await pb.collection('positions').getList<Position>(1, 50, {
    filter: `convoy = "${convoyId}"`,
    fields: 'id,vehicle,lat,lng,heading,speed,updated,created',
    requestKey: null,
  })
  return result.items
}

export function startHeartbeat(vehicleId: string, convoyId: string): void {
  stopHeartbeat()
  heartbeatVehicleId = vehicleId
  heartbeatConvoyId = convoyId
  heartbeatTimer = setInterval(async () => {
    if (!heartbeatVehicleId || !heartbeatConvoyId) return
    resetPositionThreshold()
    try {
      const record = await pb
        .collection('positions')
        .getFirstListItem<{
          lat: number
          lng: number
          speed: number | null
          heading: number | null
          accuracy: number | null
        }>(`vehicle = "${heartbeatVehicleId}" && convoy = "${heartbeatConvoyId}"`)
        .catch(() => null)
      if (record) {
        await publishPosition({
          vehicleId: heartbeatVehicleId,
          convoyId: heartbeatConvoyId,
          lat: record.lat,
          lng: record.lng,
          speed: record.speed,
          heading: record.heading,
          accuracy: record.accuracy,
        })
      }
    } catch {
      /* heartbeat publish failure is non-critical */
    }
  }, 15_000)
}

export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  heartbeatVehicleId = null
  heartbeatConvoyId = null
}

export function unsubscribePositions(): void {
  if (positionUnsub) {
    positionUnsub()
    positionUnsub = null
  }
}
