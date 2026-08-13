import supabase from './supabaseClient'
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

export interface MemberDisplayPosition {
  lat: number
  lng: number
  heading: number | null
  speed: number | null
}

export interface MemberPositionSource {
  vehicleId?: string
  position: Position | null
  joinLat?: number
  joinLng?: number
}

/**
 * Resolve where each convoy member should be rendered on the map.
 * In simulation mode the member is pinned to the location they joined from
 * (join_lat/join_lng) because no live GPS is being broadcast. Otherwise the
 * latest reported position is used.
 */
export function buildMemberDisplayPositions(
  members: MemberPositionSource[],
  simulationActive: boolean,
): Map<string, MemberDisplayPosition> {
  const result = new Map<string, MemberDisplayPosition>()
  for (const member of members) {
    if (!member.vehicleId) continue
    if (simulationActive) {
      if (member.joinLat == null || member.joinLng == null) continue
      result.set(member.vehicleId, {
        lat: member.joinLat,
        lng: member.joinLng,
        heading: null,
        speed: null,
      })
    } else if (member.position) {
      result.set(member.vehicleId, {
        lat: member.position.lat,
        lng: member.position.lng,
        heading: member.position.heading,
        speed: member.position.speed,
      })
    }
  }
  return result
}

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
let publishingEnabled = true

export function setPositionPublishingEnabled(enabled: boolean): void {
  publishingEnabled = enabled
  if (!enabled) {
    lastPublished = null
  }
}

export function isPositionPublishingEnabled(): boolean {
  return publishingEnabled
}

export function hasMovedSignificantly(lat: number, lng: number, vehicleId: string): boolean {
  if (!lastPublished || lastPublished.vehicleId !== vehicleId) return true
  const dist = haversineDistance(lastPublished.lat, lastPublished.lng, lat, lng)
  const elapsed = Date.now() - lastPublished.time
  return dist >= DISTANCE_THRESHOLD_M || elapsed >= MIN_PUBLISH_INTERVAL_MS
}

export function resetPositionThreshold(): void {
  lastPublished = null
}

/** Build the row payload shared by create/update paths. */
function buildPayload(params: {
  vehicleId: string
  convoyId: string
  lat: number
  lng: number
  speed?: number | null
  heading?: number | null
  accuracy?: number | null
}) {
  const data: {
    vehicle: string
    convoy: string
    lat: number
    lng: number
    speed?: number
    heading?: number
    accuracy?: number
  } = {
    vehicle: params.vehicleId,
    convoy: params.convoyId,
    lat: params.lat,
    lng: params.lng,
  }
  if (params.speed != null) data.speed = params.speed
  if (params.heading != null) data.heading = params.heading
  if (params.accuracy != null) data.accuracy = params.accuracy
  return data
}

/** Find the single position row for a (vehicle, convoy) pair. */
async function findPosition(vehicleId: string, convoyId: string): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('positions')
    .select('id')
    .eq('vehicle', vehicleId)
    .eq('convoy', convoyId)
    .maybeSingle()
  return data
}

/** Upsert the position row (positions has a unique (vehicle, convoy) index). */
async function upsertPosition(payload: {
  vehicle: string
  convoy: string
  lat: number
  lng: number
  speed?: number
  heading?: number
  accuracy?: number
}): Promise<Position> {
  const { data, error } = await supabase
    .from('positions')
    .upsert(payload, { onConflict: 'vehicle,convoy' })
    .select('*')
    .single()
  if (error) throw error
  return {
    id: data.id,
    vehicle: data.vehicle,
    convoy: data.convoy,
    lat: data.lat,
    lng: data.lng,
    speed: data.speed,
    heading: data.heading,
    accuracy: data.accuracy,
    created: data.created_at,
    updated: data.updated_at,
  }
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
  if (!publishingEnabled) {
    return null
  }

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

  const payload = buildPayload(params)

  let result: Position
  try {
    const existing = await findPosition(params.vehicleId, params.convoyId)
    if (existing) {
      const { data, error } = await supabase
        .from('positions')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) throw error
      result = {
        id: data.id,
        vehicle: data.vehicle,
        convoy: data.convoy,
        lat: data.lat,
        lng: data.lng,
        speed: data.speed,
        heading: data.heading,
        accuracy: data.accuracy,
        created: data.created_at,
        updated: data.updated_at,
      }
    } else {
      result = await upsertPosition(payload)
    }
  } catch {
    // conflict race: another client created it — upsert instead
    result = await upsertPosition(payload)
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
  if (!publishingEnabled || !navigator.onLine) return 0
  const pending = await getPendingPositions()
  let flushed = 0

  for (const pos of pending) {
    try {
      const payload = buildPayload({
        vehicleId: pos.vehicleId,
        convoyId: pos.convoyId,
        lat: pos.lat,
        lng: pos.lng,
        speed: pos.speed ?? null,
        heading: pos.heading ?? null,
        accuracy: pos.accuracy ?? null,
      })
      const existing = await findPosition(pos.vehicleId, pos.convoyId)
      if (existing) {
        await supabase.from('positions').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('positions').upsert(payload, { onConflict: 'vehicle,convoy' })
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

  const channel = supabase
    .channel(`positions-${convoyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'positions', filter: `convoy=eq.${convoyId}` },
      (payload) => {
        const row = payload.new as {
          id: string
          vehicle: string
          lat: number
          lng: number
          speed: number | null
          heading: number | null
          accuracy: number | null
          convoy: string
          created_at: string
          updated_at: string
        }
        onPosition({
          id: row.id,
          vehicle: row.vehicle,
          convoy: row.convoy,
          lat: row.lat,
          lng: row.lng,
          speed: row.speed,
          heading: row.heading,
          accuracy: row.accuracy,
          created: row.created_at,
          updated: row.updated_at,
        })
      },
    )
    .subscribe()

  positionUnsub = () => {
    void supabase.removeChannel(channel)
    positionUnsub = null
  }

  return positionUnsub
}

export async function getLatestPositions(convoyId: string): Promise<Position[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('id, vehicle, convoy, lat, lng, heading, speed, accuracy, created_at, updated_at')
    .eq('convoy', convoyId)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    vehicle: row.vehicle,
    convoy: row.convoy,
    lat: row.lat,
    lng: row.lng,
    speed: row.speed,
    heading: row.heading,
    accuracy: row.accuracy,
    created: row.created_at,
    updated: row.updated_at,
  }))
}

export function startHeartbeat(vehicleId: string, convoyId: string): void {
  stopHeartbeat()
  heartbeatVehicleId = vehicleId
  heartbeatConvoyId = convoyId
  heartbeatTimer = setInterval(async () => {
    if (!publishingEnabled || !heartbeatVehicleId || !heartbeatConvoyId) return
    resetPositionThreshold()
    try {
      const { data } = await supabase
        .from('positions')
        .select('lat, lng, speed, heading, accuracy')
        .eq('vehicle', heartbeatVehicleId)
        .eq('convoy', heartbeatConvoyId)
        .maybeSingle()
      if (data) {
        await publishPosition({
          vehicleId: heartbeatVehicleId,
          convoyId: heartbeatConvoyId,
          lat: data.lat,
          lng: data.lng,
          speed: data.speed,
          heading: data.heading,
          accuracy: data.accuracy,
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
