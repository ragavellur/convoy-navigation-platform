import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import SearchBar from '../components/SearchBar'
import { getRoute, formatDistance, formatDuration } from '../services/osrm'
import {
  isOffRoute as checkOffRoute,
  calculateTrafficSegments,
  POSITION_CHECK_INTERVAL_MS,
} from '../services/routing'
import { useGeolocation } from '../hooks/useGeolocation'
import type { SearchResult, RouteResponse, RouteGeometry } from '../types'

const ROUTE_SOURCE_ID = 'route'
const ROUTE_LAYER_ID = 'route-line'
const TRAFFIC_SOURCE_ID = 'traffic'
const TRAFFIC_LAYER_PREFIX = 'traffic-segment-'

function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const offRouteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const routeRef = useRef<RouteResponse['routes'][0] | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapBounds, setMapBounds] = useState<[number, number, number, number] | undefined>()
  const [routeData, setRouteData] = useState<RouteResponse['routes'][0] | null>(null)
  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [isOffRoute, setIsOffRoute] = useState(false)
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null)
  const { position } = useGeolocation()

  function addRouteLayer(route: RouteResponse['routes'][0]) {
    if (!map.current) return

    if (map.current.getSource(ROUTE_SOURCE_ID)) {
      for (let i = 0; i < 20; i++) {
        const layerId = `${TRAFFIC_LAYER_PREFIX}${i}`
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId)
        }
      }
      if (map.current.getSource(TRAFFIC_SOURCE_ID)) {
        map.current.removeSource(TRAFFIC_SOURCE_ID)
      }
      map.current.removeLayer(ROUTE_LAYER_ID)
      map.current.removeSource(ROUTE_SOURCE_ID)
    }

    const geometry = route.geometry as RouteGeometry

    map.current.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry,
      },
    })

    map.current.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#6366f1',
        'line-width': 4,
        'line-opacity': 0.4,
      },
    })

    const trafficSegments = calculateTrafficSegments(geometry, route.duration, route.distance)
    const trafficFeatures = trafficSegments.map((seg) => ({
      type: 'Feature' as const,
      properties: { congestion: seg.congestion },
      geometry: {
        type: 'LineString' as const,
        coordinates: seg.coordinates,
      },
    }))

    map.current.addSource(TRAFFIC_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: trafficFeatures,
      },
    })

    trafficSegments.forEach((seg, i) => {
      map.current?.addLayer({
        id: `${TRAFFIC_LAYER_PREFIX}${i}`,
        type: 'line',
        source: TRAFFIC_SOURCE_ID,
        filter: ['==', 'congestion', seg.congestion],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': seg.color,
          'line-width': 5,
          'line-opacity': 0.9,
        },
      })
    })
  }

  function clearRouteLayers() {
    if (!map.current) return
    for (let i = 0; i < 20; i++) {
      const layerId = `${TRAFFIC_LAYER_PREFIX}${i}`
      if (map.current.getLayer(layerId)) {
        map.current.removeLayer(layerId)
      }
    }
    if (map.current.getSource(TRAFFIC_SOURCE_ID)) {
      map.current.removeSource(TRAFFIC_SOURCE_ID)
    }
    if (map.current.getSource(ROUTE_SOURCE_ID)) {
      map.current.removeLayer(ROUTE_LAYER_ID)
      map.current.removeSource(ROUTE_SOURCE_ID)
    }
  }

  function updateBounds() {
    if (!map.current) return
    const bounds = map.current.getBounds()
    setMapBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()])
  }

  const recalculateRoute = useCallback(
    async (destination: [number, number]) => {
      if (!map.current || !position) return

      const origin: [number, number] = [position.lng, position.lat]
      clearRouteLayers()

      try {
        const response = await getRoute({
          origin,
          destination,
          steps: true,
          geometries: 'geojson',
        })
        const route = response.routes[0]
        setRouteData(route)
        setRouteResponse(response)
        routeRef.current = route
        setIsOffRoute(false)

        if (map.current.loaded()) {
          addRouteLayer(route)
        }

        const bounds = new maplibregl.LngLatBounds()
        bounds.extend(origin)
        bounds.extend(destination)
        const geometry = route.geometry as RouteGeometry
        geometry.coordinates.forEach((coord) => {
          bounds.extend(coord)
        })
        map.current.fitBounds(bounds, { padding: 80, duration: 1000 })
      } catch {
        setRouteError('Could not recalculate route.')
      }
    },
    [position],
  )

  const clearRoute = useCallback(() => {
    if (offRouteTimerRef.current) {
      clearInterval(offRouteTimerRef.current)
      offRouteTimerRef.current = null
    }
    clearRouteLayers()
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    setRouteData(null)
    setRouteResponse(null)
    setRouteError(null)
    setIsOffRoute(false)
    setSelectedStepIndex(null)
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
        const response = await getRoute({
          origin,
          destination,
          steps: true,
          geometries: 'geojson',
        })
        const route = response.routes[0]
        setRouteData(route)
        setRouteResponse(response)
        routeRef.current = route

        map.current.on('load', () => addRouteLayer(route))
        if (map.current.loaded()) {
          addRouteLayer(route)
        }

        const bounds = new maplibregl.LngLatBounds()
        bounds.extend(origin)
        bounds.extend(destination)
        const geometry = route.geometry as RouteGeometry
        geometry.coordinates.forEach((coord) => {
          bounds.extend(coord)
        })
        map.current.fitBounds(bounds, { padding: 80, duration: 1500 })
      } catch {
        setRouteError('Could not calculate route. Please try again.')
        map.current.flyTo({ center: destination, zoom: 15, duration: 1500 })
      }
    },
    [position, clearRoute],
  )

  useEffect(() => {
    if (!position || !routeRef.current) return

    const geometry = routeRef.current.geometry as RouteGeometry
    const off = checkOffRoute(position.lat, position.lng, geometry)
    setIsOffRoute(off)

    return () => {}
  }, [position])

  useEffect(() => {
    if (!routeData || !position) return

    if (offRouteTimerRef.current) {
      clearInterval(offRouteTimerRef.current)
    }

    offRouteTimerRef.current = setInterval(() => {
      if (!routeRef.current || !position) return
      const geometry = routeRef.current.geometry as RouteGeometry
      const off = checkOffRoute(position.lat, position.lng, geometry)
      setIsOffRoute(off)
    }, POSITION_CHECK_INTERVAL_MS)

    return () => {
      if (offRouteTimerRef.current) {
        clearInterval(offRouteTimerRef.current)
      }
    }
  }, [routeData, position])

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [7.4266, 43.7403],
      zoom: 14,
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.current.addControl(new maplibregl.ScaleControl(), 'bottom-left')
    map.current.addControl(new maplibregl.FullscreenControl(), 'top-right')

    map.current.on('load', () => {
      setMapLoaded(true)
      updateBounds()
    })

    map.current.on('moveend', () => {
      updateBounds()
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  const firstStep = routeData?.legs[0]?.steps[0]

  return (
    <div className="relative w-full h-[calc(100vh-64px)]">
      <div ref={mapContainer} className="absolute inset-0" />
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
          <div className="mb-3">
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
    </div>
  )
}

export default MapPage
