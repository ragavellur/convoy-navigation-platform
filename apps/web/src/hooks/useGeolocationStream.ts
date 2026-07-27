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
const STORAGE_KEY = 'convoy_geo_permission'

export function useGeolocationStream(enableHighAccuracy = true) {
  const previouslyGranted =
    typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'granted'

  const [state, setState] = useState<GeolocationStreamState>({
    permissionState: previouslyGranted
      ? 'granted'
      : isGeolocationSupported
        ? 'idle'
        : 'unavailable',
    error: isGeolocationSupported ? null : 'Geolocation not supported',
  })
  const watchIdRef = useRef<number | null>(null)
  const positionRef = useRef<GeoPosition | null>(null)
  const listenersRef = useRef<((pos: GeoPosition) => void)[]>([])
  const hasStartedRef = useRef(false)

  const onPosition = useCallback((callback: (pos: GeoPosition) => void) => {
    listenersRef.current.push(callback)
    return () => {
      listenersRef.current = listenersRef.current.filter((l) => l !== callback)
    }
  }, [])

  const startWatching = useCallback(() => {
    if (!isGeolocationSupported || hasStartedRef.current) return
    hasStartedRef.current = true

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
        localStorage.setItem(STORAGE_KEY, 'granted')
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
      hasStartedRef.current = false
    }
  }, [])

  const requestPermission = useCallback(() => {
    hasStartedRef.current = false
    stopWatching()
    startWatching()
  }, [startWatching, stopWatching])

  useEffect(() => {
    if (previouslyGranted || isGeolocationSupported) {
      startWatching()
    }
    return () => stopWatching()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    positionRef,
    onPosition,
    startWatching,
    stopWatching,
    requestPermission,
  }
}
