export interface User {
  id: string
  name: string
  email: string
  avatar?: string
}

export interface Convoy {
  id: string
  hostUserId: string
  destination: {
    lat: number
    lng: number
    name: string
  }
  isActive: boolean
  createdAt: Date
}

export interface Vehicle {
  id: string
  convoyId: string
  type: 'SUV' | 'Sedan' | 'Motorcycle' | 'Passenger'
  label: string
  occupants: User[]
}

export interface Telemetry {
  userId: string
  convoyId: string
  position: {
    lat: number
    lng: number
  }
  speed: number
  heading: number
  lastUpdated: Date
}

export {
  createClient,
  createAuthApi,
  createConvoyApi,
  createVehicleApi,
  createTelemetryApi,
} from './api'

export type {
  AuthLoginParams,
  AuthRegisterParams,
  ConvoyCreateParams,
  ConvoyJoinParams,
  VehicleCreateParams,
  TelemetryUpdateParams,
} from './api'
