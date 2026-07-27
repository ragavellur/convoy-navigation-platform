import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import pb from '../services/pocketbase'
import { generateDeepLink } from '../services/deepLink'
import { shareViaWhatsApp, shareViaSMS, shareViaEmail } from '../services/share'
import { subscribeToConvoyNotifications, type ConvoyNotification } from '../services/notifications'
import { useAuth } from '../hooks/useAuth'

interface ConvoyRecord {
  id: string
  name: string
  code: string
  description?: string
  owner: string
  status: 'active' | 'paused' | 'ended'
  trip_id: string
  security_token: string
  source_lat?: number
  source_lng?: number
  source_name?: string
  dest_lat?: number
  dest_lng?: number
  dest_name?: string
  created: string
}

interface MemberRecord {
  id: string
  convoy: string
  user: string
  role: 'host' | 'member' | 'viewer'
  status: 'active' | 'inactive' | 'removed'
  vehicle?: string
  joined_at: string
  expand?: {
    user?: { id: string; name: string; email: string }
    vehicle?: { id: string; name: string; type: string; color?: string }
  }
}

function ConvoyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [convoy, setConvoy] = useState<ConvoyRecord | null>(null)
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [notifications, setNotifications] = useState<ConvoyNotification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)

  const isHost = convoy?.owner === user?.id

  useEffect(() => {
    if (!id) return
    const fetch = async () => {
      setLoading(true)
      try {
        const c = await pb.collection('convoys').getOne<ConvoyRecord>(id)
        setConvoy(c)
        const m = await pb.collection('convoy_members').getFullList<MemberRecord>({
          filter: `convoy = "${id}" && status = "active"`,
          expand: 'user,vehicle',
        })
        setMembers(m)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load convoy')
      } finally {
        setLoading(false)
      }
    }
    fetch()

    const setup = async () => {
      const unsub = await subscribeToConvoyNotifications(id, (notification) => {
        setNotifications((prev) => [notification, ...prev].slice(0, 20))
        setShowNotifications(true)
      })
      return unsub
    }

    let unsubFn: (() => void) | null = null
    setup().then((fn) => {
      unsubFn = fn
    })
    return () => {
      unsubFn?.()
    }
  }, [id])

  const refreshData = async () => {
    if (!id) return
    try {
      const c = await pb.collection('convoys').getOne<ConvoyRecord>(id)
      setConvoy(c)
      const m = await pb.collection('convoy_members').getFullList<MemberRecord>({
        filter: `convoy = "${id}" && status = "active"`,
        expand: 'user,vehicle',
      })
      setMembers(m)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load convoy')
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    try {
      await pb.collection('convoy_members').update(memberId, { status: 'removed' })
      await refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  const handleEndSession = async () => {
    if (!id) return
    try {
      await pb.collection('convoys').update(id, { status: 'ended' })
      navigate('/convoy')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end session')
    }
  }

  const handleCopyLink = async () => {
    if (!convoy) return
    const link = generateDeepLink(convoy.code, convoy.trip_id)
    await navigator.clipboard.writeText(link)
  }

  const handleGoToMap = () => {
    navigate(`/map?convoy=${id}`)
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <p className="text-gray-500">Loading convoy...</p>
      </div>
    )
  }

  if (!convoy) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <p className="text-red-600">Convoy not found.</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <button
          onClick={() => navigate('/convoy')}
          className="text-sm text-indigo-600 hover:text-indigo-500 mb-2"
        >
          ← Back to Convoys
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{convoy.name}</h1>
            <p className="text-sm text-gray-500 mt-1">Code: {convoy.code}</p>
            {convoy.description && (
              <p className="text-sm text-gray-600 mt-1">{convoy.description}</p>
            )}
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            {convoy.status}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {showNotifications && notifications.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-700 text-sm flex justify-between items-center">
          <span>{notifications[0].message}</span>
          <button
            onClick={() => setShowNotifications(false)}
            className="text-blue-500 hover:text-blue-700 ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white shadow rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-gray-900">Members ({members.length})</h2>
              <div className="flex space-x-2">
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Copy Link
                </button>
                <button
                  onClick={() => shareViaWhatsApp(convoy!.code, convoy!.trip_id, convoy!.name)}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => shareViaSMS(convoy!.code, convoy!.trip_id, convoy!.name)}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  SMS
                </button>
                <button
                  onClick={() => shareViaEmail(convoy!.code, convoy!.trip_id, convoy!.name)}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Email
                </button>
                <button
                  onClick={handleGoToMap}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Open Map
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                      <span className="text-sm font-medium text-indigo-600">
                        {member.expand?.user?.name?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {member.expand?.user?.name || 'Unknown'}
                        {member.user === user?.id && (
                          <span className="text-gray-400 ml-1">(you)</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {member.role === 'host' ? '👑 Host' : 'Member'}
                        {member.expand?.vehicle && ` · ${member.expand.vehicle.type}`}
                      </p>
                    </div>
                  </div>
                  {isHost && member.user !== user?.id && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="text-xs text-red-600 hover:text-red-500"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <div className="bg-white shadow rounded-lg p-4">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Host Controls</h2>
              <div className="flex space-x-3">
                <button
                  onClick={handleEndSession}
                  className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
                >
                  End Session
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Your Vehicle</h2>
            {(() => {
              const myMember = members.find((m) => m.user === user?.id)
              const vehicle = myMember?.expand?.vehicle
              if (vehicle) {
                return (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-900">{vehicle.name}</p>
                    <p className="text-xs text-gray-500">
                      {vehicle.type}
                      {vehicle.color ? ` · ${vehicle.color}` : ''}
                    </p>
                  </div>
                )
              }
              return (
                <p className="text-sm text-gray-500">
                  No vehicle assigned.{' '}
                  <button
                    onClick={() => navigate('/profile')}
                    className="text-indigo-600 hover:underline"
                  >
                    Add one in Profile
                  </button>
                </p>
              )
            })()}
          </div>

          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Convoy Info</h2>
            <dl className="space-y-2 text-sm">
              {(convoy.source_name || convoy.dest_name) && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Route</dt>
                  <dd className="text-gray-900 text-right max-w-[200px] truncate">
                    {convoy.source_name || '?'} → {convoy.dest_name || '?'}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Trip ID</dt>
                <dd className="text-gray-900 font-mono text-xs">{convoy.trip_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-900">{new Date(convoy.created).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConvoyDetailPage
