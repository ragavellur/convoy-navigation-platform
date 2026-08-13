export const OSRM_URL = process.env.VITE_OSRM_URL || 'http://localhost:5001'
export const NOMINATIM_URL = process.env.VITE_NOMINATIM_URL || 'http://localhost:8080'

export async function checkService(url: string, timeout = 3000): Promise<void> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok && res.status !== 404 && res.status !== 400) {
      clearTimeout(id)
      throw new Error(`Service at ${url} returned ${res.status}`)
    }
  } catch (err) {
    clearTimeout(id)
    if (err instanceof Error && err.message.includes('Service at')) throw err
    throw new Error(`Service at ${url} not reachable. Ensure Docker containers are running.`, {
      cause: err,
    })
  }
  clearTimeout(id)
}
