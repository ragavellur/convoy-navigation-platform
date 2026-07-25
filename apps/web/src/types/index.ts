export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  phone?: string
  role: 'admin' | 'member'
  status: 'active' | 'inactive' | 'banned'
  created: string
  updated: string
}

export interface Convoy {
  id: string
  name: string
  code: string
  description?: string
  owner: string
  status: 'active' | 'archived'
  max_members?: number
  settings?: ConvoySettings
  created: string
  updated: string
}

export interface ConvoySettings {
  distance_threshold_m?: number
  time_fallback_sec?: number
  heading_threshold_deg?: number
  sample_rate_sec?: number
  voice_enabled?: boolean
  geofence_alerts?: boolean
}

export interface ConvoyMember {
  id: string
  convoy: string
  user: string
  role: 'owner' | 'admin' | 'member'
  vehicle?: string
  status: 'active' | 'kicked' | 'left'
  created: string
  updated: string
}

export interface Vehicle {
  id: string
  convoy: string
  owner: string
  name: string
  type: 'car' | 'truck' | 'motorcycle' | 'other'
  color?: string
  license_plate?: string
  image?: string
  telemetry_config?: TelemetryConfig
  status: 'active' | 'inactive' | 'maintenance'
  created: string
  updated: string
}

export interface TelemetryConfig {
  distance_threshold_m?: number
  time_fallback_sec?: number
  heading_threshold_deg?: number
  sample_rate_sec?: number
  speed_threshold_kmh?: number
}

export interface TelemetryAggregated {
  id: string
  vehicle: string
  hour_bucket: string
  start_lat: number
  start_lng: number
  end_lat: number
  end_lng: number
  avg_speed?: number
  max_speed?: number
  distance_traveled?: number
  point_count?: number
  route_polyline?: string
  created: string
  updated: string
}

export interface Message {
  id: string
  convoy: string
  sender: string
  type: 'text' | 'voice' | 'system'
  content: string
  duration?: number
  location_lat?: number
  location_lng?: number
  created: string
  updated: string
}

export interface Geofence {
  id: string
  convoy: string
  name: string
  type: 'circle' | 'polygon'
  center_lat?: number
  center_lng?: number
  radius_m?: number
  polygon_coords?: Array<{ lat: number; lng: number }>
  alert_on: 'enter' | 'exit' | 'both'
  status: 'active' | 'inactive'
  created: string
  updated: string
}

export interface AuditLog {
  id: string
  user?: string
  action: string
  resource_type: string
  resource_id?: string
  metadata?: Record<string, unknown>
  created: string
  updated: string
}

export interface Position {
  lat: number
  lng: number
  heading?: number
  speed?: number
  accuracy?: number
  timestamp: number
}

export interface TelemetryUpdate {
  vehicle_id: string
  lat: number
  lng: number
  speed?: number
  heading?: number
  accuracy?: number
  timestamp: number
}

export interface RouteStep {
  maneuver: {
    location: [number, number]
    type: string
    modifier?: string
  }
  name: string
  distance: number
  duration: number
}

export interface RouteLeg {
  steps: RouteStep[]
  distance: number
  duration: number
}

export interface RouteGeometry {
  type: 'LineString'
  coordinates: Array<[number, number]>
}

export interface Route {
  geometry: RouteGeometry | string
  legs: RouteLeg[]
  distance: number
  duration: number
  weight: number
}

export interface RouteResponse {
  code: string
  routes: Route[]
  waypoints: Array<{
    location: [number, number]
    name: string
  }>
}

export interface SearchResult {
  id: string
  name: string
  displayName: string
  lat: number
  lng: number
  boundingBox?: [number, number, number, number]
}

export interface RouteSummary {
  distance: number
  duration: number
  steps: RouteStep[]
}
