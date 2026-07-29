import { useState, useEffect, useCallback, useRef } from 'react'
import { classifyMovement, getPollingConfig, type MovementState } from '../services/adaptivePolling'

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

function getWatchOptions(state: MovementState): PositionOptions {
  const config = getPollingConfig(state)
  return {
    enableHighAccuracy: state !== 'stationary',
    maximumAge: config.intervalMs,
    timeout: 30000,
  }
}

export function useGeolocationStream(options?: { isInConvoy?: boolean }) {
  const isInConvoy = options?.isInConvoy ?? false

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
  const movementStateRef = useRef<MovementState>('stationary')
  const prevPosRef = useRef<{ lat: number; lng: number } | null>(null)
  const watchOptionsRef = useRef<PositionOptions>(getWatchOptions('stationary'))
  const permissionRef = useRef<PermissionState>(state.permissionState)
  const handleSuccessRef = useRef<(pos: GeolocationPosition) => void>(() => {})
  const handleErrorRef = useRef<(err: GeolocationPositionError) => void>(() => {})

  const onPosition = useCallback((callback: (pos: GeoPosition) => void) => {
    listenersRef.current.push(callback)
    return () => {
      listenersRef.current = listenersRef.current.filter((l) => l !== callback)
    }
  }, [])

  const restartWatcher = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccessRef.current,
      handleErrorRef.current,
      watchOptionsRef.current,
    )
  }, [])

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      hasStartedRef.current = false
    }
  }, [])

  const startWatching = useCallback(() => {
    if (!isGeolocationSupported || hasStartedRef.current) return
    hasStartedRef.current = true
    setState((prev) => ({ ...prev, permissionState: 'requesting', error: null }))
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccessRef.current,
      handleErrorRef.current,
      watchOptionsRef.current,
    )
  }, [])

  const requestPermission = useCallback(() => {
    hasStartedRef.current = false
    stopWatching()
    startWatching()
  }, [stopWatching, startWatching])

  useEffect(() => {
    handleSuccessRef.current = (pos: GeolocationPosition) => {
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
      permissionRef.current = 'granted'
      listenersRef.current.forEach((l) => l(newPos))

      const newState = classifyMovement(
        pos.coords.speed ?? null,
        prevPosRef.current?.lat ?? null,
        prevPosRef.current?.lng ?? null,
        pos.coords.latitude,
        pos.coords.longitude,
      )

      prevPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }

      if (newState !== movementStateRef.current) {
        movementStateRef.current = newState
        watchOptionsRef.current = getWatchOptions(newState)
        restartWatcher()
      }
    }

    handleErrorRef.current = (err: GeolocationPositionError) => {
      if (err.code === err.POSITION_UNAVAILABLE) return
      let permissionState: PermissionState = 'denied'
      let error = 'Location access denied'
      if (err.code === err.TIMEOUT) {
        permissionState = 'timeout'
        error = 'Location request timed out'
      }
      setState((prev) => ({ ...prev, permissionState, error }))
    }
  }, [restartWatcher])

  useEffect(() => {
    if (previouslyGranted || isGeolocationSupported) {
      startWatching()
    }
    return () => stopWatching()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isInConvoy) return
    return () => {}
  }, [isInConvoy])

  return {
    ...state,
    positionRef,
    onPosition,
    startWatching,
    stopWatching,
    requestPermission,
  }
}
