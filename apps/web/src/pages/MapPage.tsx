import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import SearchBar from '../components/SearchBar'
import LocationPermissionPrompt from '../components/LocationPermissionPrompt'
import { getRoute, formatDistance, formatDuration } from '../services/osrm'
import {
  isOffRoute as checkOffRoute,
  calculateTrafficSegments,
  POSITION_CHECK_INTERVAL_MS,
} from '../services/routing'
import { getCachedRoute, cacheRoute } from '../services/routeCache'
import { useGeolocation } from '../hooks/useGeolocation'
import { useGeolocationStream } from '../hooks/useGeolocationStream'
import {
  publishPosition,
  subscribeToConvoyPositions,
  unsubscribePositions,
} from '../services/positionTracking'
import { MarkerAnimator } from '../services/markerAnimation'
import { createVehicleMarkerElement } from '../components/VehicleMarker'
import pb from '../services/pocketbase'
import type { SearchResult, RouteResponse, RouteGeometry } from '../types'

const ROUTE_SOURCE_ID = 'route'
const ROUTE_LAYER_ID = 'route-line'
const ALT_SOURCE_PREFIX = 'alt-route-'
const ALT_LAYER_PREFIX = 'alt-route-line-'
const TRAFFIC_SOURCE_ID = 'traffic'
const TRAFFIC_LAYER_PREFIX = 'traffic-segment-'
const VELOCITY_SOURCE_ID = 'velocity-vectors'
const VELOCITY_LAYER_ID = 'velocity-line'

