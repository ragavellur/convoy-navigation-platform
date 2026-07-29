import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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
  unsubscribePositions,
  resetPositionThreshold,
  startHeartbeat,
  stopHeartbeat,
} from '../services/positionTracking'
import { MarkerAnimator } from '../services/markerAnimation'
import { createVehicleMarkerElement, getDistinctColor } from '../components/VehicleMarker'
import pb from '../services/pocketbase'
import { useConvoyRoster, haversineDistance } from '../stores/ConvoyRosterContext'
import { useTheme, getMapStyleUrl } from '../stores/ThemeContext'
import { notifyOffRoute } from '../services/pushSender'
import { clearAssemblyPoint } from '../services/sessionState'
import { calculateAssemblyPoint } from '../services/simulation'
import { useAssemblyRoutes } from '../hooks/useAssemblyRoutes'
import type { AssemblyRoute } from '../services/assemblyRoutes'
import type { SearchResult, RouteResponse, RouteGeometry } from '../types'

const ROUTE_SOURCE_ID = 'route'
const ROUTE_LAYER_ID = 'route-line'
const ALT_SOURCE_PREFIX = 'alt-route-'
const ALT_LAYER_PREFIX = 'alt-route-line-'
const TRAFFIC_SOURCE_ID = 'traffic'
const TRAFFIC_LAYER_PREFIX = 'traffic-segment-'
const VELOCITY_SOURCE_ID = 'velocity-vectors'
const VELOCITY_LAYER_ID = 'velocity-line'
const ASSEMBLY_SOURCE_PREFIX = 'assembly-route-'
const ASSEMBLY_LAYER_PREFIX = 'assembly-route-line-'

const ASSEMBLY_THRESHOLD_M = 100

const ASSEMBLY_ROUTE_COLORS = [
  '#f59e0b',
  '#10b981',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#84cc16',
  '#a855f7',
]

