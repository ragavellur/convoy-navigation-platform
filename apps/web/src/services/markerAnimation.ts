export interface InterpolationState {
  startLat: number
  startLng: number
  targetLat: number
  targetLng: number
  startTime: number
  durationMs: number
  heading: number | null
  speed: number | null
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(Math.max(t, 0), 1)
}

export function lerpPosition(
  startLat: number,
  startLng: number,
  targetLat: number,
  targetLng: number,
  progress: number,
): { lat: number; lng: number } {
  return {
    lat: lerp(startLat, targetLat, progress),
    lng: lerp(startLng, targetLng, progress),
  }
}

export function calculateDeadReckoning(
  lat: number,
  lng: number,
  heading: number | null,
  speed: number | null,
  elapsedMs: number,
): { lat: number; lng: number } {
  if (heading === null || speed === null || speed < 0.5) {
    return { lat, lng }
  }

  const R = 6371000
  const headingRad = (heading * Math.PI) / 180
  const distanceM = speed * (elapsedMs / 1000)
  const dLat = (distanceM * Math.cos(headingRad)) / R
  const dLng = (distanceM * Math.sin(headingRad)) / (R * Math.cos((lat * Math.PI) / 180))

  return {
    lat: lat + (dLat * 180) / Math.PI,
    lng: lng + (dLng * 180) / Math.PI,
  }
}

export class MarkerAnimator {
  private states = new Map<string, InterpolationState>()
  private animationFrame: number | null = null
  private onUpdate: (id: string, lat: number, lng: number, heading: number | null) => void
  private lastKnownPositions = new Map<
    string,
    { lat: number; lng: number; heading: number | null; speed: number | null }
  >()

  constructor(onUpdate: (id: string, lat: number, lng: number, heading: number | null) => void) {
    this.onUpdate = onUpdate
  }

  updateTarget(
    id: string,
    lat: number,
    lng: number,
    heading: number | null,
    speed: number | null,
  ): void {
    const prev = this.lastKnownPositions.get(id)
    this.lastKnownPositions.set(id, { lat, lng, heading, speed })

    if (prev && prev.lat === lat && prev.lng === lng) return

    const startLat = prev?.lat ?? lat
    const startLng = prev?.lng ?? lng
    const dist = this.haversine(startLat, startLng, lat, lng)
    const durationMs = Math.min(Math.max(dist * 10, 300), 3000)

    this.states.set(id, {
      startLat,
      startLng,
      targetLat: lat,
      targetLng: lng,
      startTime: performance.now(),
      durationMs,
      heading,
      speed,
    })

    if (!this.animationFrame) {
      this.animate()
    }
  }

  private animate = (): void => {
    const now = performance.now()
    let hasActive = false

    this.states.forEach((state, id) => {
      const elapsed = now - state.startTime
      const baseProgress = Math.min(elapsed / state.durationMs, 1)
      const eased = 1 - Math.pow(1 - baseProgress, 3)

      let pos = lerpPosition(
        state.startLat,
        state.startLng,
        state.targetLat,
        state.targetLng,
        eased,
      )

      if (baseProgress >= 1 && state.speed !== null && state.heading !== null) {
        const overshoot = elapsed - state.durationMs
        if (overshoot < 2000) {
          pos = calculateDeadReckoning(pos.lat, pos.lng, state.heading, state.speed, overshoot)
        }
      }

      this.onUpdate(id, pos.lat, pos.lng, state.heading)

      if (baseProgress < 1) {
        hasActive = true
      } else {
        this.states.delete(id)
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
    this.lastKnownPositions.clear()
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
}
