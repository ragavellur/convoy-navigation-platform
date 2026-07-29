const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://convoy-pocketbase:8090'
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org'

function interpolate(from, to, t) {
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t,
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function fetchOsrmRoute(from, to) {
  const PUBLIC_OSRM = 'https://router.project-osrm.org'
  const urls = [OSRM_URL, PUBLIC_OSRM]
  for (const baseUrl of urls) {
    try {
      const res = await fetch(
        `${baseUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false&alternatives=false`,
        { signal: AbortSignal.timeout(15000) },
      )
      if (!res.ok) continue
      const data = await res.json()
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

async function pbAuth() {
  const email = process.env.POCKETBASE_ADMIN_EMAIL || process.env.PB_ADMIN_EMAIL
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || process.env.PB_ADMIN_PASSWORD
  if (!email || !password) {
    console.error('POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set')
    process.exit(1)
  }
  const res = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
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

function coord4dp(coord) {
  return `${Math.round(coord[1] * 10000)},${Math.round(coord[0] * 10000)}`
}

async function main() {
  const convoyId = process.argv[2]
  const speedFactor =
    parseFloat(process.argv[3] === '--speed-factor' ? process.argv[4] : '10') || 10
  const interval = parseFloat(process.argv[5] === '--interval' ? process.argv[6] : '2') || 2

  const waitIdx = process.argv.indexOf('--wait-at-meeting')
  const waitAtMeeting = waitIdx === -1 ? true : process.argv[waitIdx + 1] !== 'false'

  if (!convoyId) {
    console.error(
      'Usage: node simulate-convoy.js <convoyId> [--speed-factor N] [--interval N] [--wait-at-meeting true|false]',
    )
    process.exit(1)
  }

  console.log(
    `[simulate-convoy] Starting for convoy ${convoyId}, speedFactor=${speedFactor}, interval=${interval}s, waitAtMeeting=${waitAtMeeting}`,
  )

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

  // Auto-calc routes for members without route_geometry
  let needsCalc = false
  for (const v of vehicles) {
    if (!v.geometry || v.geometry.length < 2) {
      const member = members.find((m) => m.id === v.memberId)
      if (member && member.join_lat != null && member.join_lng != null) {
        needsCalc = true
      }
    }
  }

  if (needsCalc) {
    console.log(`[simulate-convoy] ${vehicles.length} vehicles, calculating OSRM routes...`)
    const destPt = { lat: convoy.dest_lat, lng: convoy.dest_lng }
    for (const v of vehicles) {
      if (v.geometry && v.geometry.length > 1) continue
      const member = members.find((m) => m.id === v.memberId)
      if (!member || member.join_lat == null || member.join_lng == null) {
        console.log(`[simulate-convoy] ${v.vehicleId}: no start location, skipping`)
        continue
      }
      const from = { lat: member.join_lat, lng: member.join_lng }
      const coords = await fetchOsrmRoute(from, destPt)
      if (coords && coords.length > 1) {
        v.geometry = coords
        await pbUpdate(token, 'convoy_members', v.memberId, { route_geometry: coords })
        console.log(`[simulate-convoy] ${v.vehicleId}: route fetched (${coords.length} points)`)
      } else {
        // Fallback: straight line
        const line = [
          [from.lng, from.lat],
          [destPt.lng, destPt.lat],
        ]
        v.geometry = line
        await pbUpdate(token, 'convoy_members', v.memberId, { route_geometry: line })
        console.log(`[simulate-convoy] ${v.vehicleId}: OSRM failed, using straight line`)
      }
    }
  }

  // Filter to only vehicles with route geometry
  const activeVehicles = vehicles.filter((v) => v.geometry && v.geometry.length > 1)
  if (activeVehicles.length === 0) {
    console.error('No vehicles with route_geometry found.')
    process.exit(0)
  }

  // Calculate meeting point from all members' routes
  // Algorithm: walk owner's route forward, find first coord present in ALL members' geometries
  {
    const active = members.filter((m) => m.join_lat != null && m.join_lng != null)
    const owner = members.find((m) => m.role === 'owner')
    let meetingPoint = null

    if (owner && active.length >= 2) {
      const ownerGeom = vehicles.find((v) => v.userId === owner.user)?.geometry
      const otherGeoms = active
        .filter((m) => m.user !== owner.user)
        .map((m) => vehicles.find((v) => v.userId === m.user)?.geometry)
        .filter(Boolean)

      if (ownerGeom && otherGeoms.length > 0) {
        const hashSets = otherGeoms.map((geo) => {
          const s = new Set()
          for (const c of geo) s.add(coord4dp(c))
          return s
        })
        for (const c of ownerGeom) {
          const h = coord4dp(c)
          if (hashSets.every((s) => s.has(h))) {
            meetingPoint = { lat: c[1], lng: c[0] }
            break
          }
        }
      }
    }

    if (!meetingPoint) {
      meetingPoint = { lat: convoy.dest_lat, lng: convoy.dest_lng }
    }

    convoy.source_lat = meetingPoint.lat
    convoy.source_lng = meetingPoint.lng
    await pbUpdate(token, 'convoys', convoyId, {
      source_lat: meetingPoint.lat,
      source_lng: meetingPoint.lng,
      source_name:
        meetingPoint.lat === convoy.dest_lat && meetingPoint.lng === convoy.dest_lng
          ? 'Destination'
          : 'Merging point',
    })
    console.log(
      `[simulate-convoy] Meeting point set: ${meetingPoint.lat},${meetingPoint.lng}${
        meetingPoint.lat === convoy.dest_lat && meetingPoint.lng === convoy.dest_lng
          ? ' (destination)'
          : ''
      }`,
    )
  }

  const ASSEMBLY_DISTANCE_M = 80

  // For each vehicle, find the route index nearest the meeting point
  const meetingIdxs = new Array(activeVehicles.length).fill(-1)
  if (waitAtMeeting && convoy.source_lat && convoy.source_lng) {
    for (let i = 0; i < activeVehicles.length; i++) {
      const geo = activeVehicles[i].geometry
      let bestIdx = -1
      let bestDist = Infinity
      for (let j = 0; j < geo.length; j++) {
        const dLat = geo[j][1] - convoy.source_lat
        const dLng = geo[j][0] - convoy.source_lng
        const dist = Math.sqrt(dLat * dLat + dLng * dLng)
        if (dist < bestDist) {
          bestDist = dist
          bestIdx = j
        }
      }
      meetingIdxs[i] = bestIdx
      console.log(
        `[simulate-convoy] ${activeVehicles[i].vehicleId}: meeting idx=${bestIdx}/${geo.length - 1} (dist=${(bestDist * 111320).toFixed(0)}m)`,
      )
    }
  }

  // Each vehicle has its own coord index into its geometry
  let coordIdxs = new Array(activeVehicles.length).fill(0)
  const VEHICLE_SPEED_VARIANCE = 0.3

  // Set phase to assembling if forming or completed (restart)
  if (!convoy.phase || convoy.phase === 'forming' || convoy.phase === 'completed') {
    console.log(`[simulate-convoy] Setting phase from ${convoy.phase} to assembling`)
    await pbUpdate(token, 'convoys', convoyId, { phase: 'assembling', assembled_members: [] })
  }

  console.log(`[simulate-convoy] ${activeVehicles.length} vehicles with route geometries`)
  if (waitAtMeeting) {
    console.log(
      `[simulate-convoy] waitAtMeeting=ON — vehicles drive to destination, assembly detected within ${ASSEMBLY_DISTANCE_M}m of meeting point`,
    )
  }

  while (true) {
    const fresh = await pbGet(token, `/api/collections/convoys/records/${convoyId}`)
    const phase = fresh.phase || 'forming'

    if (phase === 'completed') {
      console.log('[simulate-convoy] Phase=completed — nothing to simulate, exiting')
      process.exit(0)
    }
    if (phase === 'forming') {
      console.log(`[simulate-convoy] Phase=${phase} — waiting...`)
      await sleep(interval * 1000)
      continue
    }

    let assembledMembers = fresh.assembled_members || []
    let allDone = true

    const isAssembling = phase === 'assembling' && waitAtMeeting

    // First pass: advance all vehicles toward destination (or meeting point during assembling)
    for (let i = 0; i < activeVehicles.length; i++) {
      const v = activeVehicles[i]
      const geo = v.geometry
      const capIdx = isAssembling && meetingIdxs[i] >= 0 ? meetingIdxs[i] : geo.length - 1
      const target = capIdx
      const speedVar = 1 + (i % 3) * VEHICLE_SPEED_VARIANCE
      const step = 3 * speedFactor * speedVar

      if (coordIdxs[i] < target) {
        coordIdxs[i] = Math.min(coordIdxs[i] + step, target)
      }

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
      if (!arrived) allDone = false

      v._pos = pos
      v._arrived = arrived
    }

    // Second pass: detect convergence at meeting point
    const converged = new Set()
    if (isAssembling) {
      for (let i = 0; i < activeVehicles.length; i++) {
        const a = activeVehicles[i]
        if (a._arrived) {
          converged.add(a.userId)
          continue
        }
        const meetingIdx = meetingIdxs[i]
        if (meetingIdx < 0) continue
        const geo = activeVehicles[i].geometry
        const meetingCoord = geo[meetingIdx]
        const dLat = a._pos.lat - meetingCoord[1]
        const dLng = a._pos.lng - meetingCoord[0]
        const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111320
        if (dist < ASSEMBLY_DISTANCE_M) {
          converged.add(a.userId)
        }
      }
    }

    // Third pass: write positions, set speed, mark assembled
    for (let i = 0; i < activeVehicles.length; i++) {
      const v = activeVehicles[i]
      const waiting = v._arrived || (isAssembling && converged.has(v.userId))
      const speed =
        v._arrived || waiting ? 0 : 15 * speedFactor * (1 + (i % 3) * VEHICLE_SPEED_VARIANCE)
      await pbUpsertPosition(token, v.vehicleId, convoyId, v._pos.lat, v._pos.lng, speed, 0)

      if (!assembledMembers.includes(v.userId)) {
        if (v._arrived || (isAssembling && converged.has(v.userId))) {
          assembledMembers = [...assembledMembers, v.userId]
          await pbUpdate(token, 'convoys', convoyId, { assembled_members: assembledMembers })
          console.log(`[simulate-convoy] ${v.vehicleId} assembled`)
        }
      }
    }

    // Auto-transition based on phase
    if (phase === 'assembling') {
      if (assembledMembers.length >= activeVehicles.length) {
        const nextPhase = 'in_transit'
        console.log(
          `[simulate-convoy] ${assembledMembers.length}/${activeVehicles.length} assembled — transitioning to ${nextPhase}`,
        )
        await pbUpdate(token, 'convoys', convoyId, { phase: nextPhase, assembled_members: [] })
        assembledMembers = []
      }
    }

    console.log(
      `[simulate-convoy] Phase=${phase} ${assembledMembers.length}/${activeVehicles.length} assembled, progress=${coordIdxs.map((c, i) => `${((c / (activeVehicles[i].geometry.length - 1)) * 100).toFixed(0)}%`).join(' ')}`,
    )

    if (allDone) {
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
