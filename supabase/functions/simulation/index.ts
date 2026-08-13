import {
  advance,
  computeMeetingPoint,
  findMeetingIdx,
  haversineKm,
  VEHICLE_SPEED_VARIANCE,
  type Coord,
  type LatLng,
  type SimulationPlan,
} from './_shared/movement.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const OSRM_URL = Deno.env.get('OSRM_URL') ?? ''
const PUBLIC_OSRM = 'https://router.project-osrm.org'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseSettings(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === 'object') return { ...(raw as Record<string, unknown>) }
  return {}
}

function fallbackLine(from: LatLng, to: LatLng): Coord[] {
  return [
    [from.lng, from.lat],
    [to.lng, to.lat],
  ]
}

async function rest(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...(options.headers ?? {}),
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DB ${options.method ?? 'GET'} ${path} failed: ${res.status} ${text}`)
  }
  if (res.status === 204) return null
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (e) {
    console.error(
      'rest bad json',
      options.method ?? 'GET',
      path,
      'status',
      res.status,
      'body',
      text.slice(0, 200),
    )
    throw e
  }
}

async function getUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new HttpError(401, 'Missing authorization token')
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  })
  if (!res.ok) throw new HttpError(401, 'Invalid or expired token')
  const data = (await res.json()) as { id?: string }
  if (!data.id) throw new HttpError(401, 'Invalid or expired token')
  return data.id
}

interface ConvoyRow {
  id: string
  owner: string
  phase: string
  assembled_members: unknown[]
  dest_lat: number | null
  dest_lng: number | null
  settings: unknown
}

async function getConvoy(convoyId: string): Promise<ConvoyRow | null> {
  const select = 'id,owner,phase,assembled_members,dest_lat,dest_lng,settings'
  const rows = (await rest(`/convoys?select=${select}&id=eq.${convoyId}`)) as ConvoyRow[]
  return rows?.[0] ?? null
}

interface MemberRow {
  id: string
  user: string
  role: string
  vehicle: string | null
  join_lat: number | null
  join_lng: number | null
  route_geometry: Coord[] | null
}

async function getActiveMembers(convoyId: string): Promise<MemberRow[]> {
  const select = 'id,user,role,vehicle,join_lat,join_lng,route_geometry'
  return (await rest(
    `/convoy_members?select=${select}&convoy=eq.${convoyId}&status=eq.active`,
  )) as MemberRow[]
}

async function requireOwner(userId: string, convoyId: string): Promise<ConvoyRow> {
  const convoy = await getConvoy(convoyId)
  if (!convoy) throw new HttpError(404, 'Convoy not found')
  if (convoy.owner !== userId)
    throw new HttpError(403, 'Only the convoy owner can perform this action')
  return convoy
}

async function requireMember(userId: string, convoyId: string): Promise<void> {
  const rows = (await rest(
    `/convoy_members?select=id&convoy=eq.${convoyId}&user=eq.${userId}&status=eq.active`,
  )) as { id: string }[]
  if (!rows?.length) throw new HttpError(403, 'You are not an active member of this convoy')
}

async function patchConvoy(convoyId: string, body: Record<string, unknown>): Promise<void> {
  await rest(`/convoys?id=eq.${convoyId}`, { method: 'PATCH', body })
}

async function patchMember(memberId: string, body: Record<string, unknown>): Promise<void> {
  await rest(`/convoy_members?id=eq.${memberId}`, { method: 'PATCH', body })
}

async function deletePositions(convoyId: string): Promise<void> {
  await rest(`/positions?convoy=eq.${convoyId}`, { method: 'DELETE' })
}

async function upsertPosition(
  vehicleId: string,
  convoyId: string,
  pos: LatLng,
  speed: number,
): Promise<void> {
  await rest(`/positions?on_conflict=vehicle,convoy`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: [
      {
        vehicle: vehicleId,
        convoy: convoyId,
        lat: pos.lat,
        lng: pos.lng,
        speed,
        heading: 0,
        accuracy: 10,
      },
    ],
  })
}

async function fetchOsrmRoute(from: LatLng, to: LatLng): Promise<Coord[] | null> {
  const urls = [OSRM_URL, PUBLIC_OSRM].filter(Boolean)
  for (const baseUrl of urls) {
    try {
      const res = await fetch(
        `${baseUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false&alternatives=false`,
        { signal: AbortSignal.timeout(8000) },
      )
      if (!res.ok) continue
      const data = (await res.json()) as {
        routes?: { geometry?: { coordinates?: Coord[] } }[]
      }
      const coords = data?.routes?.[0]?.geometry?.coordinates
      if (!coords || coords.length < 2) continue
      if (haversineKm(from.lat, from.lng, coords[0][1], coords[0][0]) > 10) continue
      return coords
    } catch {
      continue
    }
  }
  return null
}

async function buildSimulationPlan(
  convoyId: string,
  convoy: ConvoyRow,
  params: { speedFactor: number; interval: number; waitAtMeeting: boolean },
): Promise<{ plan: SimulationPlan }> {
  const destPt: LatLng = { lat: convoy.dest_lat ?? 0, lng: convoy.dest_lng ?? 0 }
  if (convoy.dest_lat == null || convoy.dest_lng == null) {
    throw new HttpError(400, 'Convoy has no destination')
  }

  const members = await getActiveMembers(convoyId)
  const vehicles = members.filter((m) => m.vehicle && m.join_lat != null && m.join_lng != null)
  if (vehicles.length === 0) throw new HttpError(400, 'No vehicles found in convoy')

  for (const v of vehicles) {
    if (!v.route_geometry || v.route_geometry.length < 2) {
      const from = { lat: v.join_lat as number, lng: v.join_lng as number }
      const coords = (await fetchOsrmRoute(from, destPt)) ?? fallbackLine(from, destPt)
      v.route_geometry = coords
      await patchMember(v.id, { route_geometry: coords })
    }
  }

  const activeVehicles = vehicles.filter((v) => (v.route_geometry?.length ?? 0) > 1)
  if (activeVehicles.length === 0) throw new HttpError(400, 'No vehicles with route geometry')

  const owner = members.find((m) => m.role === 'owner')
  const ownerVehicle = activeVehicles.find((v) => v.user === owner?.user)
  const otherGeoms = activeVehicles
    .filter((v) => v.user !== owner?.user)
    .map((v) => v.route_geometry)
  const meetingPoint = computeMeetingPoint(ownerVehicle?.route_geometry, otherGeoms, destPt)
  const isDest = meetingPoint.lat === destPt.lat && meetingPoint.lng === destPt.lng

  await patchConvoy(convoyId, {
    source_lat: meetingPoint.lat,
    source_lng: meetingPoint.lng,
    source_name: isDest ? 'Destination' : 'Merging point',
    phase: 'assembling',
    assembled_members: [],
  })

  const plan: SimulationPlan = {
    startedAt: new Date().toISOString(),
    speedFactor: params.speedFactor,
    interval: params.interval,
    waitAtMeeting: params.waitAtMeeting,
    vehicles: activeVehicles.map((v, i) => ({
      vehicleId: v.vehicle as string,
      userId: v.user,
      memberId: v.id,
      geometry: v.route_geometry as Coord[],
      meetingIdx: findMeetingIdx(v.route_geometry as Coord[], meetingPoint),
      speedVar: 1 + (i % 3) * VEHICLE_SPEED_VARIANCE,
    })),
  }

  return { plan }
}

async function handleAssemblyCalculate(userId: string, body: Record<string, unknown>) {
  const convoy = await requireOwner(userId, String(body.convoyId))
  const destPt: LatLng = { lat: convoy.dest_lat ?? 0, lng: convoy.dest_lng ?? 0 }
  if (convoy.dest_lat == null || convoy.dest_lng == null) {
    throw new HttpError(400, 'Convoy has no destination')
  }

  const members = await getActiveMembers(convoy.id)
  const activeMembers = members.filter((m) => m.join_lat != null && m.join_lng != null)
  if (activeMembers.length < 2) {
    throw new HttpError(400, 'Need at least 2 members with starting points')
  }
  const owner = members.find((m) => m.role === 'owner')
  if (!owner || owner.join_lat == null || owner.join_lng == null) {
    throw new HttpError(400, 'Owner has no starting point')
  }

  const allGeometries: (Coord[] | null)[] = []
  for (const m of activeMembers) {
    const from = { lat: m.join_lat as number, lng: m.join_lng as number }
    const coords = await fetchOsrmRoute(from, destPt)
    allGeometries.push(coords)
    await patchMember(m.id, { route_geometry: coords ?? [] })
  }

  const ownerIdx = activeMembers.findIndex((m) => m.id === owner.id)
  const ownerCoords = allGeometries[ownerIdx]
  if (!ownerCoords || ownerCoords.length < 2) {
    await patchConvoy(convoy.id, {
      source_lat: destPt.lat,
      source_lng: destPt.lng,
      source_name: 'Destination',
      phase: 'assembling',
      assembled_members: [],
    })
    return { success: true, meetingPoint: destPt }
  }

  const memberGeoms = allGeometries.filter((_, i) => i !== ownerIdx)
  const meetingPoint = computeMeetingPoint(ownerCoords, memberGeoms, destPt)
  const isDest = meetingPoint.lat === destPt.lat && meetingPoint.lng === destPt.lng

  await patchConvoy(convoy.id, {
    source_lat: meetingPoint.lat,
    source_lng: meetingPoint.lng,
    source_name: isDest ? 'Destination' : 'Merging point',
    phase: 'assembling',
    assembled_members: [],
  })

  return { success: true, meetingPoint }
}
async function handleSimulationStart(userId: string, body: Record<string, unknown>) {
  const convoy = await requireOwner(userId, String(body.convoyId))
  const speedFactor = Number(body.speedFactor ?? 10)
  const interval = Number(body.interval ?? 2)
  const waitAtMeeting = body.waitAtMeeting !== false

  await deletePositions(convoy.id)

  const { plan } = await buildSimulationPlan(convoy.id, convoy, {
    speedFactor,
    interval,
    waitAtMeeting,
  })
  const settings = parseSettings(convoy.settings)
  settings.simulation_active = true
  settings.simulation = plan
  await patchConvoy(convoy.id, { settings })

  return { success: true, convoyId: convoy.id, speedFactor, interval }
}

async function handleSimulationTick(userId: string, body: Record<string, unknown>) {
  const convoy = await getConvoy(String(body.convoyId))
  if (!convoy) throw new HttpError(404, 'Convoy not found')
  await requireMember(userId, convoy.id)

  const settings = parseSettings(convoy.settings)
  const plan = settings.simulation as SimulationPlan | undefined
  if (!plan || settings.simulation_active !== true) {
    return { success: true, running: false, phase: convoy.phase, positions: [] }
  }

  const elapsedSec = (Date.now() - Date.parse(plan.startedAt)) / 1000
  const assembled = (
    Array.isArray(convoy.assembled_members) ? convoy.assembled_members : []
  ) as string[]
  const result = advance(plan, elapsedSec, convoy.phase, assembled)

  for (let i = 0; i < plan.vehicles.length; i++) {
    await upsertPosition(
      plan.vehicles[i].vehicleId,
      convoy.id,
      result.states[i].pos,
      result.states[i].speed,
    )
  }

  const patch: Record<string, unknown> = { phase: result.nextPhase }
  if (result.nextPhase === 'in_transit') {
    patch.assembled_members = []
  } else if (convoy.phase === 'assembling') {
    patch.assembled_members = result.assembledMembers
  }
  const assembledChanged =
    JSON.stringify(patch.assembled_members ?? convoy.assembled_members) !==
    JSON.stringify(convoy.assembled_members)
  if (result.nextPhase !== convoy.phase || assembledChanged) {
    await patchConvoy(convoy.id, patch)
  }

  if (result.nextPhase === 'completed') {
    settings.simulation_active = false
    await patchConvoy(convoy.id, { settings })
  }

  return {
    success: true,
    running: result.nextPhase !== 'completed',
    phase: result.nextPhase,
    positions: result.states.map((s) => ({ lat: s.pos.lat, lng: s.pos.lng, speed: s.speed })),
  }
}

async function handleSimulationStop(userId: string, body: Record<string, unknown>) {
  const convoy = await requireOwner(userId, String(body.convoyId))
  const settings = parseSettings(convoy.settings)
  settings.simulation_active = false
  delete settings.simulation
  await patchConvoy(convoy.id, { settings })
  return { success: true, convoyId: convoy.id, message: 'Simulation stopped' }
}

async function handleSimulationStatus(convoyId: string) {
  const convoy = await getConvoy(convoyId)
  if (!convoy) throw new HttpError(404, 'Convoy not found')
  const settings = parseSettings(convoy.settings)
  const plan = settings.simulation as SimulationPlan | undefined
  return {
    running: settings.simulation_active === true,
    convoyId,
    speedFactor: plan?.speedFactor,
    interval: plan?.interval,
    startedAt: plan?.startedAt,
    phase: convoy.phase,
  }
}

async function handleSimulationClear(userId: string, body: Record<string, unknown>) {
  await requireOwner(userId, String(body.convoyId))
  await deletePositions(String(body.convoyId))
  return { success: true, convoyId: body.convoyId, deleted: 0 }
}

async function handleSimulationCleanup(userId: string, body: Record<string, unknown>) {
  await requireOwner(userId, String(body.convoyId))
  const rows = (await rest(`/positions?select=id&convoy=eq.${String(body.convoyId)}`)) as {
    id: string
  }[]
  return { success: true, convoyId: body.convoyId, deleted: 0, kept: rows?.length ?? 0 }
}

async function route(req: Request, parts: string[]): Promise<Response> {
  const path = parts.join('/')

  if (req.method === 'GET' && path === 'health') {
    return json({ status: 'ok' })
  }

  const userId = await getUserId(req)
  const body =
    req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {}

  if (req.method === 'POST' && path === 'api/assembly/calculate') {
    return json(await handleAssemblyCalculate(userId, body))
  }
  if (req.method === 'POST' && path === 'api/simulation/start') {
    return json(await handleSimulationStart(userId, body))
  }
  if (req.method === 'POST' && path === 'api/simulation/restart') {
    return json(await handleSimulationStart(userId, body))
  }
  if (req.method === 'POST' && path === 'api/simulation/tick') {
    return json(await handleSimulationTick(userId, body))
  }
  if (req.method === 'POST' && path === 'api/simulation/stop') {
    return json(await handleSimulationStop(userId, body))
  }
  if (req.method === 'POST' && path === 'api/simulation/clear') {
    return json(await handleSimulationClear(userId, body))
  }
  if (req.method === 'POST' && path === 'api/simulation/cleanup') {
    return json(await handleSimulationCleanup(userId, body))
  }
  if (
    req.method === 'GET' &&
    parts[0] === 'api' &&
    parts[1] === 'simulation' &&
    parts[2] === 'status'
  ) {
    return json(await handleSimulationStatus(parts[3]))
  }
  if (
    req.method === 'GET' &&
    parts[0] === 'api' &&
    parts[1] === 'simulation' &&
    parts[2] === 'logs'
  ) {
    return json({ logs: [] })
  }

  throw new HttpError(404, 'Not found')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url)
  let pathname = url.pathname
  for (const prefix of ['/functions/v1/simulation', '/simulation']) {
    if (pathname.startsWith(prefix)) {
      pathname = pathname.slice(prefix.length)
      break
    }
  }
  const parts = pathname.split('/').filter(Boolean)
  try {
    return await route(req, parts)
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    return json({ error: (err as Error).message ?? 'Internal error' }, 500)
  }
})
