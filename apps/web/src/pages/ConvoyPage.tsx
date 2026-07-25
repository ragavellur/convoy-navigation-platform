import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import pb from '../services/pocketbase'
import { useNavigate } from 'react-router-dom'

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

function ConvoyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [convoys, setConvoys] = useState<ConvoyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [newConvoyName, setNewConvoyName] = useState('')
  const [newConvoyDesc, setNewConvoyDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

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

  const handleCreate = async () => {
    if (!newConvoyName.trim()) return
    setCreating(true)
    setError('')
    try {
      const code = generateConvoyCode()
      const tripId = generateTripId()
      const securityToken = generateSecurityToken()
      await pb.collection('convoys').create({
        name: newConvoyName.trim(),
        code,
        description: newConvoyDesc.trim() || undefined,
        owner: user?.id,
        status: 'active',
        trip_id: tripId,
        security_token: securityToken,
      })
      setNewConvoyName('')
      setNewConvoyDesc('')
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
      await pb.collection('convoy_members').create({
        convoy: convoy.id,
        user: user?.id,
        role: 'member',
        status: 'active',
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
    navigate(`/map?convoy=${convoyId}`)
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
                  onClick={() => handleOpenConvoy(convoy.id)}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{convoy.name}</h3>
                      <p className="text-sm text-gray-500">Code: {convoy.code}</p>
                      {convoy.description && (
                        <p className="text-sm text-gray-600 mt-1">{convoy.description}</p>
                      )}
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {convoy.status}
                    </span>
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
              disabled={joining || !joinCode.trim()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConvoyPage
