import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import pb from '../services/pocketbase'
import { generateDeepLink } from '../services/deepLink'
import { shareViaWhatsApp, shareViaSMS, shareViaEmail } from '../services/share'
import { subscribeToConvoyNotifications, type ConvoyNotification } from '../services/notifications'
import { useAuth } from '../hooks/useAuth'
import {
  getSimulationStatus,
  startSimulation,
  stopSimulation,
  restartSimulation,
  clearSimulationPositions,
  cleanupPositions,
} from '../services/simulation'
import {
  notifyMemberLeft,
  notifyConvoyEnded,
  notifySimulationStarted,
  notifySimulationStopped,
} from '../services/pushSender'

interface ConvoyRecord {
  id: string
  name: string
  code: string
  description?: string
  owner: string
  status: 'active' | 'paused' | 'ended'
  convoy_type: 'vehicle' | 'trekker'
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
}

interface MemberRecord {
  id: string
  convoy: string
  user: string
  role: 'owner' | 'admin' | 'member'
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
  const [simRunning, setSimRunning] = useState(false)
  const [simSpeed, setSimSpeed] = useState(10)
  const [simLoading, setSimLoading] = useState(false)
  const [simError, setSimError] = useState('')

  const isHost = convoy?.owner === user?.id

  const isSimulationEnabled = (() => {
    if (!convoy?.settings) return false
    const settings =
      typeof convoy.settings === 'string' ? JSON.parse(convoy.settings) : convoy.settings
    return !!settings.simulation_active
  })()

  const isKeepLatestOnly = (() => {
    if (!convoy?.settings) return false
    const settings =
      typeof convoy.settings === 'string' ? JSON.parse(convoy.settings) : convoy.settings
    return !!settings.keep_latest_only
  })()

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

