import pb from './pocketbase'

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

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

let lastPublished: { lat: number; lng: number; vehicleId: string } | null = null

export function hasMovedSignificantly(lat: number, lng: number, vehicleId: string): boolean {
  if (!lastPublished || lastPublished.vehicleId !== vehicleId) return true
  return haversineDistance(lastPublished.lat, lastPublished.lng, lat, lng) >= DISTANCE_THRESHOLD_M
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
  lastPublished = { lat: params.lat, lng: params.lng, vehicleId: params.vehicleId }
  return result
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

export function unsubscribePositions(): void {
  if (positionUnsub) {
    positionUnsub()
    positionUnsub = null
  }
}
