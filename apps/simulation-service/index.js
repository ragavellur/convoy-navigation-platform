const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const app = express()

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(limiter)
app.use(helmet())
app.use(cors())
app.use(express.json())

const PORT = process.env.SIMULATION_PORT || 3002
const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://convoy-pocketbase:8090'
const OSRM_URL = process.env.OSRM_URL || 'http://convoy-osrm:5000'
const SCRIPT_PATH = path.join(__dirname, 'scripts', 'simulate-convoy.js')

const PB_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@convoy.local'
const PB_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'admin123456'

const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_EMAIL_RAW = process.env.VAPID_EMAIL || 'mailto:raga.vellur@gmail.com'
const VAPID_EMAIL = VAPID_EMAIL_RAW.startsWith('mailto:')
  ? VAPID_EMAIL_RAW
  : `mailto:${VAPID_EMAIL_RAW}`

if (VAPID_PRIVATE_KEY && VAPID_PUBLIC_KEY) {
  const webpush = require('web-push')
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  global.webpush = webpush
  console.log('Web Push VAPID configured')
} else {
  console.warn('VAPID keys not set — push notifications disabled')
}

const runningSimulations = new Map()
let cachedToken = null
const TOKEN_EXPIRY_BUFFER_S = 300

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return (payload.exp || 0) * 1000 < Date.now() + TOKEN_EXPIRY_BUFFER_S * 1000
  } catch {
    return true
  }
}

async function getAuthToken() {
  if (cachedToken && !isTokenExpired(cachedToken)) return cachedToken
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
    })
    if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
    const data = await res.json()
    cachedToken = data.token
    return cachedToken
  } catch (err) {
    console.error('PB auth error:', err.message)
    cachedToken = null
    return null
  }
}

