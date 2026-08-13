import supabase from './supabaseClient'
import { haversineDistance } from './positionTracking'

export interface GpsReading {
  lat: number
  lng: number
  speed: number | null
  heading: number | null
  timestamp: number
}

interface Summary {
  avg_speed: number
  max_speed: number
  distance_traveled: number
  point_count: number
  start_lat: number
  start_lng: number
  end_lat: number
  end_lng: number
  route_polyline: string
}

const DEFAULT_INTERVAL_MS = 60000
const MAX_READINGS = 120

let aggregatorTimer: ReturnType<typeof setInterval> | null = null

const buffers = new Map<string, GpsReading[]>()

function bufferKey(vehicleId: string, convoyId: string): string {
  return `${vehicleId}::${convoyId}`
}

export function addReading(vehicleId: string, convoyId: string, reading: GpsReading): void {
  const key = bufferKey(vehicleId, convoyId)
  let buf = buffers.get(key)
  if (!buf) {
    buf = []
    buffers.set(key, buf)
  }
  buf.push(reading)
  if (buf.length > MAX_READINGS) {
    buf.shift()
  }
}

function computeSummary(readings: GpsReading[]): Summary | null {
  if (readings.length < 2) return null
  const first = readings[0]
  const last = readings[readings.length - 1]
  let totalDist = 0
  let speedSum = 0
  let speedCount = 0
  let maxSpeed = 0
  for (let i = 1; i < readings.length; i++) {
    totalDist += haversineDistance(
      readings[i - 1].lat,
      readings[i - 1].lng,
      readings[i].lat,
      readings[i].lng,
    )
    const s = readings[i].speed
    if (s != null) {
      speedSum += s
      speedCount++
      if (s > maxSpeed) maxSpeed = s
    }
  }
  const coords = readings.map((r) => [r.lng, r.lat])
  return {
    avg_speed: speedCount > 0 ? Math.round((speedSum / speedCount) * 100) / 100 : 0,
    max_speed: Math.round(maxSpeed * 100) / 100,
    distance_traveled: Math.round(totalDist),
    point_count: readings.length,
    start_lat: Math.round(first.lat * 10000) / 10000,
    start_lng: Math.round(first.lng * 10000) / 10000,
    end_lat: Math.round(last.lat * 10000) / 10000,
    end_lng: Math.round(last.lng * 10000) / 10000,
    route_polyline: JSON.stringify({ type: 'LineString', coordinates: coords }),
  }
}

export async function flushBuffer(vehicleId: string, convoyId: string): Promise<void> {
  const key = bufferKey(vehicleId, convoyId)
  const readings = buffers.get(key)
  if (!readings || readings.length === 0) return
  const summary = computeSummary(readings)
  buffers.set(key, [])
  if (!summary) return
  try {
    await supabase.from('telemetry_aggregated').upsert(
      {
        vehicle: vehicleId,
        hour_bucket: new Date().toISOString().slice(0, 13),
        ...summary,
      },
      { onConflict: 'vehicle,hour_bucket' },
    )
  } catch {
    // non-critical
  }
}

export async function flushAll(): Promise<void> {
  for (const key of buffers.keys()) {
    const [vehicleId, convoyId] = key.split('::')
    await flushBuffer(vehicleId, convoyId)
  }
}

export function startAggregation(intervalMs?: number): void {
  if (aggregatorTimer) return
  aggregatorTimer = setInterval(() => {
    flushAll().catch(() => {})
  }, intervalMs ?? DEFAULT_INTERVAL_MS)
}

export function stopAggregation(): void {
  if (aggregatorTimer) {
    clearInterval(aggregatorTimer)
    aggregatorTimer = null
  }
}

export function resetBuffers(): void {
  buffers.clear()
}
