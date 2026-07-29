const STALE_MS = 25000

interface InterpState {
  startLat: number
  startLng: number
  targetLat: number
  targetLng: number
  startTime: number
  durationMs: number
}

interface VehicleState {
  currentLat: number
  currentLng: number
  heading: number | null
  speed: number | null
  lastUpdateTime: number
  routeGeometry: [number, number][] | null
  routeIndex: number
  interp: InterpState | null
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(Math.max(t, 0), 1)
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function findNearestRouteIndex(route: [number, number][], lat: number, lng: number): number {
  let bestDist = Infinity
  let bestIdx = 0
  for (let i = 0; i < route.length; i++) {
    const d = haversine(lat, lng, route[i][1], route[i][0])
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return bestIdx
}

function walkRouteForward(
  route: [number, number][],
  fromIndex: number,
  distanceM: number,
): { lat: number; lng: number; index: number } {
  if (route.length < 2) {
    return { lat: route[0]?.[1] ?? 0, lng: route[0]?.[0] ?? 0, index: 0 }
  }

  let remaining = distanceM
  let i = Math.floor(fromIndex)

  if (i >= route.length - 1) {
    const last = route[route.length - 1]
    return { lat: last[1], lng: last[0], index: route.length - 1 }
  }

  while (remaining > 0 && i < route.length - 1) {
    const segLen = haversine(route[i][1], route[i][0], route[i + 1][1], route[i + 1][0])
    if (segLen <= 0) {
      i++
      continue
    }
    if (segLen >= remaining) {
      const frac = remaining / segLen
      const lat = lerp(route[i][1], route[i + 1][1], frac)
      const lng = lerp(route[i][0], route[i + 1][0], frac)
      return { lat, lng, index: i + frac }
    }
    remaining -= segLen
    i++
  }

  const last = route[route.length - 1]
  return { lat: last[1], lng: last[0], index: route.length - 1 }
}

export class MarkerAnimator {
  private states = new Map<string, VehicleState>()
  private animationFrame: number | null = null
  private onUpdate: (id: string, lat: number, lng: number, heading: number | null) => void

  constructor(onUpdate: (id: string, lat: number, lng: number, heading: number | null) => void) {
    this.onUpdate = onUpdate
  }

  updateTarget(
    id: string,
    lat: number,
    lng: number,
    heading: number | null,
    speed: number | null,
    routeGeometry?: [number, number][] | null,
  ): void {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    const now = performance.now()
    let state = this.states.get(id)

    if (!state) {
      const routeGeo = routeGeometry ?? null
      state = {
        currentLat: lat,
        currentLng: lng,
        heading,
        speed,
        lastUpdateTime: now,
        routeGeometry: routeGeo as [number, number][] | null,
        routeIndex: routeGeo ? findNearestRouteIndex(routeGeo, lat, lng) : 0,
        interp: null,
      }
      this.states.set(id, state)
      this.onUpdate(id, lat, lng, heading)
      this.startAnimation()
      return
    }

    const fromLat = state.currentLat
    const fromLng = state.currentLng
    const fromRouteIndex = state.routeIndex

    state.lastUpdateTime = now
    state.heading = heading
    state.speed = speed
    if (routeGeometry) {
      state.routeGeometry = routeGeometry as [number, number][]
    }

    const newRouteIndex = state.routeGeometry
      ? findNearestRouteIndex(state.routeGeometry, lat, lng)
      : 0

    state.routeIndex = newRouteIndex
    state.interp = null

    const dist = haversine(fromLat, fromLng, lat, lng)

    if (dist < 0.5) {
      state.currentLat = lat
      state.currentLng = lng
      this.onUpdate(id, lat, lng, heading)
      this.startAnimation()
      return
    }

    const isBehind = state.routeGeometry !== null && newRouteIndex < fromRouteIndex - 2

    if (isBehind && dist > 3) {
      state.currentLat = fromLat
      state.currentLng = fromLng
      const durationMs = Math.min(Math.max((dist / 5) * 1000, 500), 5000)
      state.interp = {
        startLat: fromLat,
        startLng: fromLng,
        targetLat: lat,
        targetLng: lng,
        startTime: now,
        durationMs,
      }
    } else {
      state.currentLat = fromLat
      state.currentLng = fromLng
      const durationMs = Math.min(Math.max(dist * 50, 200), 2000)
      state.interp = {
        startLat: fromLat,
        startLng: fromLng,
        targetLat: lat,
        targetLng: lng,
        startTime: now,
        durationMs,
      }
    }

    this.startAnimation()
  }

  private startAnimation(): void {
    if (!this.animationFrame) {
      this.animationFrame = requestAnimationFrame(this.animate)
    }
  }

  private animate = (): void => {
    const now = performance.now()
    let hasActive = false

    this.states.forEach((state, id) => {
      if (state.interp) {
        const elapsed = now - state.interp.startTime
        const progress = Math.min(elapsed / state.interp.durationMs, 1)
        const eased = 1 - Math.pow(1 - progress, 3)

        state.currentLat = lerp(state.interp.startLat, state.interp.targetLat, eased)
        state.currentLng = lerp(state.interp.startLng, state.interp.targetLng, eased)

        if (progress >= 1) {
          state.interp = null
          state.lastUpdateTime = now
        } else {
          hasActive = true
        }
      }

      if (!state.interp) {
        const elapsedSinceUpdate = now - state.lastUpdateTime

        if (
          state.speed !== null &&
          state.speed > 0.5 &&
          state.routeGeometry !== null &&
          state.routeGeometry.length > 1 &&
          elapsedSinceUpdate < STALE_MS
        ) {
          const elapsedSec = elapsedSinceUpdate / 1000
          const distanceM = state.speed * elapsedSec

          if (distanceM > 0.05) {
            const result = walkRouteForward(state.routeGeometry, state.routeIndex, distanceM)
            state.currentLat = result.lat
            state.currentLng = result.lng
            state.routeIndex = result.index
            hasActive = true
          }
        }
      }

      if (Number.isFinite(state.currentLat) && Number.isFinite(state.currentLng)) {
        this.onUpdate(id, state.currentLat, state.currentLng, state.heading)
      }
    })

    if (hasActive) {
      this.animationFrame = requestAnimationFrame(this.animate)
    } else {
      this.animationFrame = null
    }
  }

  destroy(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
    this.states.clear()
  }
}
