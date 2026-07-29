function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/simulation`
  }
  return import.meta.env.VITE_SIMULATION_API_URL || '/simulation'
}

const SIMULATION_API_URL = getBaseUrl()

export interface SimulationStatus {
  running: boolean
  convoyId: string
  speedFactor?: number
  interval?: number
  startedAt?: string
  pid?: number
}

export interface SimulationLogs {
  logs: Array<{ type: string; line: string; time: string }>
}

export async function getSimulationStatus(convoyId: string): Promise<SimulationStatus> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/status/${convoyId}`)
  if (!res.ok) throw new Error(`Failed to get simulation status: ${res.status}`)
  return res.json()
}

export async function startSimulation(
  convoyId: string,
  speedFactor = 10,
  interval = 2,
): Promise<{ success: boolean; pid: number }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ convoyId, speedFactor, interval }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `Failed to start simulation: ${res.status}`)
  }
  return res.json()
}

export async function stopSimulation(convoyId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ convoyId }),
  })
  if (!res.ok) throw new Error(`Failed to stop simulation: ${res.status}`)
  return res.json()
}

export async function restartSimulation(
  convoyId: string,
  speedFactor = 10,
  interval = 2,
): Promise<{ success: boolean; clearedPositions: number }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/restart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ convoyId, speedFactor, interval }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `Failed to restart simulation: ${res.status}`)
  }
  return res.json()
}

export async function clearSimulationPositions(
  convoyId: string,
): Promise<{ success: boolean; deleted: number }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ convoyId }),
  })
  if (!res.ok) throw new Error(`Failed to clear positions: ${res.status}`)
  return res.json()
}

export async function getSimulationLogs(convoyId: string): Promise<SimulationLogs> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/logs/${convoyId}`)
  if (!res.ok) throw new Error(`Failed to get simulation logs: ${res.status}`)
  return res.json()
}

export async function calculateAssemblyPoint(
  convoyId: string,
): Promise<{ success: boolean; meetingPoint?: { lat: number; lng: number } }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/assembly/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ convoyId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `Failed to calculate assembly point: ${res.status}`)
  }
  return res.json()
}

export async function cleanupPositions(
  convoyId: string,
): Promise<{ success: boolean; deleted: number; kept: number }> {
  const res = await fetch(`${SIMULATION_API_URL}/api/simulation/cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ convoyId }),
  })
  if (!res.ok) throw new Error(`Failed to cleanup positions: ${res.status}`)
  return res.json()
}
