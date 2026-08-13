import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import supabase from '../services/supabaseClient'
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
  created_at: string
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
  const [creatorVehicleId, setCreatorVehicleId] = useState('')
  const [creatorSourceLat, setCreatorSourceLat] = useState<number | null>(null)
  const [creatorSourceLng, setCreatorSourceLng] = useState<number | null>(null)
  const [creatorSourceName, setCreatorSourceName] = useState('')
  const [creatorSourceVia, setCreatorSourceVia] = useState<'geo' | 'search' | null>(null)
  const [showCreatorSearch, setShowCreatorSearch] = useState(false)
  const [gettingCreatorLocation, setGettingCreatorLocation] = useState(false)
  const [joinConvoyLookup, setJoinConvoyLookup] = useState<ConvoyRecord | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [joinSourceLat, setJoinSourceLat] = useState<number | null>(null)
  const [joinSourceLng, setJoinSourceLng] = useState<number | null>(null)
  const [joinSourceName, setJoinSourceName] = useState('')
  const [joinSourceVia, setJoinSourceVia] = useState<'geo' | 'search' | null>(null)
  const [showJoinSearch, setShowJoinSearch] = useState(false)
  const [gettingJoinLocation, setGettingJoinLocation] = useState(false)

  const fetchUserConvoys = useCallback(async (): Promise<ConvoyRecord[]> => {
    if (!user) return []
    const { data: memberships } = await supabase
      .from('convoy_members')
      .select('convoy')
      .eq('user', user.id)
      .eq('status', 'active')
    const convoyIds = (memberships || []).map((m) => m.convoy)
    if (convoyIds.length === 0) return []
    const { data } = await supabase
      .from('convoys')
      .select('*')
      .in('id', convoyIds)
      .order('created_at', { ascending: false })
    return (data || []) as ConvoyRecord[]
  }, [user])

  useEffect(() => {
    const loadConvoys = async () => {
      if (!user) return
      setLoading(true)
      setError('')
      try {
        setConvoys(await fetchUserConvoys())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load convoys')
      } finally {
        setLoading(false)
      }
    }
    loadConvoys()
  }, [user, fetchUserConvoys])

  useEffect(() => {
    const fetchVehicles = async () => {
      if (!user) return
      try {
        const { data: records } = await supabase
          .from('vehicles')
          .select('id, name, type, license_plate, color')
          .eq('owner', user.id)
          .eq('status', 'active')
        const { data: activeMembers } = await supabase
          .from('convoy_members')
          .select('vehicle')
          .eq('user', user.id)
          .eq('status', 'active')
        const occupiedVehicleIds = new Set(
          (activeMembers || []).map((m) => m.vehicle).filter(Boolean) as string[],
        )
        const opts: VehicleOption[] = (records || [])
          .filter((r) => !occupiedVehicleIds.has(r.id))
          .map((r) => ({
            id: r.id,
            name: r.name,
            type: r.type,
            license_plate: r.license_plate ?? '',
            color: r.color ?? undefined,
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
    if (!destName || destLat === null || destLng === null) {
      setError('Please select a destination for the convoy')
      return
    }
    setCreating(true)
    setError('')
    try {
      const code = generateConvoyCode()
      const tripId = generateTripId()
      const securityToken = generateSecurityToken()
      const baseData = {
        name: newConvoyName.trim(),
        code,
        description: newConvoyDesc.trim() || null,
        owner: user?.id ?? '',
        status: 'active' as const,
        convoy_type: newConvoyType,
        phase: 'forming',
        trip_id: tripId,
        security_token: securityToken,
      }
      const insertData =
        destName && destLat !== null && destLng !== null
          ? { ...baseData, dest_name: destName, dest_lat: destLat, dest_lng: destLng }
          : baseData
      const settingsData = enableSimulation ? { settings: { simulation_active: false } } : {}
      const { data: newConvoy, error: convoyError } = await supabase
        .from('convoys')
        .insert({ ...insertData, ...settingsData })
        .select('*')
        .single()
      if (convoyError) throw convoyError

      let memberVehicleId: string | undefined
      if (newConvoyType === 'trekker') {
        const trekkerName = user?.name || user?.email?.split('@')[0] || 'Trekker'
        const { data: trekker, error: trekkerError } = await supabase
          .from('vehicles')
          .insert({
            owner: user?.id ?? '',
            name: trekkerName,
            type: 'trekker',
            status: 'active',
          })
          .select('id')
          .single()
        if (trekkerError) throw trekkerError
        memberVehicleId = trekker.id
      } else if (creatorVehicleId) {
        memberVehicleId = creatorVehicleId
      }

      const { error: memberError } = await supabase.from('convoy_members').insert({
        convoy: newConvoy.id,
        user: user?.id ?? '',
        vehicle: memberVehicleId || null,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString(),
        join_lat: creatorSourceLat,
        join_lng: creatorSourceLng,
        join_name: creatorSourceName || null,
      })
      if (memberError) throw memberError
      setNewConvoyName('')
      setNewConvoyDesc('')
      setDestName('')
      setDestLat(null)
      setDestLng(null)
      setEnableSimulation(false)
      setCreatorSourceLat(null)
      setCreatorSourceLng(null)
      setCreatorSourceName('')
      setCreatorSourceVia(null)
      setShowCreatorSearch(false)
      setNewConvoyType('vehicle')
      setShowCreateForm(false)
      setConvoys(await fetchUserConvoys())
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
      const { data: results } = await supabase
        .from('convoys')
        .select('*')
        .eq('code', code)
        .eq('status', 'active')
        .limit(1)
      if (!results || results.length === 0) {
        throw new Error('Convoy not found or inactive')
      }
      setJoinConvoyLookup(results[0] as ConvoyRecord)
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
        const { data: vehicleInConvoy } = await supabase
          .from('convoy_members')
          .select('id')
          .eq('vehicle', selectedVehicleId)
          .eq('status', 'active')
          .limit(1)
        if (vehicleInConvoy && vehicleInConvoy.length > 0) {
          throw new Error(
            'This vehicle is already in another active convoy. Leave that convoy first or use a different vehicle.',
          )
        }
      }

      const { data: existingActive } = await supabase
        .from('convoy_members')
        .select('id, convoy')
        .eq('user', user?.id ?? '')
        .eq('status', 'active')
      for (const m of existingActive || []) {
        if (m.convoy !== convoy.id) {
          await supabase.from('convoy_members').update({ status: 'inactive' }).eq('id', m.id)
        }
      }

      let vehicleId = selectedVehicleId
      if (convoyType === 'trekker') {
        const { data: existingTrekkers } = await supabase
          .from('vehicles')
          .select('id')
          .eq('owner', user?.id ?? '')
          .eq('type', 'trekker')
          .eq('status', 'active')
          .limit(1)
        if (existingTrekkers && existingTrekkers.length > 0) {
          vehicleId = existingTrekkers[0].id
        } else {
          const trekkerName = user?.name || user?.email?.split('@')[0] || 'Trekker'
          const { data: trekker, error: trekkerError } = await supabase
            .from('vehicles')
            .insert({
              owner: user?.id ?? '',
              name: trekkerName,
              type: 'trekker',
              status: 'active',
            })
            .select('id')
            .single()
          if (trekkerError) throw trekkerError
          vehicleId = trekker.id
        }
      }

      const { error: joinError } = await supabase.from('convoy_members').insert({
        convoy: convoy.id,
        user: user?.id ?? '',
        vehicle: vehicleId || null,
        role: 'member',
        status: 'active',
        joined_at: new Date().toISOString(),
        join_lat: joinSourceLat,
        join_lng: joinSourceLng,
        join_name: joinSourceName || null,
      })
      if (joinError) throw joinError
      setJoinCode('')
      setJoinConvoyLookup(null)
      setJoinSourceLat(null)
      setJoinSourceLng(null)
      setJoinSourceName('')
      setJoinSourceVia(null)
      setShowJoinSearch(false)
      setSuccess(`Joined "${convoy.name}" successfully!`)
      setConvoys(await fetchUserConvoys())
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
            {newConvoyType === 'vehicle' && (
              <div>
                <label className="block text-xs font-medium text-[var(--text2)] mb-1">
                  Your Vehicle
                </label>
                {vehicles.length > 0 ? (
                  <select
                    value={creatorVehicleId}
                    onChange={(e) => setCreatorVehicleId(e.target.value)}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  >
                    <option value="">-- Select your vehicle --</option>
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
            <div>
              <label className="block text-xs font-medium text-[var(--text2)] mb-1">
                Your Starting Point *
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setGettingCreatorLocation(true)
                    navigator.geolocation.getCurrentPosition(
                      async (pos) => {
                        const lat = pos.coords.latitude
                        const lng = pos.coords.longitude
                        setCreatorSourceLat(lat)
                        setCreatorSourceLng(lng)
                        setCreatorSourceVia('geo')
                        setShowCreatorSearch(false)
                        const { reverseGeocode } = await import('../services/geocode')
                        const name = await reverseGeocode(lat, lng)
                        setCreatorSourceName(name || 'Current location')
                        setGettingCreatorLocation(false)
                      },
                      () => {
                        setGettingCreatorLocation(false)
                      },
                      { enableHighAccuracy: true, timeout: 10000 },
                    )
                  }}
                  disabled={gettingCreatorLocation}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    creatorSourceVia === 'geo'
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {gettingCreatorLocation ? 'Getting location...' : '📍 Use my location'}
                </button>
                <button
                  onClick={() => {
                    setShowCreatorSearch(!showCreatorSearch)
                    if (!showCreatorSearch) {
                      setCreatorSourceLat(null)
                      setCreatorSourceLng(null)
                      setCreatorSourceName('')
                      setCreatorSourceVia(null)
                    }
                  }}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    showCreatorSearch || creatorSourceVia === 'search'
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  🔍 Search location
                </button>
              </div>
              {showCreatorSearch && (
                <div className="mt-2">
                  <SearchBar
                    onResultSelect={(result: SearchResult) => {
                      setCreatorSourceLat(result.lat)
                      setCreatorSourceLng(result.lng)
                      setCreatorSourceName(result.displayName)
                      setCreatorSourceVia('search')
                      setShowCreatorSearch(false)
                    }}
                  />
                </div>
              )}
              {creatorSourceName && !showCreatorSearch && (
                <p className="text-xs text-[var(--text2)] mt-1">{creatorSourceName}</p>
              )}
            </div>
            <div>
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
              disabled={
                creating ||
                !newConvoyName.trim() ||
                !creatorSourceLat ||
                !creatorSourceLng ||
                (newConvoyType === 'vehicle' && !creatorVehicleId)
              }
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
                          async (pos) => {
                            const lat = pos.coords.latitude
                            const lng = pos.coords.longitude
                            setJoinSourceLat(lat)
                            setJoinSourceLng(lng)
                            setJoinSourceVia('geo')
                            setShowJoinSearch(false)
                            const { reverseGeocode } = await import('../services/geocode')
                            const name = await reverseGeocode(lat, lng)
                            setJoinSourceName(name || 'Current location')
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
                        joinSourceVia === 'geo'
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
                        showJoinSearch || joinSourceVia === 'search'
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
                          setJoinSourceVia('search')
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