        try {
          const simStatus = await getSimulationStatus(id)
          setSimRunning(simStatus.running)
        } catch {
          setSimRunning(false)
        }
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
      const member = members.find((m) => m.id === memberId)
      await pb.collection('convoy_members').update(memberId, { status: 'removed' })
      await refreshData()
      if (id && member?.expand?.user?.name) {
        notifyMemberLeft(id, member.expand.user.name)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  const handleLeaveConvoy = async () => {
    const myMember = members.find((m) => m.user === user?.id)
    if (!myMember) return
    try {
      await pb.collection('convoy_members').update(myMember.id, { status: 'inactive' })
      navigate('/convoy')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave convoy')
    }
  }

  const handleEndSession = async () => {
    if (!id) return
    try {
      await pb.collection('convoys').update(id, { status: 'ended' })
      notifyConvoyEnded(id)
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

  const handleStartSimulation = async () => {
    if (!id) return
    setSimLoading(true)
    setSimError('')
    try {
      await startSimulation(id, simSpeed)
      setSimRunning(true)
      notifySimulationStarted(id)
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Failed to start simulation')
    } finally {
      setSimLoading(false)
    }
  }

  const handleStopSimulation = async () => {
    if (!id) return
    setSimLoading(true)
    setSimError('')
    try {
      await stopSimulation(id)
      setSimRunning(false)
      notifySimulationStopped(id)
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Failed to stop simulation')
    } finally {
      setSimLoading(false)
    }
  }

  const handleRestartSimulation = async () => {
    if (!id) return
    setSimLoading(true)
    setSimError('')
    try {
      await restartSimulation(id, simSpeed)
      setSimRunning(true)
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Failed to restart simulation')
    } finally {
      setSimLoading(false)
    }
  }

  const handleClearPositions = async () => {
    if (!id) return
    setSimLoading(true)
    setSimError('')
    try {
      const result = await clearSimulationPositions(id)
      setSimError('')
      alert(`Cleared ${result.deleted} simulated positions`)
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Failed to clear positions')
    } finally {
      setSimLoading(false)
    }
  }

  const handleToggleSimulationMode = async () => {
    if (!id || !convoy) return
    setSimLoading(true)
    setSimError('')
    try {
      const currentSettings =
        typeof convoy.settings === 'string' ? JSON.parse(convoy.settings) : convoy.settings || {}
      const newSettings = { ...currentSettings, simulation_active: !isSimulationEnabled }
      await pb.collection('convoys').update(id, {
        settings: JSON.stringify(newSettings),
      })
      setConvoy({ ...convoy, settings: newSettings })
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Failed to toggle simulation mode')
    } finally {
      setSimLoading(false)
    }
  }

  const handleToggleKeepLatestOnly = async () => {
    if (!id || !convoy) return
    setSimLoading(true)
    setSimError('')
    try {
      const currentSettings =
        typeof convoy.settings === 'string' ? JSON.parse(convoy.settings) : convoy.settings || {}
      const newSettings = { ...currentSettings, keep_latest_only: !isKeepLatestOnly }
      await pb.collection('convoys').update(id, {
        settings: JSON.stringify(newSettings),
      })
      setConvoy({ ...convoy, settings: newSettings })

      if (!isKeepLatestOnly) {
        const result = await cleanupPositions(id)
        setSimError(`Cleaned up ${result.deleted} old positions, kept ${result.kept} latest`)
      }
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Failed to toggle keep latest only')
    } finally {
      setSimLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <p className="text-[var(--text2)]">Loading convoy...</p>
      </div>
    )
  }

  if (!convoy) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <p className="text-red-400">Convoy not found.</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <button
          onClick={() => navigate('/convoy')}
          className="text-sm text-indigo-400 hover:text-indigo-300 mb-2 transition-colors"
        >
          ← Back to Convoys
        </button>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--text)]">{convoy.name}</h1>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background:
                    (convoy.convoy_type || 'vehicle') === 'trekker'
                      ? 'var(--badge-trekker-bg)'
                      : 'var(--badge-vehicle-bg)',
                  color:
                    (convoy.convoy_type || 'vehicle') === 'trekker'
                      ? 'var(--badge-trekker-text)'
                      : 'var(--badge-vehicle-text)',
                }}
              >
                {(convoy.convoy_type || 'vehicle') === 'trekker' ? '🥾 Trekker' : '🚗 Vehicle'}
              </span>
            </div>
            <p className="text-sm text-[var(--text2)] mt-1">Code: {convoy.code}</p>
            {convoy.description && (
              <p className="text-sm text-[var(--text2)] mt-1">{convoy.description}</p>
            )}
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400">
            {convoy.status}
          </span>
        </div>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-xl text-sm text-red-400"
          style={{
            background: 'var(--error-bg)',
            border: '1px solid var(--error-border)',
          }}
        >
          {error}
        </div>
      )}

      {showNotifications && notifications.length > 0 && (
        <div
          className="mb-4 p-3 rounded-xl text-sm text-blue-400 flex justify-between items-center"
          style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
          }}
        >
          <span>{notifications[0].message}</span>
          <button
            onClick={() => setShowNotifications(false)}
            className="text-blue-400 hover:text-blue-300 ml-2 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-[var(--text)]">Members ({members.length})</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text2)] hover:text-[var(--text)] transition-colors"
                  style={{ border: '1px solid var(--border)' }}
                >
                  Copy Link
                </button>
                <button
                  onClick={() => shareViaWhatsApp(convoy!.code, convoy!.trip_id, convoy!.name)}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text2)] hover:text-[var(--text)] transition-colors"
                  style={{ border: '1px solid var(--border)' }}
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => shareViaSMS(convoy!.code, convoy!.trip_id, convoy!.name)}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text2)] hover:text-[var(--text)] transition-colors"
                  style={{ border: '1px solid var(--border)' }}
                >
                  SMS
                </button>
                <button
                  onClick={() => shareViaEmail(convoy!.code, convoy!.trip_id, convoy!.name)}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text2)] hover:text-[var(--text)] transition-colors"
                  style={{ border: '1px solid var(--border)' }}
                >
                  Email
                </button>
                <button
                  onClick={handleGoToMap}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
                >
                  Open Map
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                      <span className="text-sm font-medium text-indigo-400">
                        {member.expand?.user?.name?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text)]">
                        {member.expand?.user?.name || 'Unknown'}
                        {member.user === user?.id && (
                          <span className="text-[var(--text2)] opacity-70 ml-1">(you)</span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--text2)]">
                        {member.role === 'owner'
                          ? '👑 Owner'
                          : member.role === 'admin'
                            ? '⭐ Admin'
                            : 'Member'}
                        {member.expand?.vehicle &&
                          (member.expand.vehicle.type === 'trekker'
                            ? ' · 🥾 Trekker'
                            : ` · ${member.expand.vehicle.type}`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isHost && member.user !== user?.id && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                    {member.user === user?.id && (
                      <button
                        onClick={handleLeaveConvoy}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Leave
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <h2 className="text-lg font-medium text-[var(--text)] mb-4">Host Controls</h2>
              <div className="flex space-x-3 mb-4">
                <button
                  onClick={handleEndSession}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                  style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}
                >
                  End Session
                </button>
              </div>

              <div className="border-t pt-4 mt-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-[var(--text)]">Simulation Mode</h3>
                  <button
                    onClick={handleToggleSimulationMode}
                    disabled={simLoading}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                      isSimulationEnabled ? 'bg-amber-500' : 'bg-[var(--surface-hover)]'
                    } ${simLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[var(--toggle-knob)] shadow ring-0 transition duration-200 ease-in-out ${
                        isSimulationEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {isSimulationEnabled && (
                  <div className="space-y-3">
                    <p
                      className="text-xs text-amber-400 rounded-lg p-2"
                      style={{ background: 'var(--warning-bg)' }}
                    >
                      Simulation mode enabled. Real GPS positions are disabled for this convoy.
                    </p>

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[var(--text2)]">Speed:</label>
                      <select
                        value={simSpeed}
                        onChange={(e) => setSimSpeed(Number(e.target.value))}
                        className="text-xs rounded-lg px-2 py-1 text-[var(--text)]"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <option value={1}>1x (Real-time)</option>
                        <option value={5}>5x</option>
                        <option value={10}>10x</option>
                        <option value={30}>30x</option>
                        <option value={60}>60x</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-[var(--text)]">
                          Keep Only Latest Positions
                        </p>
                        <p className="text-[10px] text-[var(--text2)] opacity-70">
                          Prevents route history accumulation
                        </p>
                      </div>
                      <button
                        onClick={handleToggleKeepLatestOnly}
                        disabled={simLoading}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          isKeepLatestOnly ? 'bg-blue-500' : 'bg-[var(--surface-hover)]'
                        } ${simLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[var(--toggle-knob)] shadow ring-0 transition duration-200 ease-in-out ${
                            isKeepLatestOnly ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!simRunning ? (
                        <button
                          onClick={handleStartSimulation}
                          disabled={simLoading}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
                          style={{ border: '1px solid rgba(16, 185, 129, 0.3)' }}
                        >
                          {simLoading ? 'Starting...' : 'Start Simulation'}
                        </button>
                      ) : (
                        <button
                          onClick={handleStopSimulation}
                          disabled={simLoading}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                          style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}
                        >
                          {simLoading ? 'Stopping...' : 'Stop'}
                        </button>
                      )}
                      <button
                        onClick={handleRestartSimulation}
                        disabled={simLoading}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
                        style={{ border: '1px solid rgba(245, 158, 11, 0.3)' }}
                      >
                        {simLoading ? 'Restarting...' : 'Restart (Clear + Start)'}
                      </button>
                      <button
                        onClick={handleClearPositions}
                        disabled={simLoading || simRunning}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text2)] hover:text-[var(--text)] disabled:opacity-50 transition-colors"
                        style={{ border: '1px solid var(--border)' }}
                      >
                        Clear Positions
                      </button>
                    </div>

                    {simRunning && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Running at {simSpeed}x speed
                      </div>
                    )}

                    {simError && <p className="text-xs text-red-400">{simError}</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-lg font-medium text-[var(--text)] mb-4">Your Vehicle</h2>
            {(() => {
              const myMember = members.find((m) => m.user === user?.id)
              const vehicle = myMember?.expand?.vehicle
              if (vehicle) {
                return (
                  <div className="p-3 rounded-xl" style={{ background: 'var(--surface)' }}>
                    <p className="text-sm font-medium text-[var(--text)]">{vehicle.name}</p>
                    <p className="text-xs text-[var(--text2)]">
                      {vehicle.type}
                      {vehicle.color ? ` · ${vehicle.color}` : ''}
                    </p>
                  </div>
                )
              }
              return (
                <p className="text-sm text-[var(--text2)]">
                  No vehicle assigned.{' '}
                  <button
                    onClick={() => navigate('/profile')}
                    className="text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Add one in Profile
                  </button>
                </p>
              )
            })()}
          </div>

          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-lg font-medium text-[var(--text)] mb-4">Convoy Info</h2>
            <dl className="space-y-2 text-sm">
              {(convoy.source_name || convoy.dest_name) && (
                <div className="flex justify-between">
                  <dt className="text-[var(--text2)]">Route</dt>
                  <dd className="text-[var(--text)] text-right max-w-[200px] truncate">
                    {convoy.source_name || '?'} → {convoy.dest_name || '?'}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[var(--text2)]">Trip ID</dt>
                <dd className="text-[var(--text)] font-mono text-xs">{convoy.trip_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text2)]">Created</dt>
                <dd className="text-[var(--text)]">
                  {new Date(convoy.created).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConvoyDetailPage
