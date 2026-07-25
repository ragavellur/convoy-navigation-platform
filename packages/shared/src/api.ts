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

export interface ConvoyRecord {
  id: string
  name: string
  code: string
  description?: string
  owner: string
  status: 'active' | 'paused' | 'ended'
  max_members?: number
  trip_id: string
  security_token: string
  settings?: Record<string, unknown>
  created: string
  updated: string
}

export interface ConvoyMemberRecord {
  id: string
  convoy: string
  user: string
  role: 'host' | 'member' | 'viewer'
  status: 'active' | 'inactive' | 'removed'
  vehicle?: string
  joined_at: string
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
    async create(params: ConvoyCreateParams): Promise<ConvoyRecord> {
      const code = generateConvoyCode()
      const tripId = generateTripId()
      const securityToken = generateSecurityToken()
      return pb.collection('convoys').create({
        name: params.name,
        code,
        description: params.description,
        max_members: params.max_members,
        owner: pb.authStore.record?.id,
        status: 'active',
        trip_id: tripId,
        security_token: securityToken,
      })
    },

    async join(params: ConvoyJoinParams): Promise<ConvoyMemberRecord> {
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
        joined_at: new Date().toISOString(),
      })
    },

    async list(): Promise<ConvoyRecord[]> {
      return pb.collection('convoys').getFullList({
        filter: `status = "active"`,
        sort: '-created',
      })
    },

    async get(convoyId: string): Promise<ConvoyRecord> {
      return pb.collection('convoys').getOne(convoyId)
    },

    async getByCode(code: string): Promise<ConvoyRecord | null> {
      const results = await pb.collection('convoys').getFullList({
        filter: `code = "${code}"`,
      })
      return results.length > 0 ? results[0] : null
    },

    async getMembers(convoyId: string): Promise<ConvoyMemberRecord[]> {
      return pb.collection('convoy_members').getFullList({
        filter: `convoy = "${convoyId}" && status = "active"`,
        expand: 'user,vehicle',
      })
    },

    async updateStatus(
      convoyId: string,
      status: 'active' | 'paused' | 'ended',
    ): Promise<ConvoyRecord> {
      return pb.collection('convoys').update(convoyId, { status })
    },

    async removeMember(memberId: string): Promise<void> {
      await pb.collection('convoy_members').update(memberId, { status: 'removed' })
    },

    async leave(convoyId: string, userId: string): Promise<void> {
      const members = await pb.collection('convoy_members').getFullList({
        filter: `convoy = "${convoyId}" && user = "${userId}"`,
      })
      if (members.length > 0) {
        await pb.collection('convoy_members').update(members[0].id, { status: 'inactive' })
      }
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

function generateTripId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let tripId = ''
  for (let i = 0; i < 12; i++) {
    tripId += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return tripId
}

function generateSecurityToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}
