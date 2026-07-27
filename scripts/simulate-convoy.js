#!/usr/bin/env node

/**
 * Convoy Travel Simulation Script
 *
 * Simulates real-time vehicle movement along an OSRM route for any convoy.
 * Writes positions directly to PocketBase via Admin API.
 * Sets simulation_active flag to prevent real GPS positions from conflicting.
 *
 * Usage:
 *   node scripts/simulate-convoy.js <convoyId> [options]
 *
 * Options:
 *   --speed-factor <n>   Time compression (default: 1 = real-time)
 *   --interval <n>       Seconds between position updates (default: 2)
 *   --pb-url <url>       PocketBase URL (default: http://localhost:8090)
 *   --osrm-url <url>     OSRM URL (default: https://router.project-osrm.org)
 *   --dry-run            Show what would happen without writing to DB
 *   --no-flag            Don't set simulation_active flag
 *
 * Examples:
 *   node scripts/simulate-convoy.js yy6us6zhjtx2l2y
 *   node scripts/simulate-convoy.js yy6us6zhjtx2l2y --speed-factor 60
 *   node scripts/simulate-convoy.js yy6us6zhjtx2l2y --speed-factor 10 --interval 1
 */

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090'
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@convoy.local'
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'admin123456'
const OSRM_PUBLIC_URL = 'https://router.project-osrm.org'
const OSRM_LOCAL_URL = process.env.OSRM_LOCAL_URL || process.env.OSRM_URL || 'http://localhost:5001'
const WP_INTERVAL_M = 75
const ARRIVAL_THRESHOLD_M = 50

// ── CLI Args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('Usage: node scripts/simulate-convoy.js <convoyId> [options]')
    console.error('  --speed-factor <n>   Time compression (default: 1 = real-time)')
    console.error('  --interval <n>       Seconds between updates (default: 2)')
    console.error('  --dry-run            Preview without DB writes')
    console.error('  --no-flag            Skip simulation_active flag')
    process.exit(1)
  }
  const opts = {
    convoyId: args[0],
    speedFactor: 1,
    interval: 2,
    dryRun: false,
    setFlag: true,
  }
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--speed-factor':
        opts.speedFactor = parseFloat(args[++i]) || 1
        break
      case '--interval':
        opts.interval = parseFloat(args[++i]) || 2
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--no-flag':
        opts.setFlag = false
        break
    }
  }
  return opts
}

// ── PocketBase helpers ──────────────────────────────────────────────────────

let adminToken = null

async function pbAuth() {
  const res = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  })
  if (!res.ok) throw new Error(`PocketBase auth failed: ${res.status}`)
  const data = await res.json()
  adminToken = data.token
}

async function pbGet(path) {
  const res = await fetch(`${POCKETBASE_URL}${path}`, {
    headers: { Authorization: adminToken },
  })
  if (!res.ok) throw new Error(`PB GET ${path} failed: ${res.status}`)
  return res.json()
}

async function pbPost(collection, data) {
  const res = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: adminToken },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`PB POST ${collection} failed: ${res.status} ${err}`)
  }
  return res.json()
}

async function pbPatch(collection, id, data) {
  const res = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: adminToken },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`PB PATCH ${collection}/${id} failed: ${res.status} ${err}`)
  }
  return res.json()
}