function MapPage() {
  const [searchParams] = useSearchParams()
  const convoyId = searchParams.get('convoy')
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const previewMarkerRef = useRef<maplibregl.Marker | null>(null)
  const convoyMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const joinMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const offRouteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const routeRef = useRef<RouteResponse['routes'][0] | null>(null)
  const animatorRef = useRef<MarkerAnimator | null>(null)

  const routeResponseRef = useRef<RouteResponse | null>(null)
  const assemblyRoutesDataRef = useRef<AssemblyRoute[]>([])
  const vectorFeaturesRef = useRef<GeoJSON.Feature[]>([])
  const meetingPointRef = useRef<{ lat: number; lng: number } | null>(null)
  const simActiveRef = useRef(false)
  const userVehicleIdRef = useRef<string | null>(null)

  const offRoutePushSentRef = useRef(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapBounds, setMapBounds] = useState<[number, number, number, number] | undefined>()
  const [routeData, setRouteData] = useState<RouteResponse['routes'][0] | null>(null)
  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [isOffRoute, setIsOffRoute] = useState(false)
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null)
  const [selectedAltIndex, setSelectedAltIndex] = useState(0)
  const [showRoutePanel, setShowRoutePanel] = useState(true)
  const [convoyPositions, setConvoyPositions] = useState<
    Map<string, { lat: number; lng: number; heading: number | null; speed: number | null }>
  >(new Map())
  const [simActive, setSimActive] = useState(false)
  const [convoyType, setConvoyType] = useState<'vehicle' | 'trekker'>('vehicle')
  const [convoyPhase, setConvoyPhase] = useState<string>('forming')
  const [convoyOwner, setConvoyOwner] = useState<string | null>(null)
  const [assembledMembers, setAssembledMembers] = useState<string[]>([])
  const [assemblyPoint, setAssemblyPoint] = useState<{ lat: number; lng: number } | null>(null)

  const { position } = useGeolocation()
  const geoStream = useGeolocationStream({ isInConvoy: !!convoyId })
  const { members, focusMemberId, joinConvoy, leaveConvoy } = useConvoyRoster()
  const computedAssemblyPoint: { lat: number; lng: number } | null = useMemo(() => {
    return assemblyPoint
  }, [assemblyPoint])
  const { theme } = useTheme()

  const memberVehicleMap = useRef<Map<string, { type: string; name: string; color?: string }>>(
    new Map(),
  )
  const mapViewRestoredRef = useRef(false)
  const selectedAltIndexRef = useRef(selectedAltIndex)

  useEffect(() => {
    selectedAltIndexRef.current = selectedAltIndex
  }, [selectedAltIndex])

  useEffect(() => {
    meetingPointRef.current = computedAssemblyPoint
  }, [computedAssemblyPoint])

  useEffect(() => {
    simActiveRef.current = simActive
  }, [simActive])

  const MAP_VIEW_KEY = 'convoy-map-view'

  function safeRemoveSource(m: maplibregl.Map, id: string) {
    try {
      if (m.getSource(id)) m.removeSource(id)
    } catch {
      /* source may not exist */
    }
  }
  function safeRemoveLayer(m: maplibregl.Map, id: string) {
    try {
      if (m.getLayer(id)) m.removeLayer(id)
    } catch {
      /* layer may not exist */
    }
  }

  function clearAllRouteLayers() {
    const m = map.current
    if (!m) return

    const allLayers = m.getStyle().layers || []
    for (const layer of allLayers) {
      if (
        layer.id.startsWith(TRAFFIC_LAYER_PREFIX) ||
        layer.id.startsWith(ALT_LAYER_PREFIX) ||
        layer.id.endsWith('-dash') ||
        layer.id === ROUTE_LAYER_ID
      ) {
        safeRemoveLayer(m, layer.id)
      }
    }
    ;[TRAFFIC_SOURCE_ID, ROUTE_SOURCE_ID].forEach((sid) => {
      for (let i = 0; i < 5; i++) {
        safeRemoveSource(m, `${ALT_SOURCE_PREFIX}${i}`)
        safeRemoveSource(m, `${ALT_SOURCE_PREFIX}${i}-dash`)
      }
      safeRemoveSource(m, `${sid}-dash`)
      safeRemoveSource(m, sid)
    })
  }

  function findSplitIdx(coords: [number, number][], point: { lat: number; lng: number }): number {
    let minDist = Infinity
    let idx = 0
    for (let i = 0; i < coords.length; i++) {
      const d = Math.abs(coords[i][0] - point.lng) + Math.abs(coords[i][1] - point.lat)
      if (d < minDist) {
        minDist = d
        idx = i
      }
    }
    return idx
  }

  function renderRouteOnMap(
    route: RouteResponse['routes'][0],
    index: number,
    activeIndex?: number,
  ) {
    if (!map.current) return
    const sourceId = index === 0 ? ROUTE_SOURCE_ID : `${ALT_SOURCE_PREFIX}${index}`
    const layerId = index === 0 ? ROUTE_LAYER_ID : `${ALT_LAYER_PREFIX}${index}`
    const geometry = route.geometry as RouteGeometry
    const isActive = index === (activeIndex ?? selectedAltIndex)

    safeRemoveSource(map.current, sourceId)
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

      for (const layer of map.current.getStyle().layers || []) {
        if ('source' in layer && (layer as { source: string }).source === TRAFFIC_SOURCE_ID) {
          safeRemoveLayer(map.current!, layer.id)
        }
      }
      safeRemoveSource(map.current, TRAFFIC_SOURCE_ID)
      map.current.addSource(TRAFFIC_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: trafficFeatures },
      })

      safeRemoveLayer(map.current, layerId)
      map.current.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#6366f1', 'line-width': 4, 'line-opacity': 0.4 },
      })

      trafficSegments.forEach((seg, i) => {
        const tId = `${TRAFFIC_LAYER_PREFIX}${i}`
        safeRemoveLayer(map.current!, tId)
        map.current?.addLayer({
          id: tId,
          type: 'line',
          source: TRAFFIC_SOURCE_ID,
          filter: ['==', 'congestion', seg.congestion],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': seg.color, 'line-width': 5, 'line-opacity': 0.9 },
        })
      })

      const mp = meetingPointRef.current
      if (mp && geometry.coordinates.length > 2) {
        const splitIdx = findSplitIdx(geometry.coordinates as [number, number][], mp)
        if (splitIdx > 0) {
          const dasSourceId = sourceId + '-dash'
          const dasLayerId = layerId + '-dash'
          const beforeCoords = geometry.coordinates.slice(0, splitIdx + 1)
          safeRemoveSource(map.current, dasSourceId)
          safeRemoveLayer(map.current, dasLayerId)
          map.current.addSource(dasSourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: beforeCoords },
            },
          })
          map.current.addLayer({
            id: dasLayerId,
            type: 'line',
            source: dasSourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#6366f1',
              'line-width': 4,
              'line-opacity': 0.7,
              'line-dasharray': [3, 2],
            },
          })
        }
      }
    } else {
      safeRemoveLayer(map.current, layerId)
      map.current.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#94a3b8', 'line-width': 3, 'line-opacity': 0.5 },
      })
    }
  }

  function clearAssemblyRouteLayers() {
    if (!map.current) return
    for (let i = 0; i < 20; i++) {
      safeRemoveLayer(map.current, `${ASSEMBLY_LAYER_PREFIX}${i}`)
      safeRemoveSource(map.current, `${ASSEMBLY_SOURCE_PREFIX}${i}`)
    }
  }

  function renderAssemblyRouteOnMap(route: AssemblyRoute['route'], color: string, index: number) {
    if (!map.current) return
    const sourceId = `${ASSEMBLY_SOURCE_PREFIX}${index}`
    const layerId = `${ASSEMBLY_LAYER_PREFIX}${index}`
    const geometry = route.geometry as RouteGeometry

    safeRemoveSource(map.current, sourceId)
    map.current.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry },
    })

    safeRemoveLayer(map.current, layerId)
    map.current.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': color,
        'line-width': 3,
        'line-opacity': 0.7,
        'line-dasharray': [3, 2],
      },
    })
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
          response = await getRoute({
            origin,
            destination,
            steps: true,
            geometries: 'geojson',
            profile: convoyType === 'trekker' ? 'foot' : 'driving',
          })
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setRouteError(`Could not recalculate route: ${msg}`)
        setTimeout(() => {
          if (!map.current || !position) return
          const origin: [number, number] = [position.lng, position.lat]
          getRoute({
            origin,
            destination,
            steps: true,
            geometries: 'geojson',
            profile: convoyType === 'trekker' ? 'foot' : 'driving',
          })
            .then((response) => {
              const route = response.routes[0]
              setRouteData(route)
              setRouteResponse(response)
              routeRef.current = route
              setIsOffRoute(false)
              setSelectedAltIndex(0)
              displayRoutes(response, 0)
              setRouteError(null)
            })
            .catch(() => {})
        }, 3000)
      }
    },
    [position, displayRoutes, convoyType],
  )

  useEffect(() => {
    if (!convoyId) return
    let vehicleId: string | null = null

    const init = async () => {
      try {
        const userId = pb.authStore.record?.id
        if (!userId) return
        const memberRecord = await pb
          .collection('convoy_members')
          .getFirstListItem(`convoy = "${convoyId}" && user = "${userId}" && status = "active"`, {
            expand: 'vehicle',
          })
        vehicleId = memberRecord.vehicle || null
        if (vehicleId) {
          startHeartbeat(vehicleId, convoyId)
        }
      } catch {
        /* vehicle not found */
      }
    }

    init()

    return () => {
      stopHeartbeat()
    }
  }, [convoyId])

  const hideRoutePanel = useCallback(() => {
    setShowRoutePanel(false)
  }, [])

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
    setShowRoutePanel(true)
    routeRef.current = null
  }, [])

  const handleHoverResult = useCallback((result: SearchResult | null) => {
    if (!map.current) return
    if (previewMarkerRef.current) {
      previewMarkerRef.current.remove()
      previewMarkerRef.current = null
    }
    if (result) {
      const marker = new maplibregl.Marker({ color: '#f59e0b', scale: 1.2 })
        .setLngLat([result.lng, result.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div class="p-2 text-sm font-medium">${result.name}</div>`,
          ),
        )
      marker.addTo(map.current)
      previewMarkerRef.current = marker
    }
  }, [])

  const handleSearchResult = useCallback(
    async (result: SearchResult) => {
      if (!map.current) return
      clearRoute()

      if (previewMarkerRef.current) {
        previewMarkerRef.current.remove()
        previewMarkerRef.current = null
      }

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
            `<div class="p-2"><div class="font-medium" style="color:var(--text)">${result.name}</div><div class="text-xs mt-1" style="color:var(--text2)">${result.displayName}</div></div>`,
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
          response = await getRoute({
            origin,
            destination,
            steps: true,
            geometries: 'geojson',
            profile: convoyType === 'trekker' ? 'foot' : 'driving',
          })
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
    const effectivePos =
      simActiveRef.current && userVehicleIdRef.current
        ? (convoyPositions.get(userVehicleIdRef.current) ?? null)
        : null
    const pos = effectivePos ?? position
    if (!pos || !routeRef.current) return
    const geometry = routeRef.current.geometry as RouteGeometry
    const offNow = checkOffRoute(pos.lat, pos.lng, geometry)
    setIsOffRoute(offNow)
    if (offNow && convoyId && !offRoutePushSentRef.current) {
      offRoutePushSentRef.current = true
      notifyOffRoute(convoyId, pb.authStore.model?.name || 'A member')
    }
    if (!offNow) offRoutePushSentRef.current = false
  }, [position, convoyId, simActive, convoyPositions, routeRef])

  useEffect(() => {
    if (!routeData || !position) return
    if (offRouteTimerRef.current) clearInterval(offRouteTimerRef.current)
    offRouteTimerRef.current = setInterval(() => {
      const effectivePos =
        simActiveRef.current && userVehicleIdRef.current
          ? (convoyPositions.get(userVehicleIdRef.current) ?? null)
          : null
      const pos = effectivePos ?? position
      if (!routeRef.current || !pos) return
      const geometry = routeRef.current.geometry as RouteGeometry
      const offNow = checkOffRoute(pos.lat, pos.lng, geometry)
      setIsOffRoute(offNow)
      if (offNow && convoyId && !offRoutePushSentRef.current) {
        offRoutePushSentRef.current = true
        notifyOffRoute(convoyId, pb.authStore.model?.name || 'A member')
      }
      if (!offNow) offRoutePushSentRef.current = false
    }, POSITION_CHECK_INTERVAL_MS)
    return () => {
      if (offRouteTimerRef.current) clearInterval(offRouteTimerRef.current)
    }
  }, [routeData, position, convoyId, simActive, convoyPositions])

  useEffect(() => {
    if (!convoyId) return

    let vehicleId: string | null = null
    let simulationActive = false

    const resolveVehicleId = async () => {
      try {
        const userId = pb.authStore.record?.id
        if (!userId) {
          vehicleId = null
          userVehicleIdRef.current = null
          return
        }
        const memberRecord = await pb
          .collection('convoy_members')
          .getFirstListItem(`convoy = "${convoyId}" && user = "${userId}" && status = "active"`, {
            expand: 'vehicle',
          })
        vehicleId = memberRecord.vehicle || null
        userVehicleIdRef.current = vehicleId
      } catch {
        vehicleId = null
        userVehicleIdRef.current = null
      }
    }

    const checkSimulation = async () => {
      try {
        const convoy = await pb.collection('convoys').getOne(convoyId)
        const settings =
          typeof convoy.settings === 'string' ? JSON.parse(convoy.settings) : convoy.settings || {}
        simulationActive = !!settings.simulation_active
        setSimActive(simulationActive)
        setConvoyType(convoy.convoy_type || 'vehicle')
      } catch {
        simulationActive = false
      }
    }

    const init = async () => {
      await Promise.all([resolveVehicleId(), checkSimulation()])
    }

    init()

    const unsubSim = pb.collection('convoys').subscribe(convoyId, (event) => {
      const settings =
        typeof event.record.settings === 'string'
          ? JSON.parse(event.record.settings)
          : event.record.settings || {}
      simulationActive = !!settings.simulation_active
      setSimActive(simulationActive)
    })

    const publish = async () => {
      if (simulationActive) return
      if (!vehicleId) {
        await resolveVehicleId()
      }
      if (!vehicleId) return
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

    return () => {
      unsub()
      unsubSim.then?.((fn: (() => void) | undefined) => fn?.())
    }
  }, [convoyId])

  useEffect(() => {
    if (!convoyId) return

    const fetchConvoy = async () => {
      try {
        const convoy = await pb.collection('convoys').getOne(convoyId)
        setConvoyPhase(convoy.phase || 'forming')
        setConvoyOwner(convoy.owner)
        setAssembledMembers(convoy.assembled_members || [])
        if (convoy.source_lat && convoy.source_lng) {
          setAssemblyPoint({ lat: convoy.source_lat, lng: convoy.source_lng })
        }
      } catch {
        /* ignore */
      }
    }

    fetchConvoy()

    let unsubFn: (() => void) | null = null
    pb.collection('convoys')
      .subscribe(convoyId, (event) => {
        const r = event.record
        setConvoyPhase(r.phase || 'forming')
        setConvoyOwner(r.owner)
        setAssembledMembers(r.assembled_members || [])
        if (r.source_lat && r.source_lng) {
          setAssemblyPoint({ lat: r.source_lat, lng: r.source_lng })
        }
      })
      .then((fn) => {
        unsubFn = fn
      })

    return () => {
      unsubFn?.()
    }
  }, [convoyId])

  useEffect(() => {
    if (!convoyId) {
      leaveConvoy()
      return
    }
    resetPositionThreshold()
    joinConvoy(convoyId)
    return () => {
      leaveConvoy()
      resetPositionThreshold()
    }
  }, [convoyId, joinConvoy, leaveConvoy])

  useEffect(() => {
    memberVehicleMap.current.clear()
    for (const m of members) {
      if (m.vehicleId) {
        memberVehicleMap.current.set(m.vehicleId, {
          type: m.vehicleType ?? 'car',
          name: m.userName,
          color: m.vehicleColor,
        })
      }
    }
  }, [members])

  useEffect(() => {
    if (!focusMemberId || !map.current) return
    const member = members.find((m) => m.id === focusMemberId)
    if (!member?.vehicleId) return

    convoyMarkersRef.current.forEach((marker, vid) => {
      const el = marker.getElement()
      if (vid === member.vehicleId) {
        el.style.boxShadow = '0 0 0 3px #fff, 0 0 0 6px #6366f1, 0 2px 8px rgba(0,0,0,0.4)'
        el.style.zIndex = '50'
        el.style.width = '44px'
        el.style.height = '44px'
        marker.addTo(map.current!)
      } else {
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
        el.style.zIndex = ''
        el.style.width = '36px'
        el.style.height = '36px'
      }
    })

    if (member.position) {
      map.current.flyTo({
        center: [member.position.lng, member.position.lat],
        zoom: 16,
        essential: true,
      })
    }
  }, [focusMemberId, members])

  useEffect(() => {
    if (focusMemberId) return
    convoyMarkersRef.current.forEach((marker) => {
      const el = marker.getElement()
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
      el.style.zIndex = ''
      el.style.width = '36px'
      el.style.height = '36px'
    })
  }, [focusMemberId])

  useEffect(() => {
    if (!convoyId) return

    convoyMarkersRef.current.forEach((m) => m.remove())
    convoyMarkersRef.current.clear()
    animatorRef.current?.destroy()
    animatorRef.current = null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset when convoyId changes
    setConvoyPositions(new Map())

    let cancelled = false

    const poll = async () => {
      try {
        const { getLatestPositions } = await import('../services/positionTracking')
        if (cancelled) return
        const positions = await getLatestPositions(convoyId)
        if (cancelled) return
        setConvoyPositions(() => {
          const next = new Map<
            string,
            { lat: number; lng: number; heading: number | null; speed: number | null }
          >()
          for (const pos of positions) {
            if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) continue
            next.set(pos.vehicle, {
              lat: pos.lat,
              lng: pos.lng,
              heading: pos.heading,
              speed: pos.speed,
            })
          }
          return next
        })
      } catch {
        // ignore poll errors
      }
    }

    poll()
    const intervalId = setInterval(poll, 4000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [convoyId])

  useEffect(() => {
    if (!map.current || !mapLoaded) return

    if (!animatorRef.current) {
      animatorRef.current = new MarkerAnimator((id, lat, lng, heading) => {
        const marker = convoyMarkersRef.current.get(id)
        if (marker) {
          marker.setLngLat([lng, lat])
          if (heading !== null) {
            marker.setRotation(heading)
          }
        }
      })
    }

    const vectorFeatures: GeoJSON.Feature[] = []

    const vehicleIds = Array.from(convoyPositions.keys())
    const positionGroups = new Map<string, string[]>()
    for (const vid of vehicleIds) {
      const pos = convoyPositions.get(vid)!
      const key = `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}`
      if (!positionGroups.has(key)) positionGroups.set(key, [])
      positionGroups.get(key)!.push(vid)
    }

    convoyPositions.forEach((pos, vehicleId) => {
      if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return

      const key = `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}`
      const group = positionGroups.get(key)!
      let offsetLat = pos.lat
      let offsetLng = pos.lng
      if (group.length > 1) {
        const idx = group.indexOf(vehicleId)
        const angle = (idx / group.length) * 2 * Math.PI
        const offsetMeters = 15
        const R = 6371000
        offsetLat = pos.lat + ((offsetMeters * Math.cos(angle)) / R) * (180 / Math.PI)
        offsetLng =
          pos.lng +
          ((offsetMeters * Math.sin(angle)) / (R * Math.cos((pos.lat * Math.PI) / 180))) *
            (180 / Math.PI)
      }

      if (!convoyMarkersRef.current.has(vehicleId) && map.current) {
        const vehicleInfo = memberVehicleMap.current.get(vehicleId)
        const vehicleType =
          (vehicleInfo?.type as 'car' | 'truck' | 'motorcycle' | 'other' | 'trekker') ?? 'car'
        const color = getDistinctColor(vehicleId, vehicleInfo?.color)
        const el = createVehicleMarkerElement(vehicleType, color)
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([offsetLng, offsetLat])
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(
              `<p style="font-size:12px;padding:4px;font-weight:500;">${vehicleInfo?.name ?? vehicleId.slice(0, 6)}</p>`,
            ),
          )
          .addTo(map.current)
        el.addEventListener('click', () => {
          if (map.current) {
            const current = marker.getLngLat()
            map.current.flyTo({ center: [current.lng, current.lat], zoom: 16, duration: 800 })
          }
        })
        convoyMarkersRef.current.set(vehicleId, marker)
      }

      animatorRef.current!.updateTarget(vehicleId, offsetLat, offsetLng, pos.heading, pos.speed)

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

    vectorFeaturesRef.current = vectorFeatures

    const source = map.current?.getSource(VELOCITY_SOURCE_ID)
    if (!source || !('setData' in source)) {
      safeRemoveSource(map.current!, VELOCITY_SOURCE_ID)
      safeRemoveLayer(map.current!, VELOCITY_LAYER_ID)
      map.current?.addSource(VELOCITY_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: vectorFeatures },
      })
      map.current?.addLayer({
        id: VELOCITY_LAYER_ID,
        type: 'line',
        source: VELOCITY_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#6366f1', 'line-width': 2, 'line-opacity': 0.7 },
      })
    } else {
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
      joinMarkersRef.current.forEach((m) => m.remove())
      joinMarkersRef.current.clear()
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

    const saved = localStorage.getItem(MAP_VIEW_KEY)
    let initialCenter: [number, number] = [0, 0]
    let initialZoom = convoyId ? 12 : 1
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        initialCenter = [parsed.lng, parsed.lat]
        initialZoom = parsed.zoom
        mapViewRestoredRef.current = true
      } catch {
        // ignore invalid saved state
      }
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapStyleUrl(theme),
      center: initialCenter,
      zoom: initialZoom,
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
    map.current.on('moveend', () => {
      updateBounds()
      const c = map.current?.getCenter()
      const z = map.current?.getZoom()
      if (c && z !== undefined) {
        localStorage.setItem(MAP_VIEW_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: z }))
      }
    })
    map.current.on('style.load', () => {
      const m = map.current
      if (!m) return

      safeRemoveSource(m, VELOCITY_SOURCE_ID)
      safeRemoveLayer(m, VELOCITY_LAYER_ID)
      m.addSource(VELOCITY_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: vectorFeaturesRef.current },
      })
      m.addLayer({
        id: VELOCITY_LAYER_ID,
        type: 'line',
        source: VELOCITY_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#6366f1', 'line-width': 2, 'line-opacity': 0.7 },
      })

      if (routeResponseRef.current) {
        clearAllRouteLayers()
        routeResponseRef.current.routes.forEach((r, i) =>
          renderRouteOnMap(r, i, selectedAltIndexRef.current),
        )
      }

      clearAssemblyRouteLayers()
      assemblyRoutesDataRef.current.forEach((ar, i) => {
        const color = ar.vehicleColor || ASSEMBLY_ROUTE_COLORS[i % ASSEMBLY_ROUTE_COLORS.length]
        renderAssemblyRouteOnMap(ar.route, color, i)
      })
    })
    return () => {
      console.warn = origWarn
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (map.current && mapLoaded) {
      const center = map.current.getCenter()
      const zoom = map.current.getZoom()
      const pitch = map.current.getPitch()
      const bearing = map.current.getBearing()
      map.current.setStyle(getMapStyleUrl(theme))
      map.current.once('style.load', () => {
        try {
          map.current?.setCenter(center)
          map.current?.setZoom(zoom)
          map.current?.setPitch(pitch)
          map.current?.setBearing(bearing)
        } catch {
          /* setStyle may not preserve transform */
        }
      })
    }
  }, [theme, mapLoaded])

  useEffect(() => {
    if (!position || !mapLoaded || !map.current || convoyId) return
    if (mapViewRestoredRef.current) return
    const center = map.current.getCenter()
    const isAtDefault = center.lat === 0 && center.lng === 0
    if (isAtDefault) {
      map.current.flyTo({
        center: [position.lng, position.lat],
        zoom: 18,
        duration: 2000,
      })
      mapViewRestoredRef.current = true
    }
  }, [position, mapLoaded, convoyId])

  useEffect(() => {
    if (!convoyId || !mapLoaded || !map.current) return

    let cancelled = false

    const loadConvoyRoute = async () => {
      try {
        const convoy = await pb.collection('convoys').getOne(convoyId)
        if (cancelled) return
        if (
          convoy.source_lat == null ||
          convoy.source_lng == null ||
          convoy.dest_lat == null ||
          convoy.dest_lng == null
        )
          return

        clearAllRouteLayers()

        for (const marker of markersRef.current) marker.remove()
        markersRef.current = []

        const meetingPoint: [number, number] = [convoy.source_lng, convoy.source_lat]
        const destination: [number, number] = [convoy.dest_lng, convoy.dest_lat]

        const sourceMarker = new maplibregl.Marker({ color: '#22c55e' })
          .setLngLat(meetingPoint)
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(
              `<div class="p-2 text-sm font-medium">${convoy.source_name || 'Meeting point'}</div>`,
            ),
          )
        sourceMarker.addTo(map.current!)
        markersRef.current.push(sourceMarker)

        const destMarker = new maplibregl.Marker({ color: '#ef4444' })
          .setLngLat(destination)
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(
              `<div class="p-2 text-sm font-medium">${convoy.dest_name || 'Destination'}</div>`,
            ),
          )
        destMarker.addTo(map.current!)
        markersRef.current.push(destMarker)

        let origin = meetingPoint
        const userId = pb.authStore.record?.id
        if (userId) {
          try {
            const member = await pb
              .collection('convoy_members')
              .getFirstListItem(`convoy = "${convoyId}" && user = "${userId}" && status = "active"`)
            if (member.join_lat != null && member.join_lng != null) {
              origin = [member.join_lng, member.join_lat]
            }
          } catch {
            // Member fetch failed — fallback to meeting point
          }
        }

        const response = await getRoute({
          origin,
          destination,
          steps: true,
          geometries: 'geojson',
          profile: convoyType === 'trekker' ? 'foot' : 'driving',
        })
        if (cancelled) return
        const route = response.routes[0]
        setRouteData(route)
        setRouteResponse(response)
        routeResponseRef.current = response
        routeRef.current = route
        setSelectedAltIndex(0)

        response.routes.forEach((r, i) => {
          renderRouteOnMap(r, i)
        })

        const coords = (route.geometry as RouteGeometry).coordinates as [number, number][]
        if (coords.length > 0 && routeData === null) {
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0]),
          )
          map.current!.fitBounds(bounds, { padding: 60, duration: 1000 })
        }
      } catch {
        // Route calculation failed
      }
    }

    loadConvoyRoute()
    return () => {
      cancelled = true
    }
  }, [convoyId, mapLoaded, convoyPhase])

  const ownerUserId = convoyOwner
  const { routes: assemblyRoutes } = useAssemblyRoutes({
    members,
    ownerUserId,
    assemblyPoint: computedAssemblyPoint,
  })

  useEffect(() => {
    if (!map.current || !mapLoaded) {
      clearAssemblyRouteLayers()
      return
    }

    assemblyRoutesDataRef.current = assemblyRoutes

    clearAssemblyRouteLayers()
    if (assemblyRoutes.length === 0) return

    assemblyRoutes.forEach((ar, i) => {
      const color = ar.vehicleColor || ASSEMBLY_ROUTE_COLORS[i % ASSEMBLY_ROUTE_COLORS.length]
      renderAssemblyRouteOnMap(ar.route, color, i)
    })

    return () => {
      clearAssemblyRouteLayers()
    }
  }, [assemblyRoutes, mapLoaded])

  useEffect(() => {
    if (convoyPhase !== 'assembling' || !computedAssemblyPoint || !convoyId) return

    const arrivedIds: string[] = []
    for (const m of members) {
      if (m.userId === convoyOwner || assembledMembers.includes(m.userId)) continue
      if (!m.position) continue
      const d = haversineDistance(
        m.position.lat,
        m.position.lng,
        computedAssemblyPoint.lat,
        computedAssemblyPoint.lng,
      )
      if (d <= ASSEMBLY_THRESHOLD_M) {
        arrivedIds.push(m.userId)
      }
    }

    if (arrivedIds.length === 0) return

    const updated = [...new Set([...assembledMembers, ...arrivedIds])]
    const timer = setTimeout(() => {
      setAssembledMembers(updated)
    }, 0)
    pb.collection('convoys')
      .update(convoyId, { assembled_members: updated })
      .catch(() => {})
    return () => clearTimeout(timer)
  }, [convoyPhase, members, computedAssemblyPoint, convoyOwner, assembledMembers, convoyId])

  useEffect(() => {
    if (!convoyId) return

    const ownerId = convoyOwner
    if (!ownerId) return

    if (convoyPhase === 'assembling') {
      const startingPoints = members
        .filter((m) => m.joinLat != null && m.joinLng != null)
        .map((m) => m.userId)
      if (startingPoints.length < 2) {
        clearAssemblyPoint(convoyId).catch(() => {})
      }
      return
    }

    if (convoyPhase !== 'forming') return

    const timer = setTimeout(async () => {
      try {
        await calculateAssemblyPoint(convoyId)
      } catch (err) {
        console.error('[MapPage] auto-start failed:', err)
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, [convoyPhase, convoyId, members, convoyOwner])

  useEffect(() => {
    if (!map.current || !mapLoaded) return

    joinMarkersRef.current.forEach((m) => m.remove())
    joinMarkersRef.current.clear()

    for (const m of members) {
      if (!m.userId) continue
      if (m.joinLat == null || m.joinLng == null) continue

      const color = m.userId === convoyOwner ? '#22c55e' : getDistinctColor(m.userId, '#8b5cf6')
      const el = document.createElement('div')
      el.style.width = '16px'
      el.style.height = '16px'
      el.style.borderRadius = '50%'
      el.style.background = color
      el.style.border = '3px solid white'
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)'
      el.style.cursor = 'pointer'

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([m.joinLng, m.joinLat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div class="p-2 text-sm font-medium">${m.joinName || m.userName || 'Starting Point'}</div>`,
          ),
        )
        .addTo(map.current)

      el.addEventListener('click', () => {
        map.current?.flyTo({ center: [m.joinLng!, m.joinLat!], zoom: 16, duration: 800 })
      })

      joinMarkersRef.current.set(m.userId, marker)
    }
  }, [convoyPhase, members, mapLoaded, convoyOwner])

  const firstStep = routeData?.legs[0]?.steps[0]
  const alternatives = routeResponse?.routes || []

  return (
    <div className="relative w-full h-[calc(100dvh-80px-56px)] md:h-[calc(100dvh-80px)]">
      <div ref={mapContainer} className="w-full h-full" />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)] mx-auto"></div>
            <p className="mt-4 text-[var(--text2)]">Loading map...</p>
          </div>
        </div>
      )}
      {!convoyId && (
        <div className="absolute top-4 left-4 z-10">
          <SearchBar
            onResultSelect={handleSearchResult}
            onHoverResult={handleHoverResult}
            mapBounds={mapBounds}
          />
        </div>
      )}
      {convoyId && simActive && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-2 rounded-xl warning-banner">
          <span className="w-2 h-2 rounded-full bg-[var(--warning)] animate-pulse" />
          <span className="text-xs font-medium text-[var(--warning-text)]">Simulation Mode</span>
        </div>
      )}
      {convoyId && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <div className="rounded-xl px-3 py-2 glass shadow-lg flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${convoyPhase === 'completed' ? 'bg-[var(--success)]' : convoyPhase === 'in_transit' ? 'bg-[var(--primary)]' : 'bg-[var(--warning)]'} animate-pulse`}
            />
            <span className="text-xs font-semibold text-[var(--text)] capitalize">
              {convoyPhase}
            </span>
          </div>
        </div>
      )}
      {isOffRoute && routeData && (
        <div className="absolute top-20 left-4 right-4 md:left-auto md:right-4 md:w-96 z-20 rounded-xl p-4 glass border-[var(--warning-border-light)]">
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="h-5 w-5 text-[var(--warning-text)]"
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
            <h3 className="font-semibold text-[var(--warning-text)]">Off Route</h3>
          </div>
          <p className="text-sm text-[var(--text2)] mb-3">
            You have deviated from the planned route.
          </p>
          <button
            onClick={() => {
              if (routeResponse) {
                const dest = routeResponse.waypoints[routeResponse.waypoints.length - 1]
                if (dest) recalculateRoute(dest.location)
              }
            }}
            className="w-full px-3 py-2 bg-[var(--warning-bg)] text-[var(--warning-text)] text-sm font-medium rounded-lg hover:bg-[var(--warning-border-light)] transition-colors"
          >
            Recalculate Route
          </button>
        </div>
      )}
      {routeData && showRoutePanel && (
        <div className="absolute top-20 left-4 z-10 rounded-xl p-4 max-w-sm max-h-[60vh] overflow-y-auto glass">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[var(--text)]">Route Summary</h3>
            <button
              onClick={hideRoutePanel}
              className="text-[var(--text2)] hover:text-[var(--text)] transition-colors"
              aria-label="Hide route summary"
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
            <div className="rounded-xl p-3 text-center bg-[var(--primary-subtle-bg)]">
              <div className="text-lg font-bold text-[var(--primary)]">
                {formatDistance(routeData.distance)}
              </div>
              <div className="text-xs text-[var(--primary)] opacity-70 mt-0.5">Distance</div>
            </div>
            <div className="rounded-xl p-3 text-center bg-[var(--primary-subtle-bg)]">
              <div className="text-lg font-bold text-[var(--primary)]">
                {formatDuration(routeData.duration)}
              </div>
              <div className="text-xs text-[var(--primary)] opacity-70 mt-0.5">Duration</div>
            </div>
          </div>
          {alternatives.length > 1 && (
            <div className="mb-3 border-t border-[var(--border)] pt-3">
              <h4 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wide mb-2">
                {alternatives.length} Routes Found
              </h4>
              <div className="space-y-2">
                {alternatives.map((alt, i) => (
                  <button
                    key={i}
                    onClick={() => selectAlternative(i)}
                    className={`w-full text-left p-2 rounded-xl text-sm border transition-colors ${
                      selectedAltIndex === i
                        ? 'border-[var(--primary-border)] bg-[var(--primary-subtle-bg)]'
                        : 'border-[var(--border)] hover:bg-[var(--surface)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--text)]">Route {i + 1}</span>
                      {selectedAltIndex === i && (
                        <span className="text-xs text-[var(--primary)] font-medium">Selected</span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-[var(--text2)] mt-0.5">
                      <span>{formatDistance(alt.distance)}</span>
                      <span>{formatDuration(alt.duration)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mb-3 border-t border-[var(--border)] pt-3">
            <h4 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wide mb-2">
              Traffic
            </h4>
            <div className="flex gap-3 text-xs text-[var(--text2)]">
              <span className="flex items-center gap-1">
                <span className="w-3 h-1 rounded bg-[var(--success)] inline-block"></span> Free
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-1 rounded bg-lime-500 inline-block"></span> Light
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-1 rounded bg-[var(--warning)] inline-block"></span> Moderate
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-1 rounded bg-[var(--danger)] inline-block"></span> Heavy
              </span>
            </div>
          </div>
          {firstStep && (
            <div className="border-t border-[var(--border)] pt-3">
              <h4 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wide mb-2">
                Next Step
              </h4>
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-[var(--badge-vehicle-bg)]">
                  <svg
                    className="h-4 w-4 text-[var(--primary)]"
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
                  <p className="text-sm font-medium text-[var(--text)]">
                    {firstStep.name || 'Continue'}
                    {firstStep.maneuver.modifier && (
                      <span className="text-[var(--text2)]"> — {firstStep.maneuver.modifier}</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--text2)]">
                    {formatDistance(firstStep.distance)}
                  </p>
                </div>
              </div>
            </div>
          )}
          {routeData.legs[0]?.steps.length > 2 && (
            <details className="border-t border-[var(--border)] pt-3 mt-3">
              <summary className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wide cursor-pointer hover:text-[var(--text)] transition-colors">
                {routeData.legs[0].steps.length - 1} more steps
              </summary>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {routeData.legs[0].steps.slice(1).map((step, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedStepIndex(selectedStepIndex === i ? null : i)}
                    className={`w-full text-left p-2 rounded-lg text-sm ${
                      selectedStepIndex === i
                        ? 'bg-[var(--primary-subtle-bg)] border border-[var(--primary-border)]'
                        : 'hover:bg-[var(--surface)]'
                    }`}
                  >
                    <div className="font-medium text-[var(--text)]">
                      {step.name || 'Continue'}
                      {step.maneuver.modifier && (
                        <span className="text-[var(--text2)]"> — {step.maneuver.modifier}</span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text2)]">
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
        <div className="absolute top-20 left-4 z-10 rounded-xl p-4 max-w-sm glass border-[var(--danger-border-light)]">
          <p className="text-sm text-[var(--error-text)]">{routeError}</p>
          <button
            onClick={() => setRouteError(null)}
            className="mt-2 text-xs text-[var(--error-text)] hover:text-[var(--danger)] transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
      {routeData && !showRoutePanel && (
        <button
          onClick={() => setShowRoutePanel(true)}
          className="absolute top-20 left-4 z-10 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[var(--primary)] transition-colors glass border-[var(--primary-border)]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          Show Route
        </button>
      )}
      <button
        onClick={() => {
          if (!map.current) return
          if (position) {
            map.current.flyTo({
              center: [position.lng, position.lat],
              zoom: 15,
              duration: 1000,
            })
          } else if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (!map.current) return
                map.current.flyTo({
                  center: [pos.coords.longitude, pos.coords.latitude],
                  zoom: 15,
                  duration: 1000,
                })
              },
              () => {},
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
            )
          }
        }}
        className="absolute bottom-20 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full transition-colors glass text-[var(--text2)]"
        aria-label="Center on my location"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>
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
