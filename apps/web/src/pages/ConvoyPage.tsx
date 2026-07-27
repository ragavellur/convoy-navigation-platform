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
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState('')

  useEffect(() => {
    const fetchConvoys = async () => {
      if (!user) return
      setLoading(true)
      setError('')
      try {
        const records = await pb.collection('convoys').getFullList<ConvoyRecord>({
          filter: 'status = "active"',
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
        const opts: VehicleOption[] = records.map((r) => ({
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
      await pb.collection('convoys').create(data)
      setNewConvoyName('')
      setNewConvoyDesc('')
      setSourceName('')
      setSourceLat(null)
      setSourceLng(null)
      setDestName('')
      setDestLat(null)
      setDestLng(null)
      setShowCreateForm(false)
      const records = await pb.collection('convoys').getFullList<ConvoyRecord>({
        filter: 'status = "active"',
        sort: '-created',
      })
      setConvoys(records)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create convoy')
    } finally {
      setCreating(false)
    }
  }

  const handleJoin = async () => {
    if (!joinCode.trim()) return
    if (!selectedVehicleId) {
      setError('Please select a vehicle before joining')
      return
    }
    setJoining(true)
    setError('')
    try {
      const code = joinCode.trim().toUpperCase()
      const results = await pb.collection('convoys').getFullList({
        filter: `code = "${code}" && status = "active"`,
      })
      if (results.length === 0) {
        throw new Error('Convoy not found or inactive')
      }
      const convoy = results[0]
      const existingActive = await pb.collection('convoy_members').getFullList({
        filter: `user = "${user?.id}" && status = "active"`,
      })
      for (const m of existingActive) {
        if (m.convoy !== convoy.id) {
          await pb.collection('convoy_members').update(m.id, { status: 'inactive' })
        }
      }
      await pb.collection('convoy_members').create({
        convoy: convoy.id,
        user: user?.id,
        vehicle: selectedVehicleId,
        role: 'member',
        status: 'active',
        joined_at: new Date().toISOString(),
      })
      setJoinCode('')
      const records = await pb.collection('convoys').getFullList<ConvoyRecord>({
        filter: 'status = "active"',
        sort: '-created',
      })
      setConvoys(records)
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
        <h1 className="text-2xl font-bold text-gray-900">My Convoys</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          {showCreateForm ? 'Cancel' : 'Create Convoy'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mb-6 bg-white shadow rounded-lg p-4">
          <h2 className="text-lg font-medium text-gray-900 mb-3">New Convoy</h2>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Convoy name"
              value={newConvoyName}
              onChange={(e) => setNewConvoyName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newConvoyDesc}
              onChange={(e) => setNewConvoyDesc(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Starting Point
                </label>
                <SearchBar
                  onResultSelect={(result: SearchResult) => {
                    setSourceName(result.displayName)
                    setSourceLat(result.lat)
                    setSourceLng(result.lng)
                  }}
                />
                {sourceName && <p className="text-xs text-gray-500 mt-1">{sourceName}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Destination</label>
                <SearchBar
                  onResultSelect={(result: SearchResult) => {
                    setDestName(result.displayName)
                    setDestLat(result.lat)
                    setDestLng(result.lng)
                  }}
                />
                {destName && <p className="text-xs text-gray-500 mt-1">{destName}</p>}
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newConvoyName.trim()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading convoys...</p>
            </div>
          ) : convoys.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No convoys yet. Create or join one to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {convoys.map((convoy) => (
                <div
                  key={convoy.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                >
                  <div onClick={() => handleOpenConvoy(convoy.id)} className="cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{convoy.name}</h3>
                        <p className="text-sm text-gray-500">Code: {convoy.code}</p>
                        {convoy.description && (
                          <p className="text-sm text-gray-600 mt-1">{convoy.description}</p>
                        )}
                        {(convoy.source_name || convoy.dest_name) && (
                          <p className="text-xs text-gray-400 mt-1">
                            {convoy.source_name || '?'} → {convoy.dest_name || '?'}
                          </p>
                        )}
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {convoy.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={() => handleCopyDeepLink(convoy.code, convoy.trip_id)}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
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

      <div className="mt-6 bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Join a Convoy</h2>
          {vehicles.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-2">You need a vehicle to join a convoy.</p>
              <button
                onClick={() => navigate('/profile')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Add Vehicle in Profile
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Select Vehicle
                </label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">-- Choose vehicle --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.type}) {v.color ? `· ${v.color}` : ''} [{v.license_plate}]
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-3">
                <input
                  type="text"
                  placeholder="Enter convoy code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  onClick={handleJoin}
                  disabled={joining || !joinCode.trim() || !selectedVehicleId}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {joining ? 'Joining...' : 'Join'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConvoyPage
