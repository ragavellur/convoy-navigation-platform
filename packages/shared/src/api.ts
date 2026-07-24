import PocketBase, { RecordAuthResponse, RecordModel } from 'pocketbase'

const DEFAULT_POCKETBASE_URL = 'http://localhost:8090'

export function createClient(url?: string): PocketBase {
  return new PocketBase(url || DEFAULT_POCKETBASE_URL)
}

export interface AuthLoginParams {
  email: string
  password: string
}

export interface AuthRegisterParams {
  email: string
  password: string
  name: string
}

export interface ConvoyCreateParams {
  name: string
  description?: string
  max_members?: number
}

export interface ConvoyJoinParams {
  code: string
}

export interface VehicleCreateParams {
  name: string
  type: 'car' | 'truck' | 'motorcycle' | 'other'
  color?: string
  license_plate?: string
}

export interface TelemetryUpdateParams {
  vehicle_id: string
  lat: number
  lng: number
  speed?: number
  heading?: number
  accuracy?: number
}

export function createAuthApi(pb: PocketBase) {
  return {
    async login(params: AuthLoginParams): Promise<RecordAuthResponse<RecordModel>> {
      return pb.collection('users').authWithPassword(params.email, params.password)
    },

    async register(params: AuthRegisterParams): Promise<RecordAuthResponse<RecordModel>> {
      await pb.collection('users').create({
        email: params.email,
        password: params.password,
        passwordConfirm: params.password,
        name: params.name,
      })
      return this.login({ email: params.email, password: params.password })
    },

    async logout(): Promise<void> {
      pb.authStore.clear()
    },

    async refresh(): Promise<RecordAuthResponse<RecordModel>> {
      return pb.collection('users').authRefresh()
    },

    isAuthenticated(): boolean {
      return pb.authStore.isValid
    },

    getCurrentUser(): RecordModel | null {
      return pb.authStore.record
    },
  }
}

export function createConvoyApi(pb: PocketBase) {
  return {
    async create(params: ConvoyCreateParams): Promise<RecordModel> {
      const code = generateConvoyCode()
      return pb.collection('convoys').create({
        name: params.name,
        code,
        description: params.description,
        max_members: params.max_members,
        owner: pb.authStore.record?.id,
        status: 'active',
      })
    },

    async join(params: ConvoyJoinParams): Promise<RecordModel> {
      const results = await pb.collection('convoys').getFullList({
        filter: `code = "${params.code}" && status = "active"`,
      })
      if (results.length === 0) {
        throw new Error('Convoy not found or inactive')
      }
      const convoy = results[0]
      return pb.collection('convoy_members').create({
        convoy: convoy.id,
        user: pb.authStore.record?.id,
        role: 'member',
        status: 'active',
      })
    },

    async list(): Promise<RecordModel[]> {
      return pb.collection('convoys').getFullList({
        filter: `status = "active"`,
        sort: '-created',
      })
    },

    async getMembers(convoyId: string): Promise<RecordModel[]> {
      return pb.collection('convoy_members').getFullList({
        filter: `convoy = "${convoyId}" && status = "active"`,
        expand: 'user,vehicle',
      })
    },
  }
}

export function createVehicleApi(pb: PocketBase) {
  return {
    async create(params: VehicleCreateParams, convoyId: string): Promise<RecordModel> {
      return pb.collection('vehicles').create({
        name: params.name,
        type: params.type,
        color: params.color,
        license_plate: params.license_plate,
        convoy: convoyId,
        owner: pb.authStore.record?.id,
        status: 'active',
      })
    },

    async list(convoyId: string): Promise<RecordModel[]> {
      return pb.collection('vehicles').getFullList({
        filter: `convoy = "${convoyId}" && status = "active"`,
      })
    },
  }
}

export function createTelemetryApi(pb: PocketBase) {
  return {
    async update(params: TelemetryUpdateParams): Promise<void> {
      await pb.collection('telemetry_aggregated').create({
        vehicle: params.vehicle_id,
        start_lat: params.lat,
        start_lng: params.lng,
        end_lat: params.lat,
        end_lng: params.lng,
        avg_speed: params.speed,
        max_speed: params.speed,
        point_count: 1,
      })
    },
  }
}

function generateConvoyCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}