async function pbRequest(method, apiPath, body, retried) {
  const token = await getAuthToken()
  if (!token) throw new Error('Not authenticated with PocketBase')
  const headers = { Authorization: token }
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${POCKETBASE_URL}${apiPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && !retried) {
    cachedToken = null
    return pbRequest(method, apiPath, body, true)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PB ${method} ${apiPath} failed: ${res.status} ${text}`)
  }
  return res.json()
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', running: runningSimulations.size })
})

app.post('/api/push/send', async (req, res) => {
  if (!global.webpush) {
    return res.status(503).json({ error: 'Push notifications not configured (missing VAPID keys)' })
  }

  const { convoyId, title, body, url } = req.body
  if (!convoyId || !title || !body) {
    return res.status(400).json({ error: 'convoyId, title, and body are required' })
  }

  try {
    const subsData = await pbRequest(
      'GET',
      `/api/collections/push_subscriptions/records?page=1&perPage=100&filter=${encodeURIComponent(`user != ""`)}`,
    )

    const subscriptions = subsData.items || []
    if (subscriptions.length === 0) {
      return res.json({ success: true, sent: 0, total: 0, message: 'No active subscribers' })
    }

    let sent = 0
    let failed = 0
    let deletedInvalid = 0

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icons/logo.png',
      badge: '/icons/icon-192x192.png',
      url: url || '/map?convoy=' + convoyId,
      convoyId,
    })

    for (const sub of subscriptions) {
      try {
        await global.webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        )
        sent++
      } catch (err) {
        failed++
        if (err.statusCode === 404 || err.statusCode === 410) {
          try {
            await pbRequest('DELETE', `/api/collections/push_subscriptions/records/${sub.id}`)
            deletedInvalid++
          } catch {
            /* skip */
          }
        }
        console.error(
          `Push failed for ${sub.endpoint.slice(0, 30)}...:`,
          err.statusCode || err.message,
        )
      }
    }

    res.json({ success: true, sent, failed, deletedInvalid, total: subscriptions.length })
  } catch (err) {
    console.error('Push send error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/simulation/status/:convoyId', (req, res) => {
  const { convoyId } = req.params
  const sim = runningSimulations.get(convoyId)
  if (!sim) {
    return res.json({ running: false, convoyId })
  }
  res.json({
    running: true,
    convoyId,
    speedFactor: sim.speedFactor,
    interval: sim.interval,
    startedAt: sim.startedAt,
    pid: sim.process.pid,
  })
})

app.post('/api/simulation/start', async (req, res) => {
  const { convoyId, speedFactor = 10, interval = 2, waitAtMeeting = true } = req.body
  if (!convoyId) {
    return res.status(400).json({ error: 'convoyId is required' })
  }

  if (runningSimulations.has(convoyId)) {
    return res.status(409).json({ error: 'Simulation already running for this convoy' })
  }

  if (!fs.existsSync(SCRIPT_PATH)) {
    return res.status(500).json({ error: 'Simulation script not found', path: SCRIPT_PATH })
  }

  const args = [
    SCRIPT_PATH,
    convoyId,
    '--speed-factor',
    String(speedFactor),
    '--interval',
    String(interval),
    '--wait-at-meeting',
    String(waitAtMeeting),
  ]

  const child = spawn('node', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      POCKETBASE_URL,
      OSRM_LOCAL_URL: OSRM_URL,
      OSRM_URL,
    },
  })

  const sim = {
    process: child,
    speedFactor,
    interval,
    startedAt: new Date().toISOString(),
    logs: [],
  }

  child.stdout.on('data', (data) => {
    const line = data.toString().trim()
    if (line) {
      console.log(`[sim:${convoyId}] ${line}`)
      sim.logs.push({ type: 'stdout', line, time: new Date().toISOString() })
      if (sim.logs.length > 500) sim.logs.shift()
    }
  })

  child.stderr.on('data', (data) => {
    const line = data.toString().trim()
    if (line) {
      console.error(`[sim:${convoyId}] ${line}`)
      sim.logs.push({ type: 'stderr', line, time: new Date().toISOString() })
      if (sim.logs.length > 500) sim.logs.shift()
    }
  })

  child.on('exit', (code) => {
    console.log(`[sim:${convoyId}] Process exited with code ${code}`)
    sim.logs.push({
      type: 'exit',
      line: `Process exited with code ${code}`,
      time: new Date().toISOString(),
    })
    runningSimulations.delete(convoyId)
    setSimulationFlag(convoyId, false).catch(() => {})
  })

  child.on('error', (err) => {
    console.error(`[sim:${convoyId}] Process error: ${err.message}`)
    sim.logs.push({ type: 'error', line: err.message, time: new Date().toISOString() })
    runningSimulations.delete(convoyId)
    setSimulationFlag(convoyId, false).catch(() => {})
  })

  runningSimulations.set(convoyId, sim)

  try {
    await setSimulationFlag(convoyId, true)
    res.json({
      success: true,
      convoyId,
      pid: child.pid,
      speedFactor,
      interval,
    })
  } catch (err) {
    child.kill('SIGTERM')
    runningSimulations.delete(convoyId)
    res.status(500).json({ error: 'Failed to set simulation_active flag', details: err.message })
  }
})

app.post('/api/simulation/stop', async (req, res) => {
  const { convoyId } = req.body
  if (!convoyId) {
    return res.status(400).json({ error: 'convoyId is required' })
  }

  const sim = runningSimulations.get(convoyId)
  if (sim) {
    sim.process.kill('SIGTERM')
    runningSimulations.delete(convoyId)
  }

  try {
    await setSimulationFlag(convoyId, false)
  } catch {
    // flag may not exist, that's ok
  }
  res.json({ success: true, convoyId, message: 'Simulation stopped' })
})

app.post('/api/simulation/restart', async (req, res) => {
  const { convoyId, speedFactor = 10, interval = 2, waitAtMeeting = true } = req.body
  if (!convoyId) {
    return res.status(400).json({ error: 'convoyId is required' })
  }

  const sim = runningSimulations.get(convoyId)
  if (sim) {
    sim.process.kill('SIGTERM')
    runningSimulations.delete(convoyId)
  }

  try {
    await setSimulationFlag(convoyId, false)
  } catch {
    /* ok */
  }

  const clearResult = await clearPositions(convoyId)

  const args = [
    SCRIPT_PATH,
    convoyId,
    '--speed-factor',
    String(speedFactor),
    '--interval',
    String(interval),
    '--wait-at-meeting',
    String(waitAtMeeting),
  ]

  const child = spawn('node', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      POCKETBASE_URL,
      OSRM_LOCAL_URL: OSRM_URL,
      OSRM_URL,
    },
  })

  const newSim = {
    process: child,
    speedFactor,
    interval,
    startedAt: new Date().toISOString(),
    logs: [
      {
        type: 'info',
        line: `Restarted after clearing ${clearResult.deleted} positions`,
        time: new Date().toISOString(),
      },
    ],
  }

  child.stdout.on('data', (data) => {
    const line = data.toString().trim()
    if (line) {
      console.log(`[sim:${convoyId}] ${line}`)
      newSim.logs.push({ type: 'stdout', line, time: new Date().toISOString() })
      if (newSim.logs.length > 500) newSim.logs.shift()
    }
  })

  child.stderr.on('data', (data) => {
    const line = data.toString().trim()
    if (line) {
      console.error(`[sim:${convoyId}] ${line}`)
      newSim.logs.push({ type: 'stderr', line, time: new Date().toISOString() })
      if (newSim.logs.length > 500) newSim.logs.shift()
    }
  })

  child.on('exit', (code) => {
    console.log(`[sim:${convoyId}] Process exited with code ${code}`)
    newSim.logs.push({
      type: 'exit',
      line: `Process exited with code ${code}`,
      time: new Date().toISOString(),
    })
    runningSimulations.delete(convoyId)
    setSimulationFlag(convoyId, false).catch(() => {})
  })

  child.on('error', (err) => {
    console.error(`[sim:${convoyId}] Process error: ${err.message}`)
    newSim.logs.push({ type: 'error', line: err.message, time: new Date().toISOString() })
    runningSimulations.delete(convoyId)
    setSimulationFlag(convoyId, false).catch(() => {})
  })

  runningSimulations.set(convoyId, newSim)

  try {
    await setSimulationFlag(convoyId, true)
    res.json({
      success: true,
      convoyId,
      pid: child.pid,
      speedFactor,
      interval,
      clearedPositions: clearResult.deleted,
    })
  } catch (err) {
    child.kill('SIGTERM')
    runningSimulations.delete(convoyId)
    res.status(500).json({ error: 'Failed to set simulation_active flag', details: err.message })
  }
})

app.post('/api/simulation/clear', async (req, res) => {
  const { convoyId } = req.body
  if (!convoyId) {
    return res.status(400).json({ error: 'convoyId is required' })
  }

  try {
    const result = await clearPositions(convoyId)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/simulation/cleanup', async (req, res) => {
  const { convoyId } = req.body
  if (!convoyId) {
    return res.status(400).json({ error: 'convoyId is required' })
  }

  try {
    const result = await cleanupKeepLatest(convoyId)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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
        { signal: AbortSignal.timeout(8000) },
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

function coord4dp(coords) {
  return `${Math.round(coords[1] * 10000)},${Math.round(coords[0] * 10000)}`
}

app.post('/api/assembly/calculate', async (req, res) => {
  const { convoyId } = req.body
  if (!convoyId) return res.status(400).json({ error: 'convoyId is required' })

  try {
    const convoy = await pbRequest('GET', `/api/collections/convoys/records/${convoyId}`)
    const destLat = convoy.dest_lat
    const destLng = convoy.dest_lng
    if (destLat == null || destLng == null) {
      return res.status(400).json({ error: 'Convoy has no destination' })
    }

    const membersData = await pbRequest(
      'GET',
      `/api/collections/convoy_members/records?perPage=200&filter=${encodeURIComponent(`convoy="${convoyId}" && status="active"`)}`,
    )
    const items = membersData.items || []
    const activeMembers = items.filter((m) => m.join_lat != null && m.join_lng != null)

    if (activeMembers.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 members with starting points' })
    }

    const owner = items.find((m) => m.role === 'owner')
    if (!owner || owner.join_lat == null || owner.join_lng == null) {
      return res.status(400).json({ error: 'Owner has no starting point' })
    }

    const destPt = { lat: destLat, lng: destLng }

    // Fetch OSRM route for EVERY active member (start → destination)
    const allGeometries = []
    for (const m of activeMembers) {
      const from = { lat: m.join_lat, lng: m.join_lng }
      const coords = await fetchOsrmRoute(from, destPt)
      allGeometries.push({ memberId: m.id, coords })
      // Store route_geometry on member record for simulation to use later
      try {
        await pbRequest('PATCH', `/api/collections/convoy_members/records/${m.id}`, {
          route_geometry: coords || [],
        })
      } catch {}
    }

    // Find owner's geometry index
    const ownerIdx = activeMembers.findIndex((m) => m.id === owner.id)
    const ownerCoords = allGeometries[ownerIdx]?.coords

    if (!ownerCoords || ownerCoords.length < 2) {
      // Fallback: use destination as meeting point
      await pbRequest('PATCH', `/api/collections/convoys/records/${convoyId}`, {
        source_lat: destLat,
        source_lng: destLng,
        source_name: 'Destination',
        phase: 'assembling',
        assembled_members: [],
      })
      return res.json({ success: true, meetingPoint: { lat: destLat, lng: destLng } })
    }

    // Build spatial hash sets for all non-owner members (4dp precision, ~11m)
    const memberSets = []
    for (let i = 0; i < allGeometries.length; i++) {
      if (i === ownerIdx || !allGeometries[i].coords) continue
      const set = new Set()
      for (const c of allGeometries[i].coords) {
        set.add(coord4dp(c))
      }
      memberSets.push(set)
    }

    // Walk owner's route FORWARD from start, find first coord present in ALL member sets
    let meetingPoint = null
    for (const c of ownerCoords) {
      const h = coord4dp(c)
      if (memberSets.every((s) => s.has(h))) {
        meetingPoint = { lat: c[1], lng: c[0] }
        break
      }
    }

    // Fallback: use destination
    if (!meetingPoint) {
      meetingPoint = { lat: destLat, lng: destLng }
    }

    await pbRequest('PATCH', `/api/collections/convoys/records/${convoyId}`, {
      source_lat: meetingPoint.lat,
      source_lng: meetingPoint.lng,
      source_name:
        meetingPoint.lat === destLat && meetingPoint.lng === destLng
          ? 'Destination'
          : 'Merging point',
      phase: 'assembling',
      assembled_members: [],
    })

    res.json({ success: true, meetingPoint })
  } catch (err) {
    console.error('[assembly/calculate] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/simulation/logs/:convoyId', (req, res) => {
  const { convoyId } = req.params
  const sim = runningSimulations.get(convoyId)
  if (!sim) {
    return res.json({ logs: [] })
  }
  res.json({ logs: sim.logs.slice(-100) })
})

async function setSimulationFlag(convoyId, active) {
  const convoy = await pbRequest('GET', `/api/collections/convoys/records/${convoyId}`)
  let settings = {}
  if (typeof convoy.settings === 'string') {
    try {
      settings = JSON.parse(convoy.settings)
    } catch {
      settings = {}
    }
  } else if (convoy.settings && typeof convoy.settings === 'object') {
    settings = { ...convoy.settings }
  }
  settings.simulation_active = active
  await pbRequest('PATCH', `/api/collections/convoys/records/${convoyId}`, {
    settings,
  })
}

async function clearPositions(convoyId) {
  let totalDeleted = 0
  let page = 1
  const perPage = 100

  console.log(`[clearPositions] Starting clear for convoy: ${convoyId}`)

  // Try primary filter first
  let filter = `convoy="${convoyId}"`
  let data = await pbRequest(
    'GET',
    `/api/collections/positions/records?page=1&perPage=1&filter=${encodeURIComponent(filter)}`,
  )
  console.log(
    `[clearPositions] Filter "${filter}": found ${data.totalItems ?? data.items?.length ?? 0} records`,
  )

  // Fallback: try relation.id syntax if primary returns 0
  if (!data.items || data.items.length === 0) {
    filter = `convoy.id="${convoyId}"`
    data = await pbRequest(
      'GET',
      `/api/collections/positions/records?page=1&perPage=1&filter=${encodeURIComponent(filter)}`,
    )
    console.log(
      `[clearPositions] Filter "${filter}": found ${data.totalItems ?? data.items?.length ?? 0} records`,
    )
  }

  // Fallback: list ALL positions and filter client-side if PB filter doesn't work
  let useClientFilter = false
  if (!data.items || data.items.length === 0) {
    console.log(`[clearPositions] PB filters returned 0. Falling back to list-all + client filter.`)
    useClientFilter = true
  }

  page = 1
  while (true) {
    let items
    if (useClientFilter) {
      const allData = await pbRequest(
        'GET',
        `/api/collections/positions/records?page=${page}&perPage=${perPage}&sort=-created`,
      )
      items = (allData.items || []).filter((item) => item.convoy === convoyId)
      console.log(
        `[clearPositions] Client filter page ${page}: ${items.length} matching out of ${allData.items?.length ?? 0}`,
      )
    } else {
      const pageData = await pbRequest(
        'GET',
        `/api/collections/positions/records?page=${page}&perPage=${perPage}&filter=${encodeURIComponent(filter)}`,
      )
      items = pageData.items || []
      console.log(`[clearPositions] PB filter page ${page}: ${items.length} records`)
    }

    if (!items || items.length === 0) break

    const ids = items.map((item) => item.id)

    if (ids.length > 1) {
      const batchRequests = ids.map((id) => ({
        method: 'DELETE',
        path: `/api/collections/positions/records/${id}`,
      }))
      try {
        await pbRequest('POST', '/api/batch', { requests: batchRequests })
        totalDeleted += ids.length
        console.log(`[clearPositions] Batch deleted ${ids.length} records`)
      } catch (err) {
        console.error('Batch delete failed, falling back to individual:', err.message)
        for (const id of ids) {
          try {
            await pbRequest('DELETE', `/api/collections/positions/records/${id}`)
            totalDeleted++
          } catch {
            // skip individual failures
          }
        }
      }
    } else {
      for (const id of ids) {
        try {
          await pbRequest('DELETE', `/api/collections/positions/records/${id}`)
          totalDeleted++
        } catch {
          // skip
        }
      }
    }

    if (useClientFilter && ids.length === perPage) {
      page++
      continue
    }
    if (!useClientFilter && ids.length < perPage) break
    if (useClientFilter) break
    page++
  }

  console.log(`[clearPositions] Total deleted: ${totalDeleted}`)
  return { deleted: totalDeleted, convoyId }
}

async function cleanupKeepLatest(convoyId) {
  console.log(`[cleanupKeepLatest] Starting cleanup for convoy: ${convoyId}`)

  // Fetch all positions sorted by -created (newest first)
  const allData = await pbRequest(
    'GET',
    `/api/collections/positions/records?page=1&perPage=500&filter=${encodeURIComponent(`convoy="${convoyId}"`)}&sort=-created`,
  )
  const allPositions = allData.items || []

  if (allPositions.length === 0) {
    console.log(`[cleanupKeepLatest] No positions found`)
    return { deleted: 0, kept: 0, convoyId }
  }

  // Group by vehicle, keep only the first (latest) per vehicle
  const seen = new Map()
  const idsToDelete = []

  for (const pos of allPositions) {
    if (!seen.has(pos.vehicle)) {
      seen.set(pos.vehicle, pos.id)
    } else {
      idsToDelete.push(pos.id)
    }
  }

  console.log(
    `[cleanupKeepLatest] Found ${allPositions.length} positions for ${seen.size} vehicles, deleting ${idsToDelete.length} old positions`,
  )

  if (idsToDelete.length === 0) {
    return { deleted: 0, kept: seen.size, convoyId }
  }

  // Batch delete old positions
  const BATCH_SIZE = 50
  let totalDeleted = 0
  for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
    const batch = idsToDelete.slice(i, i + BATCH_SIZE)
    const batchRequests = batch.map((id) => ({
      method: 'DELETE',
      path: `/api/collections/positions/records/${id}`,
    }))
    try {
      await pbRequest('POST', '/api/batch', { requests: batchRequests })
      totalDeleted += batch.length
    } catch (err) {
      console.error(`[cleanupKeepLatest] Batch delete failed at offset ${i}:`, err.message)
      for (const id of batch) {
        try {
          await pbRequest('DELETE', `/api/collections/positions/records/${id}`)
          totalDeleted++
        } catch {
          // skip individual failures
        }
      }
    }
  }

  console.log(`[cleanupKeepLatest] Deleted ${totalDeleted}, kept ${seen.size}`)
  return { deleted: totalDeleted, kept: seen.size, convoyId }
}

process.on('SIGTERM', () => {
  for (const [, sim] of runningSimulations) {
    sim.process.kill('SIGTERM')
  }
  process.exit(0)
})

process.on('SIGINT', () => {
  for (const [, sim] of runningSimulations) {
    sim.process.kill('SIGTERM')
  }
  process.exit(0)
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Convoy Simulation Service running on port ${PORT}`)
  console.log(`PocketBase URL: ${POCKETBASE_URL}`)
  console.log(`OSRM URL: ${OSRM_URL}`)
  console.log(`Script path: ${SCRIPT_PATH}`)
})
