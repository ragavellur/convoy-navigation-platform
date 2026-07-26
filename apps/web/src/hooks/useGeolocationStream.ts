import { useState, useEffect, useCallback, useRef } from 'react'

export type PermissionState =
  'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'timeout'

export interface GeoPosition {
  lat: number
  lng: number
  heading: number | null
  speed: number | null
  accuracy: number
  timestamp: number
}

interface GeolocationStreamState {
  permissionState: PermissionState
  error: string | null
}

const isGeolocationSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator

export function useGeolocationStream(enableHighAccuracy = true) {
  const [state, setState] = useState<GeolocationStreamState>({
    permissionState: isGeolocationSupported ? 'idle' : 'unavailable',
    error: isGeolocationSupported ? null : 'Geolocation not supported',
  })
  const watchIdRef = useRef<number | null>(null)
  const positionRef = useRef<GeoPosition | null>(null)
  const listenersRef = useRef<((pos: GeoPosition) => void)[]>([])

  const onPosition = useCallback((callback: (pos: GeoPosition) => void) => {
    listenersRef.current.push(callback)
    return () => {
      listenersRef.current = listenersRef.current.filter((l) => l !== callback)
    }
  }, [])

  const startWatching = useCallback(() => {
    if (!isGeolocationSupported) return

    setState((prev) => ({ ...prev, permissionState: 'requesting', error: null }))

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos: GeoPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed ?? null,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }
        positionRef.current = newPos
        setState((prev) => ({ ...prev, permissionState: 'granted', error: null }))
        listenersRef.current.forEach((l) => l(newPos))
      },
      (err) => {
        let permissionState: PermissionState = 'denied'
        let error = 'Location access denied'

        if (err.code === err.TIMEOUT) {
          permissionState = 'timeout'
          error = 'Location request timed out'
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          error = 'Location information unavailable'
        }

        setState((prev) => ({ ...prev, permissionState, error }))
      },
      { enableHighAccuracy, maximumAge: 5000, timeout: 30000 },
    )
  }, [enableHighAccuracy])

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const requestPermission = useCallback(() => {
    stopWatching()
    startWatching()
  }, [startWatching, stopWatching])

  useEffect(() => {
    return () => stopWatching()
  }, [stopWatching])

  return {
    ...state,
    positionRef,
    onPosition,
    startWatching,
    stopWatching,
    requestPermission,
  }
}
