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
}

let positionUnsub: (() => void) | null = null

export async function publishPosition(params: {
  vehicleId: string
  convoyId: string
  lat: number
  lng: number
  speed?: number | null
  heading?: number | null
  accuracy?: number | null
}): Promise<Position> {
  const data: Record<string, unknown> = {
    vehicle: params.vehicleId,
    convoy: params.convoyId,
    lat: params.lat,
    lng: params.lng,
  }
  if (params.speed != null) data.speed = params.speed
  if (params.heading != null) data.heading = params.heading
  if (params.accuracy != null) data.accuracy = params.accuracy
  return pb.collection('positions').create(data)
}

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
  const all = await pb.collection('positions').getFullList<Position>({
    filter: `convoy = "${convoyId}"`,
    sort: '-created',
  })
  const seen = new Map<string, Position>()
  for (const pos of all) {
    if (!seen.has(pos.vehicle)) {
      seen.set(pos.vehicle, pos)
    }
  }
  return Array.from(seen.values())
}

export function unsubscribePositions(): void {
  if (positionUnsub) {
    positionUnsub()
    positionUnsub = null
  }
}
