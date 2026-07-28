import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import pb from '../services/pocketbase'
import { generateDeepLink } from '../services/deepLink'
import { useNavigate } from 'react-router-dom'
import SearchBar from '../components/SearchBar'
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
  const [newConvoyType, setNewConvoyType] = useState<'vehicle' | 'trekker'>('vehicle')
  const [joinConvoyLookup, setJoinConvoyLookup] = useState<ConvoyRecord | null>(null)
  const [lookingUp, setLookingUp] = useState(false)

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
      if (sourceName && sourceLat !== null && sourceLng !== null) {
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
      })
      setJoinCode('')
      setJoinConvoyLookup(null)
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
        <h1 className="text-2xl font-bold text-white">My Convoys</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
        >
          {showCreateForm ? 'Cancel' : 'Create Convoy'}
        </button>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-xl text-sm text-red-400"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="mb-4 p-3 rounded-xl text-sm text-emerald-400"
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
          }}
        >
          {success}
        </div>
      )}

      {showCreateForm && (
        <div
          className="mb-6 rounded-xl p-4"
          style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-lg font-medium text-white mb-3">New Convoy</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNewConvoyType('vehicle')}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-center transition-colors"
                style={{
                  background:
                    newConvoyType === 'vehicle'
                      ? 'rgba(99, 102, 241, 0.15)'
                      : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${newConvoyType === 'vehicle' ? 'rgba(99, 102, 241, 0.4)' : 'var(--border)'}`,
                  color: newConvoyType === 'vehicle' ? '#a5b4fc' : 'var(--text2)',
                }}
              >
                <span className="text-lg">🚗</span>
                <span className="block mt-1">Vehicle</span>
              </button>
              <button
                type="button"
                onClick={() => setNewConvoyType('trekker')}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-center transition-colors"
                style={{
                  background:
                    newConvoyType === 'trekker'
                      ? 'rgba(16, 185, 129, 0.15)'
                      : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${newConvoyType === 'trekker' ? 'rgba(16, 185, 129, 0.4)' : 'var(--border)'}`,
                  color: newConvoyType === 'trekker' ? '#6ee7b7' : 'var(--text2)',
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
              className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)' }}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newConvoyDesc}
              onChange={(e) => setNewConvoyDesc(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)' }}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Starting Point
                </label>
                <SearchBar
                  onResultSelect={(result: SearchResult) => {
                    setSourceName(result.displayName)
                    setSourceLat(result.lat)
                    setSourceLng(result.lng)
                  }}
                />
                {sourceName && <p className="text-xs text-slate-400 mt-1">{sourceName}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Destination</label>
                <SearchBar
                  onResultSelect={(result: SearchResult) => {
                    setDestName(result.displayName)
                    setDestLat(result.lat)
                    setDestLng(result.lng)
                  }}
                />
                {destName && <p className="text-xs text-slate-400 mt-1">{destName}</p>}
              </div>
            </div>
            <div
              className="flex items-center gap-2 p-3 rounded-xl"
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
              }}
            >
              <input
                type="checkbox"
                id="enable-simulation"
                checked={enableSimulation}
                onChange={(e) => setEnableSimulation(e.target.checked)}
                className="h-4 w-4 text-amber-500 focus:ring-amber-500/50 rounded border-white/20"
              />
              <label htmlFor="enable-simulation" className="text-sm text-amber-400">
                Enable simulation mode
                <span className="block text-xs text-amber-400/70 mt-0.5">
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

      <div
        className="rounded-xl"
        style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)' }}
      >
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-slate-400">Loading convoys...</p>
            </div>
          ) : convoys.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400">No convoys yet. Create or join one to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {convoys.map((convoy) => (
                <div
                  key={convoy.id}
                  className="rounded-xl p-4 hover:bg-white/5 transition-colors"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <div onClick={() => handleOpenConvoy(convoy.id)} className="cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-medium text-white">{convoy.name}</h3>
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              background:
                                (convoy.convoy_type || 'vehicle') === 'trekker'
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : 'rgba(99, 102, 241, 0.15)',
                              color:
                                (convoy.convoy_type || 'vehicle') === 'trekker'
                                  ? '#6ee7b7'
                                  : '#a5b4fc',
                            }}
                          >
                            {(convoy.convoy_type || 'vehicle') === 'trekker'
                              ? '🥾 Trekker'
                              : '🚗 Vehicle'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400">Code: {convoy.code}</p>
                        {convoy.description && (
                          <p className="text-sm text-slate-300 mt-1">{convoy.description}</p>
                        )}
                        {(convoy.source_name || convoy.dest_name) && (
                          <p className="text-xs text-slate-500 mt-1">
                            {convoy.source_name || '?'} → {convoy.dest_name || '?'}
                          </p>
                        )}
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400">
                        {convoy.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={() => handleCopyDeepLink(convoy.code, convoy.trip_id)}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white transition-colors"
                      style={{ border: '1px solid var(--border)' }}
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

      <div
        className="mt-6 rounded-xl"
        style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)' }}
      >
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-white mb-4">Join a Convoy</h2>
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
                className="flex-1 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                }}
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
              <div
                className="rounded-xl p-3 space-y-3"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{joinConvoyLookup.name}</span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background:
                        (joinConvoyLookup.convoy_type || 'vehicle') === 'trekker'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(99, 102, 241, 0.15)',
                      color:
                        (joinConvoyLookup.convoy_type || 'vehicle') === 'trekker'
                          ? '#6ee7b7'
                          : '#a5b4fc',
                    }}
                  >
                    {(joinConvoyLookup.convoy_type || 'vehicle') === 'trekker'
                      ? '🥾 Trekker'
                      : '🚗 Vehicle'}
                  </span>
                </div>
                {(joinConvoyLookup.source_name || joinConvoyLookup.dest_name) && (
                  <p className="text-xs text-slate-500">
                    {joinConvoyLookup.source_name || '?'} → {joinConvoyLookup.dest_name || '?'}
                  </p>
                )}

                {(joinConvoyLookup.convoy_type || 'vehicle') === 'vehicle' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Select your vehicle
                    </label>
                    {vehicles.length > 0 ? (
                      <select
                        value={selectedVehicleId}
                        onChange={(e) => setSelectedVehicleId(e.target.value)}
                        className="w-full rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <option value="">-- Choose vehicle --</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.type}) {v.color ? `· ${v.color}` : ''} [{v.license_plate}]
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-slate-500">
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
