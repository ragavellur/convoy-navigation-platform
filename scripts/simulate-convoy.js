const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://convoy-pocketbase:8090'

const EARTH_M = 40075000

function offsetFrom(lat, lng, bearingDeg, distM) {
  const bearingRad = (bearingDeg * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  const d = distM / EARTH_M
  const newLat = Math.asin(
    Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(bearingRad),
  )
  const newLng =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(d) * Math.cos(latRad),
      Math.cos(d) - Math.sin(latRad) * Math.sin(newLat),
    )
  return { lat: (newLat * 180) / Math.PI, lng: (newLng * 180) / Math.PI }
}

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
  if (!convoy.source_lat || !convoy.source_lng || !convoy.dest_lat || !convoy.dest_lng) {
    console.error('Convoy must have source_lat/lng and dest_lat/lng')
    process.exit(1)
  }

  const membersData = await pbGet(
    token,
    `/api/collections/convoy_members/records?perPage=50&filter=${encodeURIComponent(`convoy="${convoyId}" && status="active"`)}&expand=vehicle`,
  )
  const members = membersData.items || []
  const vehicles = members
    .filter((m) => m.vehicle)
    .map((m) => ({ memberId: m.id, userId: m.user, vehicleId: m.vehicle }))

  if (vehicles.length === 0) {
    console.error('No vehicles found in convoy')
    process.exit(0)
  }

  const assemblyPt = { lat: convoy.source_lat, lng: convoy.source_lng }
  const destPt = { lat: convoy.dest_lat, lng: convoy.dest_lng }

  const scatterPositions = vehicles.map((_, i) => {
    const angle = (i / vehicles.length) * 360
    const dist = 100 + (i % 5) * 50
    return offsetFrom(assemblyPt.lat, assemblyPt.lng, angle, dist)
  })

  let assemblyProgress = new Array(vehicles.length).fill(0)
  let transitProgress = 0
  const VEHICLE_SPEED_VARIANCE = 0.3

  console.log(
    `[simulate-convoy] ${vehicles.length} vehicles, assembly at ${assemblyPt.lat},${assemblyPt.lng}`,
  )

  while (true) {
    const fresh = await pbGet(token, `/api/collections/convoys/records/${convoyId}`)
    const phase = fresh.phase || 'forming'

    if (phase === 'completed' || phase === 'forming') {
      console.log(`[simulate-convoy] Phase=${phase} — waiting...`)
      await sleep(interval * 1000)
      continue
    }

    const assembledMembers = fresh.assembled_members || []

    if (phase === 'assembling') {
      for (let i = 0; i < vehicles.length; i++) {
        if (assembledMembers.includes(vehicles[i].userId)) continue

        const speedVar = 1 + (i % 3) * VEHICLE_SPEED_VARIANCE
        assemblyProgress[i] += (0.02 * speedFactor * speedVar) / (interval * 10)
        assemblyProgress[i] = Math.min(assemblyProgress[i], 1)

        const pos = interpolate(scatterPositions[i], assemblyPt, assemblyProgress[i])
        const speed = assemblyProgress[i] < 1 ? 5 * speedFactor * speedVar : 0
        const bearing =
          assemblyProgress[i] < 1
            ? (Math.atan2(assemblyPt.lng - pos.lng, assemblyPt.lat - pos.lat) * 180) / Math.PI
            : 0

        await pbUpsertPosition(
          token,
          vehicles[i].vehicleId,
          convoyId,
          pos.lat,
          pos.lng,
          speed,
          bearing,
        )
      }
      console.log(
        `[simulate-convoy] Assembly: ${assembledMembers.length}/${vehicles.length} arrived, progress=[${assemblyProgress.map((p) => p.toFixed(2)).join(', ')}]`,
      )
    }

    if (phase === 'in_transit') {
      const delta = (0.01 * speedFactor) / (interval * 10)
      transitProgress += delta
      transitProgress = Math.min(transitProgress, 1)

      for (let i = 0; i < vehicles.length; i++) {
        const offset = i % 2 === 0 ? 0.00005 : -0.00005
        const lat =
          destPt.lat * transitProgress + assemblyPt.lat * (1 - transitProgress) + offset * (i % 3)
        const lng =
          destPt.lng * transitProgress +
          assemblyPt.lng * (1 - transitProgress) +
          offset * ((i + 1) % 3)
        const speed = transitProgress < 1 ? 10 * speedFactor : 0
        const bearing = transitProgress < 1 ? 45 : 0

        await pbUpsertPosition(token, vehicles[i].vehicleId, convoyId, lat, lng, speed, bearing)
      }
      console.log(`[simulate-convoy] Transit: ${(transitProgress * 100).toFixed(1)}%`)

      if (transitProgress >= 1) {
        console.log('[simulate-convoy] Destination reached — setting phase to completed')
        await pbUpdate(token, 'convoys', convoyId, { phase: 'completed' })
        process.exit(0)
      }
    }

    await sleep(interval * 1000)
  }
}

main().catch((err) => {
  console.error('[simulate-convoy] Fatal error:', err)
  process.exit(1)
})
