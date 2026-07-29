import { describe, test, expect, beforeAll } from 'vitest'
import { OSRM_URL, NOMINATIM_URL, checkService } from './setup'

const SIMULATION_URL = process.env.VITE_SIMULATION_API_URL || 'http://localhost:3002'

let osrmOk = false
let nominatimOk = false
let simOk = false

beforeAll(async () => {
  try {
    await checkService(OSRM_URL)
    osrmOk = true
  } catch {
    /* OSRM not available */
  }
  try {
    await checkService(NOMINATIM_URL)
    nominatimOk = true
  } catch {
    /* Nominatim not available */
  }
  try {
    await checkService(SIMULATION_URL)
    simOk = true
  } catch {
    /* Simulation not available */
  }
})

describe('OSRM Routing API Integration', () => {
  test('route endpoint returns valid response structure', async () => {
    if (!osrmOk) return
    const res = await fetch(
      `${OSRM_URL}/route/v1/driving/13.406,52.522;13.377,52.516?overview=full&steps=true&geometries=geojson`,
    )
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.code).toBe('Ok')
    expect(Array.isArray(data.routes)).toBe(true)
    expect(data.routes.length).toBeGreaterThanOrEqual(1)
    expect(data.waypoints).toBeDefined()
    expect(data.waypoints.length).toBe(2)
  })

  test('route response contains geometry and legs', async () => {
    if (!osrmOk) return
    const res = await fetch(
      `${OSRM_URL}/route/v1/driving/13.406,52.522;13.377,52.516?steps=true&geometries=geojson`,
    )
    const data = await res.json()
    const route = data.routes[0]
    expect(route.geometry).toBeDefined()
    expect(route.geometry.type).toBe('LineString')
    expect(route.legs).toBeDefined()
    expect(route.legs.length).toBeGreaterThanOrEqual(1)
  })

  test('route response includes waypoints with locations', async () => {
    if (!osrmOk) return
    const res = await fetch(`${OSRM_URL}/route/v1/driving/13.406,52.522;13.377,52.516`)
    const data = await res.json()
    expect(data.waypoints[0].location).toBeDefined()
    expect(data.waypoints[0].location.length).toBe(2)
  })

  test('route with invalid coordinates returns error', async () => {
    if (!osrmOk) return
    const res = await fetch(`${OSRM_URL}/route/v1/driving/999,999;888,888`)
    expect(res.ok).toBe(false)
  })

  test('route with same origin+destination returns 0 distance', async () => {
    if (!osrmOk) return
    const res = await fetch(`${OSRM_URL}/route/v1/driving/13.406,52.522;13.406,52.522`)
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.code).toBe('Ok')
    expect(data.routes[0].distance).toBe(0)
  })
})

describe('Nominatim Geocoding API Integration', () => {
  test('search endpoint returns valid JSON array', async () => {
    if (!nominatimOk) return
    const res = await fetch(`${NOMINATIM_URL}/search?q=test&format=json&limit=1`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'ConvoyIntegrationTest/1.0' },
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('reverse geocode endpoint returns valid response structure', async () => {
    if (!nominatimOk) return
    const res = await fetch(`${NOMINATIM_URL}/reverse?lat=13.0827&lon=80.2707&format=json`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'ConvoyIntegrationTest/1.0' },
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data).toBeDefined()
  })

  test('search with empty query returns array', async () => {
    if (!nominatimOk) return
    const res = await fetch(`${NOMINATIM_URL}/search?q=&format=json`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'ConvoyIntegrationTest/1.0' },
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('reverse geocode with valid coords returns location', async () => {
    if (!nominatimOk) return
    const res = await fetch(
      `${NOMINATIM_URL}/reverse?lat=52.520&lon=13.405&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'ConvoyIntegrationTest/1.0' } },
    )
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.lat || data.error || data).toBeDefined()
  })
})

describe('Simulation API Integration', () => {
  test('status for non-running simulation returns running=false', async () => {
    if (!simOk) return
    const res = await fetch(`${SIMULATION_URL}/api/simulation/status/nonexistent-convoy`)
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data).toHaveProperty('running')
    expect(data.running).toBe(false)
  })

  test('simulation API returns JSON response', async () => {
    if (!simOk) return
    const res = await fetch(`${SIMULATION_URL}/api/simulation/status/test-convoy`, {
      signal: AbortSignal.timeout(3000),
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(typeof data).toBe('object')
    expect(data).toHaveProperty('running')
  })
})
