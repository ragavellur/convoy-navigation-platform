import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import SearchBar from '../components/SearchBar'
import { getRoute, formatDistance, formatDuration } from '../services/osrm'
import { useGeolocation } from '../hooks/useGeolocation'
import type { SearchResult, RouteResponse, RouteGeometry } from '../types'

const ROUTE_SOURCE_ID = 'route'
const ROUTE_LAYER_ID = 'route-line'

function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapBounds, setMapBounds] = useState<[number, number, number, number] | undefined>()
  const [routeData, setRouteData] = useState<RouteResponse['routes'][0] | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const { position } = useGeolocation()

  function addRouteLayer(route: RouteResponse['routes'][0]) {
    if (!map.current) return

    if (map.current.getSource(ROUTE_SOURCE_ID)) {
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
        'line-opacity': 0.8,
      },
    })
  }

  function updateBounds() {
    if (!map.current) return
    const bounds = map.current.getBounds()
    setMapBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()])
  }

  const clearRoute = useCallback(() => {
    if (!map.current) return
    if (map.current.getSource(ROUTE_SOURCE_ID)) {
      map.current.removeLayer(ROUTE_LAYER_ID)
      map.current.removeSource(ROUTE_SOURCE_ID)
    }
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    setRouteData(null)
    setRouteError(null)
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
      {routeData && (
        <div className="absolute top-20 left-4 z-10 bg-white rounded-lg shadow-lg p-4 max-w-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900">Route</h3>
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
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Distance:</span>
              <span className="font-medium text-gray-900">
                {formatDistance(routeData.distance)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Duration:</span>
              <span className="font-medium text-gray-900">
                {formatDuration(routeData.duration)}
              </span>
            </div>
          </div>
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
