import { useState, useEffect } from 'react'
import type { Position } from '../types'

interface GeolocationState {
  position: Position | null
  error: string | null
  loading: boolean
}

const isGeolocationSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator

export function useGeolocation(enableHighAccuracy = false): GeolocationState {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: isGeolocationSupported ? null : 'Geolocation not supported',
    loading: isGeolocationSupported,
  })

  useEffect(() => {
    if (!isGeolocationSupported) return

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading: pos.coords.heading ?? undefined,
            speed: pos.coords.speed ?? undefined,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          },
          error: null,
          loading: false,
        })
      },
      () => {
        setState((prev) => ({ ...prev, loading: false }))
      },
      { enableHighAccuracy, maximumAge: 10000, timeout: 15000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [enableHighAccuracy])

  return state
}