async function pbDelete(collection, id) {
  const res = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records/${id}`, {
    method: 'DELETE',
    headers: { Authorization: adminToken },
  })
  if (!res.ok) console.warn(`  WARN: failed to delete position ${id}: ${res.status}`)
}

async function pbUpsertPosition(data) {
  const filter = `vehicle="${data.vehicle}" && convoy="${data.convoy}"`
  const existing = await pbGet(
    `/api/collections/positions/records?perPage=1&filter=${encodeURIComponent(filter)}`,
  )
  if (existing.items && existing.items.length > 0) {
    return pbPatch('positions', existing.items[0].id, data)
  }
  return pbPost('positions', data)
}

// ── Geometry helpers ────────────────────────────────────────────────────────

function toRad(deg) {
  return (deg * Math.PI) / 180
}
function toDeg(rad) {
  return (rad * 180) / Math.PI
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearing(lat1, lng1, lat2, lng2) {
  const dLng = toRad(lng2 - lng1)
  const y = Math.sin(dLng) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function interpolate(lat1, lng1, lat2, lng2, t) {
  return {
    lat: lat1 + (lat2 - lat1) * t,
    lng: lng1 + (lng2 - lng1) * t,
  }
}

// ── Route resampling ────────────────────────────────────────────────────────

function resampleRoute(coords, intervalM) {
  const waypoints = [{ lat: coords[0][1], lng: coords[0][0], distFromPrev: 0 }]
  let accumulated = 0
  let nextTarget = intervalM

  for (let i = 1; i < coords.length; i++) {
    const segDist = haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
    accumulated += segDist

    while (accumulated >= nextTarget) {
      const overshoot = accumulated - nextTarget
      const t = segDist > 0 ? 1 - overshoot / segDist : 0
      const pt = interpolate(
        coords[i - 1][1],
        coords[i - 1][0],
        coords[i][1],
        coords[i][0],
        Math.max(0, Math.min(1, t)),
      )
      waypoints.push({ lat: pt.lat, lng: pt.lng, distFromPrev: intervalM })
      nextTarget += intervalM
    }
  }

  // Add final destination point
  const lastCoord = coords[coords.length - 1]
  const lastWp = waypoints[waypoints.length - 1]
  const finalDist = haversine(lastWp.lat, lastWp.lng, lastCoord[1], lastCoord[0])
  if (finalDist > 5) {
    waypoints.push({ lat: lastCoord[1], lng: lastCoord[0], distFromPrev: finalDist })
  }

  // Compute heading for each waypoint
  for (let i = 0; i < waypoints.length - 1; i++) {
    waypoints[i].heading = bearing(
      waypoints[i].lat,
      waypoints[i].lng,
      waypoints[i + 1].lat,
      waypoints[i + 1].lng,
    )
  }
  if (waypoints.length > 0) {
    waypoints[waypoints.length - 1].heading = waypoints[waypoints.length - 2]?.heading ?? 0
  }

  return waypoints
}

// ── Vehicle simulator ───────────────────────────────────────────────────────

class VehicleSimulator {
  constructor(name, vehicleId, baseSpeedMs, waypoints) {
    this.name = name
    this.vehicleId = vehicleId
    this.baseSpeed = baseSpeedMs
    this.waypoints = waypoints
    this.currentWpIndex = 0
    this.fractionalDist = 0
    this.totalDistance = 0
    this.positionCount = 0
    this.arrived = false
    this.speedVariance = 1.0
  }

  get position() {
    const wp = this.waypoints[this.currentWpIndex]
    return { lat: wp.lat, lng: wp.lng, heading: wp.heading }
  }

  advance(distanceM) {
    if (this.arrived) return
    let remaining = distanceM

    while (remaining > 0 && this.currentWpIndex < this.waypoints.length - 1) {
      const wp = this.waypoints[this.currentWpIndex]
      const spaceLeft = wp.distFromPrev - this.fractionalDist

      if (remaining >= spaceLeft) {
        remaining -= spaceLeft
        this.fractionalDist = 0
        this.currentWpIndex++
        this.totalDistance += spaceLeft
      } else {
        this.fractionalDist += remaining
        this.totalDistance += remaining
        remaining = 0
      }
    }

    if (this.currentWpIndex >= this.waypoints.length - 1) {
      this.arrived = true
    }
  }

  get percent() {
    return Math.min(100, (this.totalDistance / this.totalRouteDistance) * 100)
  }

  set totalRouteDistance(d) {
    this._totalRouteDist = d
  }
  get totalRouteDistance() {
    return this._totalRouteDist || this.waypoints[this.waypoints.length - 1]?.distFromPrev || 1
  }

  varySpeed() {
    this.speedVariance = 0.9 + Math.random() * 0.2
  }

  get currentSpeed() {
    return this.baseSpeed * this.speedVariance
  }
}

// ── Main simulation loop ────────────────────────────────────────────────────

async function runSimulation(opts) {
  console.log('🚗 Convoy Travel Simulation')
  console.log('─'.repeat(50))

  // 1. Auth
  console.log('Connecting to PocketBase...')
  await pbAuth()
  console.log('  ✓ Authenticated')

  // 2. Fetch convoy
  console.log(`Fetching convoy ${opts.convoyId}...`)
  const convoy = await pbGet(`/api/collections/convoys/records/${opts.convoyId}`)
  const srcLat = convoy.source_lat,
    srcLng = convoy.source_lng
  const dstLat = convoy.dest_lat,
    dstLng = convoy.dest_lng
  if (!srcLat || !srcLng || !dstLat || !dstLng) {
    console.error('  ✗ Convoy has no source/destination coordinates')
    process.exit(1)
  }
  console.log(`  ✓ ${convoy.name}`)
  console.log(`    Source: ${convoy.source_name || `${srcLat}, ${srcLng}`}`)
  console.log(`    Dest:   ${convoy.dest_name || `${dstLat}, ${dstLng}`}`)

  // 3. Fetch active members
  console.log('Fetching convoy members...')
  const membersData = await pbGet(
    `/api/collections/convoy_members/records?perPage=50&expand=vehicle,user&filter=convoy%3D%22${opts.convoyId}%22%20%26%26%20status%3D%22active%22`,
  )
  const members = membersData.items.map((m) => ({
    name: m.expand?.user?.name || 'Unknown',
    vehicleId: m.vehicle,
    plate: m.expand?.vehicle?.license_plate || '?',
  }))
  if (members.length === 0) {
    console.error('  ✗ No active members in convoy')
    process.exit(1)
  }
  console.log(`  ✓ ${members.length} members:`)
  members.forEach((m) => console.log(`    - ${m.name} (${m.plate})`))

  // 4. Fetch OSRM route
  console.log('Fetching route from OSRM...')
  let routeData = null
  for (const baseUrl of [OSRM_LOCAL_URL, OSRM_PUBLIC_URL]) {
    try {
      const url = `${baseUrl}/route/v1/driving/${srcLng},${srcLat};${dstLng},${dstLat}?overview=full&geometries=geojson&steps=false`
      const res = await fetch(url)
      const data = await res.json()
      if (data.code === 'Ok' && data.routes[0].distance > 0) {
        routeData = data.routes[0]
        console.log(
          `  ✓ Route: ${(routeData.distance / 1000).toFixed(1)} km, ${(routeData.duration / 60).toFixed(1)} min (${baseUrl})`,
        )
        break
      }
    } catch {
      /* try next */
    }
  }
  if (!routeData) {
    console.error('  ✗ Could not fetch route from any OSRM server')
    process.exit(1)
  }

  // 5. Resample to 75m waypoints
  console.log(`Resampling route to ${WP_INTERVAL_M}m waypoints...`)
  const coords = routeData.geometry.coordinates
  const waypoints = resampleRoute(coords, WP_INTERVAL_M)
  console.log(`  ✓ ${waypoints.length} waypoints (route: ${routeData.distance.toFixed(0)}m)`)

  // 6. Create vehicle simulators
  const speedProfiles = [13.9, 9.7, 12.0, 11.0, 15.0] // m/s (~50, ~35, ~43, ~40, ~54 km/h)
  const vehicles = members.map((m, i) => {
    const speed = speedProfiles[i % speedProfiles.length]
    const sim = new VehicleSimulator(m.name, m.vehicleId, speed, waypoints)
    sim.totalRouteDistance = routeData.distance
    return sim
  })

  console.log('\nVehicle speeds:')
  vehicles.forEach((v) => {
    const kmh = (v.baseSpeed * 3.6).toFixed(0)
    console.log(`  ${v.name}: ${kmh} km/h (${v.baseSpeed.toFixed(1)} m/s)`)
  })

  // 7. Clear old positions for this convoy
  if (!opts.dryRun) {
    console.log('\nClearing old positions...')
    try {
      const oldPositions = await pbGet(
        `/api/collections/positions/records?perPage=500&filter=convoy%3D%22${opts.convoyId}%22`,
      )
      let deleted = 0
      for (const pos of oldPositions.items) {
        await pbDelete('positions', pos.id)
        deleted++
      }
      console.log(`  ✓ Deleted ${deleted} old positions`)
    } catch (e) {
      console.log(`  ⚠ Could not clear old positions: ${e.message}`)
    }
  }

  // 8. Set simulation_active flag
  if (opts.setFlag && !opts.dryRun) {
    console.log('Setting simulation_active flag...')
    try {
      const settings =
        typeof convoy.settings === 'string' ? JSON.parse(convoy.settings) : convoy.settings || {}
      settings.simulation_active = true
      await pbPatch('convoys', opts.convoyId, { settings: JSON.stringify(settings) })
      console.log('  ✓ simulation_active = true (real GPS publishing paused)')
    } catch (e) {
      console.log(`  ⚠ Could not set flag: ${e.message}`)
    }
  }

  // 9. Simulation loop
  console.log('\n' + '═'.repeat(50))
  console.log('SIMULATION STARTED')
  console.log(`Speed factor: ${opts.speedFactor}x | Update interval: ${opts.interval}s`)
  console.log('Press Ctrl+C to stop early')
  console.log('═'.repeat(50) + '\n')

  const startTime = Date.now()
  let tick = 0
  let totalPublished = 0
  let running = true

  const cleanup = async () => {
    if (!running) return
    running = false
    console.log('\n\nStopping simulation...')

    if (opts.setFlag && !opts.dryRun) {
      try {
        const c = await pbGet(`/api/collections/convoys/records/${opts.convoyId}`)
        const settings = typeof c.settings === 'string' ? JSON.parse(c.settings) : c.settings || {}
        settings.simulation_active = false
        await pbPatch('convoys', opts.convoyId, { settings: JSON.stringify(settings) })
        console.log('  ✓ simulation_active = false (real GPS publishing resumed)')
      } catch {
        /* best effort */
      }
    }

    printSummary(startTime, totalPublished, vehicles, convoy, routeData)
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  while (running) {
    tick++
    const simTimeS = opts.interval * opts.speedFactor
    const statusParts = []
    let allArrived = true

    for (const vehicle of vehicles) {
      if (!vehicle.arrived) {
        allArrived = false
        vehicle.varySpeed()
        const advanceDist = vehicle.currentSpeed * simTimeS
        vehicle.advance(advanceDist)

        if (!opts.dryRun) {
          const pos = vehicle.position
          try {
            await pbUpsertPosition({
              vehicle: vehicle.vehicleId,
              convoy: opts.convoyId,
              lat: pos.lat,
              lng: pos.lng,
              speed: vehicle.currentSpeed,
              heading: Math.round(pos.heading),
              accuracy: 5,
            })
            vehicle.positionCount++
            totalPublished++
          } catch (e) {
            console.warn(`  ⚠ ${vehicle.name} position failed: ${e.message}`)
          }
        } else {
          vehicle.positionCount++
          totalPublished++
        }
      }

      const distKm = (vehicle.totalDistance / 1000).toFixed(2)
      const pct = vehicle.percent.toFixed(0)
      const status = vehicle.arrived
        ? `✅ arrived`
        : `${distKm} km (${pct}%) @ ${(vehicle.currentSpeed * 3.6).toFixed(0)} km/h`
      statusParts.push(`${vehicle.name}: ${status}`)

      if (vehicle.arrived && !vehicle._loggedArrival) {
        vehicle._loggedArrival = true
        const elapsed = (((Date.now() - startTime) / 1000) * opts.speedFactor).toFixed(0)
        console.log(`  🏁 ${vehicle.name} arrived at destination! (${elapsed}s simulated)`)
      }
    }

    const realElapsed = ((Date.now() - startTime) / 1000).toFixed(0)
    const simElapsed = (((Date.now() - startTime) / 1000) * opts.speedFactor).toFixed(0)
    const pad = (s) => s.padEnd(40)
    process.stdout.write(`\r  [T+${simElapsed}s] ${statusParts.map(pad).join(' | ')} `)

    if (allArrived) {
      console.log('\n\n  🎉 All vehicles arrived!')
      break
    }

    await new Promise((r) => setTimeout(r, opts.interval * 1000))
  }

  await cleanup()
}

function printSummary(startTime, totalPublished, vehicles, convoy, routeData) {
  const realSec = (Date.now() - startTime) / 1000
  console.log('\n' + '═'.repeat(50))
  console.log('SIMULATION SUMMARY')
  console.log('═'.repeat(50))
  console.log(`Convoy:    ${convoy.name} (${convoy.code})`)
  console.log(`Route:     ${(routeData.distance / 1000).toFixed(1)} km`)
  console.log(`Wall time: ${realSec.toFixed(1)}s`)
  console.log('')
  for (const v of vehicles) {
    const distKm = (v.totalDistance / 1000).toFixed(1)
    const avgKmh = v.totalDistance > 0 ? ((v.totalDistance / (realSec || 1)) * 3.6).toFixed(1) : '0'
    const status = v.arrived ? 'arrived' : `${v.percent.toFixed(0)}%`
    console.log(
      `  ${v.name}: ${distKm} km | ${v.positionCount} positions | avg ${avgKmh} km/h | ${status}`,
    )
  }
  console.log(`\nTotal positions published: ${totalPublished}`)
  console.log('═'.repeat(50))
}

// ── Run ─────────────────────────────────────────────────────────────────────

const opts = parseArgs()
runSimulation(opts).catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`)
  process.exit(1)
})
