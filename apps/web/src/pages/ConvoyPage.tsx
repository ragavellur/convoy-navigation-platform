import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import pb from '../services/pocketbase'
import { generateDeepLink } from '../services/deepLink'
import { useNavigate } from 'react-router-dom'
import SearchBar from '../components/SearchBar'
import ConvoyTypeBadge from '../components/ConvoyTypeBadge'
import StatusBadge from '../components/StatusBadge'
import type { SearchResult } from '../types'

interface ConvoyRecord {
  id: string
  name: string
  code: string
  description?: string
  owner: string
  status: 'active' | 'paused' | 'ended'
  convoy_type: 'vehicle' | 'trekker'
  max_members?: number
  trip_id: string
  security_token: string
  source_lat?: number
  source_lng?: number
  source_name?: string
  dest_lat?: number
  dest_lng?: number
  dest_name?: string
  settings?: Record<string, unknown>
  created: string
  updated: string
}

function generateTripId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let tripId = ''
  for (let i = 0; i < 12; i++) {
    tripId += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return tripId
}

function generateSecurityToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

function generateConvoyCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

interface VehicleOption {
  id: string
  name: string
  type: string
  license_plate: string
  color?: string
}

function ConvoyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [convoys, setConvoys] = useState<ConvoyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [newConvoyName, setNewConvoyName] = useState('')
  const [newConvoyDesc, setNewConvoyDesc] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [sourceLat, setSourceLat] = useState<number | null>(null)
  const [sourceLng, setSourceLng] = useState<number | null>(null)
  const [destName, setDestName] = useState('')
  const [destLat, setDestLat] = useState<number | null>(null)
  const [destLng, setDestLng] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [enableSimulation, setEnableSimulation] = useState(false)
  const [autoCalcSource, setAutoCalcSource] = useState(false)
  const [newConvoyType, setNewConvoyType] = useState<'vehicle' | 'trekker'>('vehicle')
  const [joinConvoyLookup, setJoinConvoyLookup] = useState<ConvoyRecord | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [joinSourceLat, setJoinSourceLat] = useState<number | null>(null)
  const [joinSourceLng, setJoinSourceLng] = useState<number | null>(null)
  const [joinSourceName, setJoinSourceName] = useState('')
  const [showJoinSearch, setShowJoinSearch] = useState(false)
  const [gettingJoinLocation, setGettingJoinLocation] = useState(false)

  useEffect(() => {
    const fetchConvoys = async () => {
      if (!user) return
      setLoading(true)
      setError('')
      try {
        const memberships = await pb.collection('convoy_members').getFullList({
          filter: `user = "${user.id}" && status = "active"`,
        })
        const convoyIds = memberships.map((m) => m.convoy)
        if (convoyIds.length === 0) {
          setConvoys([])
          return
        }
        const filter = convoyIds.map((id) => `id = "${id}"`).join(' || ')
        const records = await pb.collection('convoys').getFullList<ConvoyRecord>({
          filter,
          sort: '-created',
        })
        setConvoys(records)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load convoys')
      } finally {
        setLoading(false)
      }
    }
    fetchConvoys()
  }, [user])

  useEffect(() => {
    const fetchVehicles = async () => {
      if (!user) return
      try {
        const records = await pb.collection('vehicles').getFullList({
          filter: `owner = "${user.id}" && status = "active"`,
        })
        const activeMembers = await pb.collection('convoy_members').getFullList({
          filter: `user = "${user.id}" && status = "active"`,
        })
        const occupiedVehicleIds = new Set(activeMembers.map((m) => m.vehicle).filter(Boolean))
        const opts: VehicleOption[] = records
          .filter((r) => !occupiedVehicleIds.has(r.id))
          .map((r) => ({
            id: r.id,
            name: r.name,
            type: r.type,
            license_plate: r.license_plate,
            color: r.color,
          }))
        setVehicles(opts)
        if (opts.length === 1) setSelectedVehicleId(opts[0].id)
      } catch {
        // Vehicles may not exist yet
      }
    }
    fetchVehicles()
  }, [user])

  const handleCreate = async () => {
    if (!newConvoyName.trim()) return
    setCreating(true)
    setError('')
    try {
      const code = generateConvoyCode()
      const tripId = generateTripId()
      const securityToken = generateSecurityToken()
      const data: Record<string, unknown> = {
        name: newConvoyName.trim(),
        code,
        description: newConvoyDesc.trim() || undefined,
        owner: user?.id,
        status: 'active',
        convoy_type: newConvoyType,
        trip_id: tripId,
        security_token: securityToken,
      }
      if (!autoCalcSource && sourceName && sourceLat !== null && sourceLng !== null) {
        data.source_name = sourceName
        data.source_lat = sourceLat
        data.source_lng = sourceLng
      }
      if (destName && destLat !== null && destLng !== null) {
        data.dest_name = destName
        data.dest_lat = destLat
        data.dest_lng = destLng
      }
      if (enableSimulation) {
        data.settings = JSON.stringify({ simulation_active: false })
      }
      const newConvoy = await pb.collection('convoys').create<ConvoyRecord>(data)

      let creatorVehicleId: string | undefined
      if (newConvoyType === 'trekker') {
        const trekkerName = user?.name || user?.email?.split('@')[0] || 'Trekker'
        const trekker = await pb.collection('vehicles').create({
          owner: user?.id,
          name: trekkerName,
          type: 'trekker',
          status: 'active',
        })
        creatorVehicleId = trekker.id
      }

      await pb.collection('convoy_members').create({
        convoy: newConvoy.id,
        user: user?.id,
        vehicle: creatorVehicleId || undefined,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString(),
      })
      setNewConvoyName('')
      setNewConvoyDesc('')
      setSourceName('')
      setSourceLat(null)
      setSourceLng(null)
      setDestName('')
      setDestLat(null)
      setDestLng(null)
      setEnableSimulation(false)
      setAutoCalcSource(false)
      setNewConvoyType('vehicle')
      setShowCreateForm(false)
      const memberships = await pb.collection('convoy_members').getFullList({
        filter: `user = "${user?.id}" && status = "active"`,
      })
      const convoyIds = memberships.map((m) => m.convoy)
      if (convoyIds.length > 0) {
        const filter = convoyIds.map((id) => `id = "${id}"`).join(' || ')
        const records = await pb.collection('convoys').getFullList<ConvoyRecord>({
          filter,
          sort: '-created',
        })
        setConvoys(records)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create convoy')
    } finally {
      setCreating(false)
    }
  }

  const handleLookupConvoy = async () => {
    if (!joinCode.trim()) return
    setLookingUp(true)
    setError('')
    setSuccess('')
    setSelectedVehicleId('')
    try {
      const code = joinCode.trim().toUpperCase()
      const results = await pb.collection('convoys').getFullList<ConvoyRecord>({
        filter: `code = "${code}" && status = "active"`,
      })
      if (results.length === 0) {
        throw new Error('Convoy not found or inactive')
      }
      setJoinConvoyLookup(results[0])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to look up convoy')
      setJoinConvoyLookup(null)
    } finally {
      setLookingUp(false)
    }
  }

  const handleJoin = async () => {
    if (!joinConvoyLookup) return
    setJoining(true)
    setError('')
    setSuccess('')
    try {
      const convoy = joinConvoyLookup
      const convoyType = convoy.convoy_type || 'vehicle'

      if (convoyType === 'vehicle') {
        if (!selectedVehicleId) {
          setError('Please select a vehicle to join this convoy.')
          setJoining(false)
          return
        }
        const vehicleInConvoy = await pb.collection('convoy_members').getFullList({
          filter: `vehicle = "${selectedVehicleId}" && status = "active"`,
        })
        if (vehicleInConvoy.length > 0) {
          throw new Error(
            'This vehicle is already in another active convoy. Leave that convoy first or use a different vehicle.',
          )
        }
      }

      const existingActive = await pb.collection('convoy_members').getFullList({
        filter: `user = "${user?.id}" && status = "active"`,
      })
      for (const m of existingActive) {
        if (m.convoy !== convoy.id) {
          await pb.collection('convoy_members').update(m.id, { status: 'inactive' })
        }
      }

      let vehicleId = selectedVehicleId
      if (convoyType === 'trekker') {
        const existingTrekkers = await pb.collection('vehicles').getFullList({
          filter: `owner = "${user?.id}" && type = "trekker" && status = "active"`,
        })
        if (existingTrekkers.length > 0) {
          vehicleId = existingTrekkers[0].id
        } else {
          const trekkerName = user?.name || user?.email?.split('@')[0] || 'Trekker'
          const trekker = await pb.collection('vehicles').create({
            owner: user?.id,
            name: trekkerName,
            type: 'trekker',
            status: 'active',
          })
          vehicleId = trekker.id
        }
      }

      await pb.collection('convoy_members').create({
        convoy: convoy.id,
        user: user?.id,
        vehicle: vehicleId || undefined,
        role: 'member',
        status: 'active',
        joined_at: new Date().toISOString(),
        join_lat: joinSourceLat,
        join_lng: joinSourceLng,
        join_name: joinSourceName || undefined,
      })
      setJoinCode('')
      setJoinConvoyLookup(null)
      setJoinSourceLat(null)
      setJoinSourceLng(null)
      setJoinSourceName('')
      setShowJoinSearch(false)
      setSuccess(`Joined "${convoy.name}" successfully!`)
      const memberships = await pb.collection('convoy_members').getFullList({
        filter: `user = "${user?.id}" && status = "active"`,
      })
      const convoyIds = memberships.map((m) => m.convoy)
      if (convoyIds.length > 0) {
        const filter = convoyIds.map((id) => `id = "${id}"`).join(' || ')
        const records = await pb.collection('convoys').getFullList<ConvoyRecord>({
          filter,
          sort: '-created',
        })
        setConvoys(records)
      }
      setTimeout(() => {
        navigate(`/map?convoy=${convoy.id}`)
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join convoy')
    } finally {
      setJoining(false)
    }
  }

  const handleOpenConvoy = (convoyId: string) => {
    navigate(`/convoy/${convoyId}`)
  }

  const handleCopyDeepLink = async (code: string, tripId: string) => {
    const link = generateDeepLink(code, tripId)
    await navigator.clipboard.writeText(link)
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">My Convoys</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
        >
          {showCreateForm ? 'Cancel' : 'Create Convoy'}
        </button>
      </div>

      {error && <div className="error-banner mb-4 p-3 rounded-xl text-sm">{error}</div>}

      {success && <div className="success-banner mb-4 p-3 rounded-xl text-sm">{success}</div>}

      {showCreateForm && (
        <div className="card mb-6 p-4">
          <h2 className="text-lg font-medium text-[var(--text)] mb-3">New Convoy</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNewConvoyType('vehicle')}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium text-center transition-colors ${
                  newConvoyType === 'vehicle'
                    ? 'border-[var(--primary-border-strong)] text-[var(--badge-vehicle-text)]'
                    : 'border-[var(--border)] text-[var(--text2)]'
                }`}
                style={{
                  background:
                    newConvoyType === 'vehicle' ? 'var(--badge-vehicle-bg)' : 'var(--surface)',
                }}
              >
                <span className="text-lg">🚗</span>
                <span className="block mt-1">Vehicle</span>
              </button>
              <button
                type="button"
                onClick={() => setNewConvoyType('trekker')}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium text-center transition-colors ${
                  newConvoyType === 'trekker'
                    ? 'border-[var(--success-border-light)] text-[var(--badge-trekker-text)]'
                    : 'border-[var(--border)] text-[var(--text2)]'
                }`}
                style={{
                  background:
                    newConvoyType === 'trekker' ? 'var(--badge-trekker-bg)' : 'var(--surface)',
                }}
              >
                <span className="text-lg">🥾</span>
                <span className="block mt-1">Trekker</span>
              </button>
            </div>
            <input
              type="text"
              placeholder="Convoy name"
              value={newConvoyName}
              onChange={(e) => setNewConvoyName(e.target.value)}
              className="input-field w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newConvoyDesc}
              onChange={(e) => setNewConvoyDesc(e.target.value)}
              className="input-field w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--surface-hover)] border border-[var(--border)]">
              <input
                type="checkbox"
                id="auto-calc-source"
                checked={autoCalcSource}
                onChange={(e) => {
                  setAutoCalcSource(e.target.checked)
                  if (e.target.checked) {
                    setSourceName('')
                    setSourceLat(null)
                    setSourceLng(null)
                  }
                }}
                className="h-4 w-4 text-indigo-500 focus:ring-indigo-500/50 rounded"
                style={{ accentColor: '#6366f1' }}
              />
              <label htmlFor="auto-calc-source" className="text-sm text-[var(--text)]">
                Auto-calculate meeting point
                <span className="block text-xs text-[var(--text2)] mt-0.5">
                  Assembly point will be computed from member locations instead of a fixed start
                </span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!autoCalcSource && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text2)] mb-1">
                    Starting Point
                  </label>
                  <SearchBar
                    onResultSelect={(result: SearchResult) => {
                      setSourceName(result.displayName)
                      setSourceLat(result.lat)
                      setSourceLng(result.lng)
                    }}
                  />
                  {sourceName && <p className="text-xs text-[var(--text2)] mt-1">{sourceName}</p>}
                </div>
              )}
              <div className={autoCalcSource ? 'col-span-2' : ''}>
                <label className="block text-xs font-medium text-[var(--text2)] mb-1">
                  Destination
                </label>
                <SearchBar
                  onResultSelect={(result: SearchResult) => {
                    setDestName(result.displayName)
                    setDestLat(result.lat)
                    setDestLng(result.lng)
                  }}
                />
                {destName && <p className="text-xs text-[var(--text2)] mt-1">{destName}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--surface-hover)] border border-[var(--border)]">
              <input
                type="checkbox"
                id="enable-simulation"
                checked={enableSimulation}
                onChange={(e) => setEnableSimulation(e.target.checked)}
                className="h-4 w-4 text-amber-500 focus:ring-amber-500/50 rounded"
                style={{ accentColor: '#f59e0b' }}
              />
              <label htmlFor="enable-simulation" className="text-sm text-[var(--text)]">
                Enable simulation mode
                <span className="block text-xs text-[var(--text2)] mt-0.5">
                  Vehicle positions will be simulated along the route instead of using real GPS
                </span>
              </label>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newConvoyName.trim()}
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-[var(--text2)]">Loading convoys...</p>
            </div>
          ) : convoys.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--text2)]">
                No convoys yet. Create or join one to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {convoys.map((convoy) => (
                <div
                  key={convoy.id}
                  className="card p-4 hover:bg-[var(--surface)] transition-colors"
                >
                  <div onClick={() => handleOpenConvoy(convoy.id)} className="cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-medium text-[var(--text)]">{convoy.name}</h3>
                          <ConvoyTypeBadge convoyType={convoy.convoy_type} />
                        </div>
                        <p className="text-sm text-[var(--text2)]">Code: {convoy.code}</p>
                        {convoy.description && (
                          <p className="text-sm text-[var(--text)] opacity-80 mt-1">
                            {convoy.description}
                          </p>
                        )}
                        {(convoy.source_name || convoy.dest_name) && (
                          <p className="text-xs text-[var(--text2)] opacity-70 mt-1">
                            {convoy.source_name || '?'} → {convoy.dest_name || '?'}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={convoy.status} />
                    </div>
                  </div>
                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={() => handleCopyDeepLink(convoy.code, convoy.trip_id)}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text)] opacity-80 hover:text-[var(--text)] transition-colors border border-[var(--border)]"
                    >
                      Copy Invite Link
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card mt-6">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-[var(--text)] mb-4">Join a Convoy</h2>
          <div className="space-y-3">
            <div className="flex space-x-3">
              <input
                type="text"
                placeholder="Enter convoy code"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase())
                  if (joinConvoyLookup) setJoinConvoyLookup(null)
                }}
                className="input-field flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              />
              <button
                onClick={handleLookupConvoy}
                disabled={lookingUp || !joinCode.trim() || !!joinConvoyLookup}
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {lookingUp ? 'Looking up...' : 'Look Up'}
              </button>
            </div>

            {joinConvoyLookup && (
              <div className="card p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text)]">
                    {joinConvoyLookup.name}
                  </span>
                  <ConvoyTypeBadge convoyType={joinConvoyLookup.convoy_type} />
                </div>
                {(joinConvoyLookup.source_name || joinConvoyLookup.dest_name) && (
                  <p className="text-xs text-[var(--text2)] opacity-70">
                    {joinConvoyLookup.source_name || '?'} → {joinConvoyLookup.dest_name || '?'}
                  </p>
                )}

                <div>
                  <label className="block text-xs font-medium text-[var(--text2)] mb-1">
                    Your Starting Point
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setGettingJoinLocation(true)
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            setJoinSourceLat(pos.coords.latitude)
                            setJoinSourceLng(pos.coords.longitude)
                            setJoinSourceName('Current location')
                            setShowJoinSearch(false)
                            setGettingJoinLocation(false)
                          },
                          () => {
                            setGettingJoinLocation(false)
                          },
                          { enableHighAccuracy: true, timeout: 10000 },
                        )
                      }}
                      disabled={gettingJoinLocation}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        !showJoinSearch && joinSourceLat
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                          : 'border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {gettingJoinLocation ? 'Getting location...' : '📍 Use my location'}
                    </button>
                    <button
                      onClick={() => {
                        setShowJoinSearch(!showJoinSearch)
                        if (!showJoinSearch) {
                          setJoinSourceLat(null)
                          setJoinSourceLng(null)
                          setJoinSourceName('')
                        }
                      }}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        showJoinSearch
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                          : 'border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      🔍 Search location
                    </button>
                  </div>
                  {showJoinSearch && (
                    <div className="mt-2">
                      <SearchBar
                        onResultSelect={(result: SearchResult) => {
                          setJoinSourceLat(result.lat)
                          setJoinSourceLng(result.lng)
                          setJoinSourceName(result.displayName)
                          setShowJoinSearch(false)
                        }}
                      />
                    </div>
                  )}
                  {joinSourceName && !showJoinSearch && (
                    <p className="text-xs text-[var(--text2)] mt-1">{joinSourceName}</p>
                  )}
                </div>

                {(joinConvoyLookup.convoy_type || 'vehicle') === 'vehicle' && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text2)] mb-1">
                      Select your vehicle
                    </label>
                    {vehicles.length > 0 ? (
                      <select
                        value={selectedVehicleId}
                        onChange={(e) => setSelectedVehicleId(e.target.value)}
                        className="input-field w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                      >
                        <option value="">-- Choose vehicle --</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.type}) {v.color ? `· ${v.color}` : ''} [{v.license_plate}]
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-[var(--text2)] opacity-70">
                        You have no vehicles registered.{' '}
                        <button
                          onClick={() => navigate('/profile')}
                          className="text-indigo-400 hover:text-indigo-300 underline"
                        >
                          Add a vehicle
                        </button>
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={handleJoin}
                  disabled={
                    joining ||
                    ((joinConvoyLookup.convoy_type || 'vehicle') === 'vehicle' &&
                      !selectedVehicleId)
                  }
                  className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {joining
                    ? 'Joining...'
                    : (joinConvoyLookup.convoy_type || 'vehicle') === 'trekker'
                      ? 'Join as Trekker'
                      : 'Join with Vehicle'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConvoyPage
