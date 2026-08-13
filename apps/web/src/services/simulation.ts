import supabase from './supabaseClient'

function getBaseUrl(): string {
  const envUrl = import.meta.env.VITE_SIMULATION_API_URL
  if (envUrl) return envUrl
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/functions/v1/simulation`
  }
  return '/functions/v1/simulation'
}

const SIMULATION_API_URL = getBaseUrl()

async function getHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown }
    if (data?.error) return String(data.error)
  } catch {
    /* fall through */
  }
  return 'Unknown error'
}

export interface SimulationStatus {
  running: boolean
  convoyId: string
  speedFactor?: number
  interval?: number
  startedAt?: string
  pid?: number
  phase?: string
}

export interface SimulationLogs {
  logs: Array<{ type: string; line: string; time: string }>
}

export interface SimulationTickResult {
  success: boolean
  running: boolean
  phase: string
  positions: Array<{ lat: number; lng: number; speed: number }>
}

export async function getSimulationStatus(convoyId: string): Promise<SimulationStatus> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/status/${convoyId}`, {
    headers: await getHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get simulation status: ${res.status}`)
  return res.json()
}

export async function startSimulation(
  convoyId: string,
  speedFactor = 10,
  interval = 2,
  waitAtMeeting = true,
): Promise<{ success: boolean; pid?: number }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/start`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ convoyId, speedFactor, interval, waitAtMeeting }),
  })
  if (!res.ok) {
    throw new Error(`${await readErrorMessage(res)}` || `Failed to start simulation: ${res.status}`)
  }
  return res.json()
}

export async function simulationTick(convoyId: string): Promise<SimulationTickResult> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/tick`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ convoyId }),
  })
  if (!res.ok) {
    throw new Error(`${await readErrorMessage(res)}` || `Failed to tick simulation: ${res.status}`)
  }
  return res.json()
}

export async function stopSimulation(convoyId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/stop`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ convoyId }),
  })
  if (!res.ok) throw new Error(`Failed to stop simulation: ${res.status}`)
  return res.json()
}

export async function restartSimulation(
  convoyId: string,
  speedFactor = 10,
  interval = 2,
  waitAtMeeting = true,
): Promise<{ success: boolean; clearedPositions?: number }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/restart`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ convoyId, speedFactor, interval, waitAtMeeting }),
  })
  if (!res.ok) {
    throw new Error(
      `${await readErrorMessage(res)}` || `Failed to restart simulation: ${res.status}`,
    )
  }
  return res.json()
}

export async function clearSimulationPositions(
  convoyId: string,
): Promise<{ success: boolean; deleted: number }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/clear`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ convoyId }),
  })
  if (!res.ok) throw new Error(`Failed to clear positions: ${res.status}`)
  return res.json()
}

export async function getSimulationLogs(convoyId: string): Promise<SimulationLogs> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/logs/${convoyId}`, {
    headers: await getHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get simulation logs: ${res.status}`)
  return res.json()
}

export async function calculateAssemblyPoint(
  convoyId: string,
): Promise<{ success: boolean; meetingPoint?: { lat: number; lng: number } }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/assembly/calculate`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ convoyId }),
  })
  if (!res.ok) {
    throw new Error(
      `${await readErrorMessage(res)}` || `Failed to calculate assembly point: ${res.status}`,
    )
  }
  return res.json()
}

export async function cleanupPositions(
  convoyId: string,
): Promise<{ success: boolean; deleted: number; kept: number }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/cleanup`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ convoyId }),
  })
  if (!res.ok) throw new Error(`Failed to cleanup positions: ${res.status}`)
  return res.json()
}
