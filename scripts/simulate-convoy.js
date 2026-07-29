const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://convoy-pocketbase:8090'

function interpolate(from, to, t) {
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t,
  }
}

async function pbAuth() {
  const email = process.env.POCKETBASE_ADMIN_EMAIL || process.env.PB_ADMIN_EMAIL
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || process.env.PB_ADMIN_PASSWORD
  if (!email || !password) {
    console.error('POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set')
    process.exit(1)
  }
  const res = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`PB auth failed: ${res.status} ${text}`)
    process.exit(1)
  }
  const data = await res.json()
  return data.token
}

async function pbGet(token, apiPath) {
  const res = await fetch(`${POCKETBASE_URL}${apiPath}`, {
    headers: { Authorization: token },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PB GET ${apiPath} failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function pbUpdate(token, collection, id, data) {
  const res = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records/${id}`, {
    method: 'PATCH',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`PB PATCH ${collection}/${id} failed: ${res.status} ${text}`)
  }
}

async function pbUpsertPosition(token, vehicleId, convoyId, lat, lng, speed, heading) {
  let existing
  try {
    existing = await pbGet(
      token,
      `/api/collections/positions/records?filter=${encodeURIComponent(`vehicle="${vehicleId}" && convoy="${convoyId}"`)}&perPage=1`,
    )
  } catch {
    existing = { items: [] }
  }

  const data = { vehicle: vehicleId, convoy: convoyId, lat, lng, speed, heading, accuracy: 10 }

  if (existing.items && existing.items.length > 0) {
    const pid = existing.items[0].id
    const res = await fetch(`${POCKETBASE_URL}/api/collections/positions/records/${pid}`, {
      method: 'PATCH',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`PB PATCH position failed: ${res.status} ${text}`)
    }
  } else {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/positions/records`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`PB CREATE position failed: ${res.status} ${text}`)
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const convoyId = process.argv[2]
  const speedFactor =
    parseFloat(process.argv[3] === '--speed-factor' ? process.argv[4] : '10') || 10
  const interval = parseFloat(process.argv[5] === '--interval' ? process.argv[6] : '2') || 2

  if (!convoyId) {
    console.error('Usage: node simulate-convoy.js <convoyId> [--speed-factor N] [--interval N]')
    process.exit(1)
  }

  console.log(
    `[simulate-convoy] Starting for convoy ${convoyId}, speedFactor=${speedFactor}, interval=${interval}s`,
  )

  const token = await pbAuth()

  const convoy = await pbGet(token, `/api/collections/convoys/records/${convoyId}`)
  if (!convoy.dest_lat || !convoy.dest_lng) {
    console.error('Convoy must have dest_lat/lng')
    process.exit(1)
  }

  const membersData = await pbGet(
    token,
    `/api/collections/convoy_members/records?perPage=50&filter=${encodeURIComponent(`convoy="${convoyId}" && status="active"`)}&expand=vehicle`,
  )
  const members = membersData.items || []

  // Build vehicle list with route_geometry from each member's record
  const vehicles = members
    .filter((m) => m.vehicle)
    .map((m) => {
      let geometry = null
      if (m.route_geometry) {
        try {
          geometry =
            typeof m.route_geometry === 'string' ? JSON.parse(m.route_geometry) : m.route_geometry
        } catch {}
      }
      return {
        memberId: m.id,
        userId: m.user,
        vehicleId: m.vehicle,
        geometry,
      }
    })

  if (vehicles.length === 0) {
    console.error('No vehicles found in convoy')
    process.exit(0)
  }

  // Filter to only vehicles with route geometry
  const activeVehicles = vehicles.filter((v) => v.geometry && v.geometry.length > 1)
  if (activeVehicles.length === 0) {
    console.error('No vehicles with route_geometry found. Calculate meeting point first.')
    process.exit(0)
  }

  const meetingPt =
    convoy.source_lat && convoy.source_lng
      ? { lat: convoy.source_lat, lng: convoy.source_lng }
      : null

  // Convert meeting point to 4dp hash for detecting arrival
  const meetingHash = meetingPt
    ? `${Math.round(meetingPt.lat * 10000)},${Math.round(meetingPt.lng * 10000)}`
    : null

  // Each vehicle has its own coord index into its geometry
  let coordIdxs = new Array(activeVehicles.length).fill(0)
  const VEHICLE_SPEED_VARIANCE = 0.3

  console.log(`[simulate-convoy] ${activeVehicles.length} vehicles with route geometries`)

  while (true) {
    const fresh = await pbGet(token, `/api/collections/convoys/records/${convoyId}`)
    const phase = fresh.phase || 'forming'

    if (phase === 'completed' || phase === 'forming') {
      console.log(`[simulate-convoy] Phase=${phase} — waiting...`)
      await sleep(interval * 1000)
      continue
    }

    let assembledMembers = fresh.assembled_members || []
    let allDone = true

    for (let i = 0; i < activeVehicles.length; i++) {
      const v = activeVehicles[i]
      const geo = v.geometry
      const speedVar = 1 + (i % 3) * VEHICLE_SPEED_VARIANCE
      const step = 3 * speedFactor * speedVar

      coordIdxs[i] = Math.min(coordIdxs[i] + step, geo.length - 1)
      const idx = Math.floor(coordIdxs[i])
      const frac = coordIdxs[i] - idx

      let pos
      if (idx < geo.length - 1) {
        pos = {
          lat: geo[idx][1] + (geo[idx + 1][1] - geo[idx][1]) * frac,
          lng: geo[idx][0] + (geo[idx + 1][0] - geo[idx][0]) * frac,
        }
      } else {
        pos = { lat: geo[geo.length - 1][1], lng: geo[geo.length - 1][0] }
      }

      const arrived = coordIdxs[i] >= geo.length - 1
      const speed = arrived ? 0 : 15 * speedFactor * speedVar

      await pbUpsertPosition(token, v.vehicleId, convoyId, pos.lat, pos.lng, speed, 0)

      if (!arrived) allDone = false

      // Auto-mark as arrived when crossing the meeting point (or at route end)
      if (!assembledMembers.includes(v.userId) && meetingHash) {
        const currentHash = `${Math.round(pos.lat * 10000)},${Math.round(pos.lng * 10000)}`
        if (currentHash === meetingHash || arrived) {
          assembledMembers = [...assembledMembers, v.userId]
          await pbUpdate(token, 'convoys', convoyId, { assembled_members: assembledMembers })
          console.log(`[simulate-convoy] ${v.vehicleId} arrived at meeting point`)
        }
      }
    }

    // Auto-transition based on phase
    if (phase === 'assembling' && assembledMembers.length >= activeVehicles.length) {
      console.log('[simulate-convoy] All assembled — transitioning to in_transit')
      await pbUpdate(token, 'convoys', convoyId, { phase: 'in_transit', assembled_members: [] })
      assembledMembers = []
    }

    console.log(
      `[simulate-convoy] Phase=${phase} ${assembledMembers.length}/${activeVehicles.length} assembled, progress=${coordIdxs.map((c, i) => `${((c / (activeVehicles[i].geometry.length - 1)) * 100).toFixed(0)}%`).join(' ')}`,
    )

    if (allDone && phase === 'in_transit') {
      console.log('[simulate-convoy] All vehicles at destination — setting phase to completed')
      await pbUpdate(token, 'convoys', convoyId, { phase: 'completed' })
      process.exit(0)
    }

    await sleep(interval * 1000)
  }
}

main().catch((err) => {
  console.error('[simulate-convoy] Fatal error:', err)
  process.exit(1)
})