function MapPage() {
  const [searchParams] = useSearchParams()
  const convoyId = searchParams.get('convoy')
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const convoyMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const offRouteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const routeRef = useRef<RouteResponse['routes'][0] | null>(null)
  const animatorRef = useRef<MarkerAnimator | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapBounds, setMapBounds] = useState<[number, number, number, number] | undefined>()
  const [routeData, setRouteData] = useState<RouteResponse['routes'][0] | null>(null)
  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [isOffRoute, setIsOffRoute] = useState(false)
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null)
  const [selectedAltIndex, setSelectedAltIndex] = useState(0)
  const [convoyPositions, setConvoyPositions] = useState<
    Map<string, { lat: number; lng: number; heading: number | null; speed: number | null }>
  >(new Map())
  const { position } = useGeolocation()
  const geoStream = useGeolocationStream(true)

  function clearAllRouteLayers() {
    if (!map.current) return
    for (let i = 0; i < 20; i++) {
      const trafficId = `${TRAFFIC_LAYER_PREFIX}${i}`
      if (map.current.getLayer(trafficId)) map.current.removeLayer(trafficId)
    }
    if (map.current.getSource(TRAFFIC_SOURCE_ID)) map.current.removeSource(TRAFFIC_SOURCE_ID)
    for (let i = 0; i < 5; i++) {
      const altLayerId = `${ALT_LAYER_PREFIX}${i}`
      const altSourceId = `${ALT_SOURCE_PREFIX}${i}`
      if (map.current.getLayer(altLayerId)) map.current.removeLayer(altLayerId)
      if (map.current.getSource(altSourceId)) map.current.removeSource(altSourceId)
    }
    if (map.current.getLayer(ROUTE_LAYER_ID)) map.current.removeLayer(ROUTE_LAYER_ID)
    if (map.current.getSource(ROUTE_SOURCE_ID)) map.current.removeSource(ROUTE_SOURCE_ID)
  }

  function renderRouteOnMap(route: RouteResponse['routes'][0], index: number) {
    if (!map.current) return
    const sourceId = index === 0 ? ROUTE_SOURCE_ID : `${ALT_SOURCE_PREFIX}${index}`
    const layerId = index === 0 ? ROUTE_LAYER_ID : `${ALT_LAYER_PREFIX}${index}`
    const geometry = route.geometry as RouteGeometry
    const isActive = index === selectedAltIndex

    map.current.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry },
    })

    if (isActive) {
      const trafficSegments = calculateTrafficSegments(geometry, route.duration, route.distance)
      const trafficFeatures = trafficSegments.map((seg) => ({
        type: 'Feature' as const,
        properties: { congestion: seg.congestion },
        geometry: { type: 'LineString' as const, coordinates: seg.coordinates },
      }))

      map.current.addSource(TRAFFIC_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: trafficFeatures },
      })

      map.current.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#6366f1', 'line-width': 4, 'line-opacity': 0.4 },
      })

      trafficSegments.forEach((seg, i) => {
        map.current?.addLayer({
          id: `${TRAFFIC_LAYER_PREFIX}${i}`,
          type: 'line',
          source: TRAFFIC_SOURCE_ID,
          filter: ['==', 'congestion', seg.congestion],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': seg.color, 'line-width': 5, 'line-opacity': 0.9 },
        })
      })
    } else {
      map.current.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#94a3b8', 'line-width': 3, 'line-opacity': 0.5 },
      })
    }
  }

  function updateBounds() {
    if (!map.current) return
    const bounds = map.current.getBounds()
    setMapBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()])
  }

  const displayRoutes = useCallback(
    (response: RouteResponse, selectedIndex: number) => {
      clearAllRouteLayers()
      response.routes.forEach((route, i) => {
        renderRouteOnMap(route, i)
      })
      const selected = response.routes[selectedIndex]
      if (selected && map.current) {
        const geometry = selected.geometry as RouteGeometry
        const bounds = new maplibregl.LngLatBounds()
        geometry.coordinates.forEach((coord) => bounds.extend(coord))
        map.current.fitBounds(bounds, { padding: 80, duration: 1000 })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedAltIndex],
  )

  const recalculateRoute = useCallback(
    async (destination: [number, number]) => {
      if (!map.current || !position) return
      const origin: [number, number] = [position.lng, position.lat]
      clearAllRouteLayers()

      try {
        const cached = await getCachedRoute(origin, destination)
        let response: RouteResponse

        if (cached) {
          response = {
            code: 'Ok',
            routes: [
              {
                geometry: JSON.parse(cached.geometry) as RouteGeometry,
                legs: routeRef.current?.legs || [],
                distance: cached.distance,
                duration: cached.duration,
                weight: cached.duration,
              },
            ],
            waypoints: [],
          }
        } else {
          response = await getRoute({ origin, destination, steps: true, geometries: 'geojson' })
          cacheRoute(
            origin,
            destination,
            response.routes[0].distance,
            response.routes[0].duration,
            JSON.stringify(response.routes[0].geometry),
            JSON.stringify(response.routes),
          )
        }

        const route = response.routes[0]
        setRouteData(route)
        setRouteResponse(response)
        routeRef.current = route
        setIsOffRoute(false)
        setSelectedAltIndex(0)

        displayRoutes(response, 0)
      } catch {
        setRouteError('Could not recalculate route.')
      }
    },
    [position, displayRoutes],
  )

  const clearRoute = useCallback(() => {
    if (offRouteTimerRef.current) {
      clearInterval(offRouteTimerRef.current)
      offRouteTimerRef.current = null
    }
    clearAllRouteLayers()
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    setRouteData(null)
    setRouteResponse(null)
    setRouteError(null)
    setIsOffRoute(false)
    setSelectedStepIndex(null)
    setSelectedAltIndex(0)
    routeRef.current = null
  }, [])

  const handleSearchResult = useCallback(
    async (result: SearchResult) => {
      if (!map.current) return
      clearRoute()

      const origin: [number, number] = position ? [position.lng, position.lat] : [2.3522, 48.8566]
      const destination: [number, number] = [result.lng, result.lat]

      const originMarker = new maplibregl.Marker({ color: '#22c55e' })
        .setLngLat(origin)
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            '<div class="p-2 text-sm font-medium">Your Location</div>',
          ),
        )
      originMarker.addTo(map.current)
      markersRef.current.push(originMarker)

      const destMarker = new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat(destination)
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div class="p-2"><div class="font-medium text-gray-900">${result.name}</div><div class="text-xs text-gray-500 mt-1">${result.displayName}</div></div>`,
          ),
        )
      destMarker.addTo(map.current)
      markersRef.current.push(destMarker)

      try {
        const cached = await getCachedRoute(origin, destination)
        let response: RouteResponse

        if (cached) {
          response = {
            code: 'Ok',
            routes: [
              {
                geometry: JSON.parse(cached.geometry) as RouteGeometry,
                legs: [],
                distance: cached.distance,
                duration: cached.duration,
                weight: cached.duration,
              },
            ],
            waypoints: [],
          }
        } else {
          response = await getRoute({ origin, destination, steps: true, geometries: 'geojson' })
          cacheRoute(
            origin,
            destination,
            response.routes[0].distance,
            response.routes[0].duration,
            JSON.stringify(response.routes[0].geometry),
            JSON.stringify(response.routes),
          )
        }

        const route = response.routes[0]
        setRouteData(route)
        setRouteResponse(response)
        routeRef.current = route
        setSelectedAltIndex(0)

        map.current.on('load', () => displayRoutes(response, 0))
        if (map.current.loaded()) {
          displayRoutes(response, 0)
        }
      } catch {
        setRouteError('Could not calculate route. Please try again.')
        map.current.flyTo({ center: destination, zoom: 15, duration: 1500 })
      }
    },
    [position, clearRoute, displayRoutes],
  )

  const selectAlternative = useCallback(
    (index: number) => {
      if (!routeResponse) return
      setSelectedAltIndex(index)
      const route = routeResponse.routes[index]
      setRouteData(route)
      routeRef.current = route
      clearAllRouteLayers()
      routeResponse.routes.forEach((r, i) => {
        renderRouteOnMap(r, i)
      })
    },
    [routeResponse],
  )

  useEffect(() => {
    if (!position || !routeRef.current) return
    const geometry = routeRef.current.geometry as RouteGeometry
    setIsOffRoute(checkOffRoute(position.lat, position.lng, geometry))
  }, [position])

  useEffect(() => {
    if (!routeData || !position) return
    if (offRouteTimerRef.current) clearInterval(offRouteTimerRef.current)
    offRouteTimerRef.current = setInterval(() => {
      if (!routeRef.current || !position) return
      const geometry = routeRef.current.geometry as RouteGeometry
      setIsOffRoute(checkOffRoute(position.lat, position.lng, geometry))
    }, POSITION_CHECK_INTERVAL_MS)
    return () => {
      if (offRouteTimerRef.current) clearInterval(offRouteTimerRef.current)
    }
  }, [routeData, position])

  useEffect(() => {
    if (!convoyId) return
    const vehicleId = pb.authStore.record?.id
    if (!vehicleId) return

    const publish = () => {
      const pos = geoStream.positionRef.current
      if (!pos) return
      publishPosition({
        vehicleId,
        convoyId,
        lat: pos.lat,
        lng: pos.lng,
        speed: pos.speed,
        heading: pos.heading,
        accuracy: pos.accuracy,
      }).catch(() => {})
    }

    publish()

    const unsub = geoStream.onPosition(() => publish())

    const heartbeat = setInterval(publish, 5000)

    return () => {
      unsub()
      clearInterval(heartbeat)
    }
  }, [convoyId])

  useEffect(() => {
    if (!convoyId) return

    import('../services/positionTracking').then(({ getLatestPositions }) => {
      getLatestPositions(convoyId).then((positions) => {
        setConvoyPositions((prev) => {
          const next = new Map(prev)
          for (const pos of positions) {
            if (!next.has(pos.vehicle)) {
              next.set(pos.vehicle, {
                lat: pos.lat,
                lng: pos.lng,
                heading: pos.heading,
                speed: pos.speed,
              })
            }
          }
          return next
        })
      })
    })

    let unsubFn: (() => void) | null = null
    subscribeToConvoyPositions(convoyId, (pos) => {
      setConvoyPositions((prev) => {
        const next = new Map(prev)
        next.set(pos.vehicle, {
          lat: pos.lat,
          lng: pos.lng,
          heading: pos.heading,
          speed: pos.speed,
        })
        return next
      })
    }).then((fn) => {
      unsubFn = fn
    })

    return () => {
      unsubFn?.()
    }
  }, [convoyId])

  useEffect(() => {
    if (!map.current || !mapLoaded) return

    if (!animatorRef.current) {
      animatorRef.current = new MarkerAnimator((id, lat, lng, heading) => {
        const marker = convoyMarkersRef.current.get(id)
        if (marker) {
          marker.setLngLat([lng, lat])
          const el = marker.getElement()
          if (heading !== null) {
            el.style.transform = `rotate(${heading}deg)`
          }
        }
      })
    }

    const vectorFeatures: GeoJSON.Feature[] = []

    convoyPositions.forEach((pos, vehicleId) => {
      animatorRef.current!.updateTarget(vehicleId, pos.lat, pos.lng, pos.heading, pos.speed)

      if (!convoyMarkersRef.current.has(vehicleId) && map.current) {
        const el = createVehicleMarkerElement('car')
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([pos.lng, pos.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(
              `<p style="font-size:12px;padding:4px;">${vehicleId.slice(0, 6)}</p>`,
            ),
          )
          .addTo(map.current)
        convoyMarkersRef.current.set(vehicleId, marker)
      }

      if (pos.heading !== null && pos.speed !== null && pos.speed > 0.5) {
        const R = 6371000
        const headingRad = (pos.heading * Math.PI) / 180
        const vectorLenM = Math.min(pos.speed * 3, 200)
        const dLat = (vectorLenM * Math.cos(headingRad)) / R
        const dLng = (vectorLenM * Math.sin(headingRad)) / (R * Math.cos((pos.lat * Math.PI) / 180))
        const endLat = pos.lat + (dLat * 180) / Math.PI
        const endLng = pos.lng + (dLng * 180) / Math.PI

        vectorFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [pos.lng, pos.lat],
              [endLng, endLat],
            ],
          },
          properties: { vehicleId },
        })
      }
    })

    const source = map.current?.getSource(VELOCITY_SOURCE_ID)
    if (source && 'setData' in source) {
      ;(source as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: vectorFeatures,
      })
    }
  }, [convoyPositions, mapLoaded])

  useEffect(() => {
    return () => {
      animatorRef.current?.destroy()
      animatorRef.current = null
      unsubscribePositions()
      convoyMarkersRef.current.forEach((m) => m.remove())
      convoyMarkersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const origWarn = console.warn
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('Expected value to be of type number'))
        return
      origWarn.apply(console, args)
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [0, 0],
      zoom: 1,
    })
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.current.addControl(new maplibregl.ScaleControl(), 'bottom-left')
    map.current.addControl(new maplibregl.FullscreenControl(), 'top-right')
    map.current.on('load', () => {
      setMapLoaded(true)
      updateBounds()
      map.current?.on('styleimagemissing', (e) => {
        const id = e.id
        if (!map.current?.hasImage(id)) {
          const canvas = document.createElement('canvas')
          canvas.width = 1
          canvas.height = 1
          map.current?.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) })
        }
      })
      map.current?.addSource(VELOCITY_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.current?.addLayer({
        id: VELOCITY_LAYER_ID,
        type: 'line',
        source: VELOCITY_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#6366f1',
          'line-width': 2,
          'line-opacity': 0.7,
        },
      })
    })
    map.current.on('moveend', () => updateBounds())
    return () => {
      console.warn = origWarn
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (position && map.current && mapLoaded) {
      map.current.flyTo({
        center: [position.lng, position.lat],
        zoom: 15,
        duration: 1500,
      })
    }
  }, [position, mapLoaded])

  const firstStep = routeData?.legs[0]?.steps[0]
  const alternatives = routeResponse?.routes || []

  return (
    <div className="relative w-full h-[calc(100vh-64px)]">
      <div ref={mapContainer} className="w-full h-full" />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
      <div className="absolute top-4 left-4 z-10">
        <SearchBar onResultSelect={handleSearchResult} mapBounds={mapBounds} />
      </div>
      {isOffRoute && routeData && (
        <div className="absolute top-20 left-4 right-4 md:left-auto md:right-4 md:w-96 z-20 bg-amber-50 border border-amber-300 rounded-lg shadow-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="h-5 w-5 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <h3 className="font-semibold text-amber-800">Off Route</h3>
          </div>
          <p className="text-sm text-amber-700 mb-3">You have deviated from the planned route.</p>
          <button
            onClick={() => {
              if (routeResponse) {
                const dest = routeResponse.waypoints[routeResponse.waypoints.length - 1]
                if (dest) recalculateRoute(dest.location)
              }
            }}
            className="w-full px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
          >
            Recalculate Route
          </button>
        </div>
      )}
      {routeData && (
        <div className="absolute top-20 left-4 z-10 bg-white rounded-lg shadow-lg p-4 max-w-sm max-h-[60vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Route Summary</h3>
            <button
              onClick={clearRoute}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Clear route"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-indigo-600">
                {formatDistance(routeData.distance)}
              </div>
              <div className="text-xs text-indigo-500 mt-0.5">Distance</div>
            </div>
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-indigo-600">
                {formatDuration(routeData.duration)}
              </div>
              <div className="text-xs text-indigo-500 mt-0.5">Duration</div>
            </div>
          </div>
          {alternatives.length > 1 && (
            <div className="mb-3 border-t border-gray-100 pt-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {alternatives.length} Routes Found
              </h4>
              <div className="space-y-2">
                {alternatives.map((alt, i) => (
                  <button
                    key={i}
                    onClick={() => selectAlternative(i)}
                    className={`w-full text-left p-2 rounded-lg text-sm border transition-colors ${
                      selectedAltIndex === i
                        ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">Route {i + 1}</span>
                      {selectedAltIndex === i && (
                        <span className="text-xs text-indigo-600 font-medium">Selected</span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                      <span>{formatDistance(alt.distance)}</span>
                      <span>{formatDuration(alt.duration)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mb-3 border-t border-gray-100 pt-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Traffic
            </h4>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-1 rounded bg-green-500 inline-block"></span> Free
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-1 rounded bg-lime-500 inline-block"></span> Light
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-1 rounded bg-amber-500 inline-block"></span> Moderate
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-1 rounded bg-red-500 inline-block"></span> Heavy
              </span>
            </div>
          </div>
          {firstStep && (
            <div className="border-t border-gray-100 pt-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Next Step
              </h4>
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                  <svg
                    className="h-4 w-4 text-indigo-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {firstStep.name || 'Continue'}
                    {firstStep.maneuver.modifier && (
                      <span className="text-gray-500"> — {firstStep.maneuver.modifier}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">{formatDistance(firstStep.distance)}</p>
                </div>
              </div>
            </div>
          )}
          {routeData.legs[0]?.steps.length > 2 && (
            <details className="border-t border-gray-100 pt-3 mt-3">
              <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700">
                {routeData.legs[0].steps.length - 1} more steps
              </summary>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {routeData.legs[0].steps.slice(1).map((step, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedStepIndex(selectedStepIndex === i ? null : i)}
                    className={`w-full text-left p-2 rounded text-sm ${
                      selectedStepIndex === i
                        ? 'bg-indigo-50 border border-indigo-200'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-gray-900">
                      {step.name || 'Continue'}
                      {step.maneuver.modifier && (
                        <span className="text-gray-500"> — {step.maneuver.modifier}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDistance(step.distance)} · {formatDuration(step.duration)}
                    </div>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
      {routeError && (
        <div className="absolute top-20 left-4 z-10 bg-red-50 border border-red-200 rounded-lg shadow-lg p-4 max-w-sm">
          <p className="text-sm text-red-600">{routeError}</p>
          <button
            onClick={() => setRouteError(null)}
            className="mt-2 text-xs text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}
      {!routeData && !routeError && (
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-sm">
          <h3 className="font-semibold text-gray-900">Convoy Map</h3>
          <p className="text-sm text-gray-600 mt-1">
            Search for a destination to calculate a route.
          </p>
        </div>
      )}
      {convoyId && (
        <LocationPermissionPrompt
          permissionState={geoStream.permissionState}
          error={geoStream.error}
          onRequestPermission={geoStream.requestPermission}
        />
      )}
    </div>
  )
}

export default MapPage
