import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import supabase from '../services/supabaseClient'
import { generateDeepLink } from '../services/deepLink'
import { shareViaWhatsApp, shareViaSMS, shareViaEmail } from '../services/share'
import ConvoyTypeBadge from '../components/ConvoyTypeBadge'
import StatusBadge from '../components/StatusBadge'
import { subscribeToConvoyNotifications, type ConvoyNotification } from '../services/notifications'
import { useAuth } from '../hooks/useAuth'
import {
  getSimulationStatus,
  simulationTick,
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
  status: 'not_started' | 'active' | 'paused' | 'ended'
  convoy_type: 'vehicle' | 'trekker'
  phase: 'forming' | 'assembling' | 'in_transit' | 'completed'
  assembled_members?: string[]
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

interface MemberRecord {
  id: string
  convoy: string
  user: string
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'inactive' | 'removed'
  vehicle?: string
  joined_at: string
  join_name?: string
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
  const [waitAtMeeting, setWaitAtMeeting] = useState(true)
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

  const loadMembers = useCallback(async (convoyId: string): Promise<MemberRecord[]> => {
    const { data: rows, error: rowsError } = await supabase
      .from('convoy_members')
      .select('id, convoy, user, role, status, vehicle, joined_at, join_name')
      .eq('convoy', convoyId)
      .eq('status', 'active')
    if (rowsError) throw rowsError
    const memberRows = rows || []

    const userIds = memberRows.map((m) => m.user)
    const vehicleIds = memberRows.map((m) => m.vehicle).filter((v): v is string => v !== null)

    const [profiles, vehicles] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('id, name').in('id', userIds)
        : Promise.resolve({ data: [] }),
      vehicleIds.length > 0
        ? supabase.from('vehicles').select('id, name, type, color').in('id', vehicleIds)
        : Promise.resolve({ data: [] }),
    ])

    const userMap = new Map((profiles.data || []).map((p) => [p.id, p]))
    const vehicleMap = new Map(
      (
        (vehicles as { data: { id: string; name: string; type: string; color: string | null }[] })
          .data || []
      ).map((v) => [v.id, v]),
    )

    return memberRows.map((m) => {
      const profile = userMap.get(m.user)
      const vehicle = m.vehicle ? vehicleMap.get(m.vehicle) : undefined
      return {
        id: m.id,
        convoy: m.convoy,
        user: m.user,
        role: m.role as MemberRecord['role'],
        status: m.status as MemberRecord['status'],
        vehicle: m.vehicle ?? undefined,
        joined_at: m.joined_at ?? '',
        join_name: m.join_name ?? undefined,
        expand: {
          user: profile ? { id: profile.id, name: profile.name ?? '', email: '' } : undefined,
          vehicle: vehicle
            ? {
                id: vehicle.id,
                name: vehicle.name,
                type: vehicle.type,
                color: vehicle.color ?? undefined,
              }
            : undefined,
        },
      }
    })
  }, [])

  const loadConvoy = useCallback(async (convoyId: string): Promise<ConvoyRecord | null> => {
    const { data } = await supabase.from('convoys').select('*').eq('id', convoyId).maybeSingle()
    return (data as ConvoyRecord) ?? null
  }, [])

  useEffect(() => {
    if (!id) return
    const fetch = async () => {
      setLoading(true)
      try {
        const c = await loadConvoy(id)
        setConvoy(c)
        const m = await loadMembers(id)
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
  }, [id, loadConvoy, loadMembers])

  useEffect(() => {
    if (!id || !simRunning) return
    const tick = () => {
      simulationTick(id).catch(() => {})
    }
    tick()
    const timer = setInterval(tick, 2000)
    return () => clearInterval(timer)
  }, [id, simRunning])

  const refreshData = async () => {
    if (!id) return
    try {
      const c = await loadConvoy(id)
      setConvoy(c)
      const m = await loadMembers(id)
      setMembers(m)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load convoy')
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    try {
      const member = members.find((m) => m.id === memberId)
      await supabase.from('convoy_members').update({ status: 'removed' }).eq('id', memberId)
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
      await supabase.from('convoy_members').update({ status: 'inactive' }).eq('id', myMember.id)
      navigate('/convoy')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave convoy')
    }
  }

  const handleStartConvoy = async () => {
    if (!id || !convoy) return
    try {
      await supabase.from('convoys').update({ status: 'active' }).eq('id', id)
      setConvoy({ ...convoy, status: 'active' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start convoy')
    }
  }

  const handleDeleteConvoy = async () => {
    if (!id) return
    if (
      !window.confirm(
        'Delete this convoy permanently? All members, positions and messages will be removed.',
      )
    ) {
      return
    }
    try {
      await supabase.from('convoys').delete().eq('id', id)
      navigate('/convoy')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete convoy')
    }
  }

  const handleEndSession = async () => {
    if (!id) return
    try {
      await supabase.from('convoys').update({ status: 'ended' }).eq('id', id)
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
      await startSimulation(id, simSpeed, 2, waitAtMeeting)
      setSimRunning(true)
      notifySimulationStarted(id)
      if (convoy && convoy.status !== 'active') {
        await supabase.from('convoys').update({ status: 'active' }).eq('id', id)
        setConvoy({ ...convoy, status: 'active' })
      }
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
      await restartSimulation(id, simSpeed, 2, waitAtMeeting)
      setSimRunning(true)
      if (convoy && convoy.status !== 'active') {
        await supabase.from('convoys').update({ status: 'active' }).eq('id', id)
        setConvoy({ ...convoy, status: 'active' })
      }
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
        typeof convoy.settings === 'string'
          ? (JSON.parse(convoy.settings) as Record<string, unknown>)
          : convoy.settings || {}
      const newSettings = { ...currentSettings, simulation_active: !isSimulationEnabled }
      const { error } = await supabase
        .from('convoys')
        .update({ settings: newSettings })
        .eq('id', id)
      if (error) throw error
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
        typeof convoy.settings === 'string'
          ? (JSON.parse(convoy.settings) as Record<string, unknown>)
          : convoy.settings || {}
      const newSettings = { ...currentSettings, keep_latest_only: !isKeepLatestOnly }
      const { error } = await supabase
        .from('convoys')
        .update({ settings: newSettings })
        .eq('id', id)
      if (error) throw error
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
        <p className="text-[var(--error-text)]">Convoy not found.</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <button
          onClick={() => navigate('/convoy')}
          className="text-sm text-[var(--primary)] hover:text-[var(--primary-hover)] mb-2 transition-colors"
        >
          ← Back to Convoys
        </button>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--text)]">{convoy.name}</h1>
              <ConvoyTypeBadge convoyType={convoy.convoy_type} />
            </div>
            <p className="text-sm text-[var(--text2)] mt-1">Code: {convoy.code}</p>
            {convoy.description && (
              <p className="text-sm text-[var(--text2)] mt-1">{convoy.description}</p>
            )}
          </div>
          <StatusBadge status={convoy.status} />
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-xl text-sm error-banner">{error}</div>}

      {convoy.status === 'not_started' && (
        <div className="mb-4 p-3 rounded-xl text-sm info-banner flex justify-between items-center gap-3">
          <span>
            This convoy hasn't started yet. Live positions are only shared after the owner starts
            it.
          </span>
          {isHost && (
            <button
              onClick={handleStartConvoy}
              className="shrink-0 inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-green-600 hover:bg-green-500 transition-colors"
            >
              Start Convoy
            </button>
          )}
        </div>
      )}

      {showNotifications && notifications.length > 0 && (
        <div className="mb-4 p-3 rounded-xl text-sm info-banner flex justify-between items-center">
          <span>{notifications[0].message}</span>
          <button
            onClick={() => setShowNotifications(false)}
            className="text-[var(--info-text)] hover:opacity-80 ml-2 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl p-4 card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-[var(--text)]">Members ({members.length})</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text2)] hover:text-[var(--text)] transition-colors border border-[var(--border)]"
                >
                  Copy Link
                </button>
                <button
                  onClick={() => shareViaWhatsApp(convoy!.code, convoy!.trip_id, convoy!.name)}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text2)] hover:text-[var(--text)] transition-colors border border-[var(--border)]"
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => shareViaSMS(convoy!.code, convoy!.trip_id, convoy!.name)}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text2)] hover:text-[var(--text)] transition-colors border border-[var(--border)]"
                >
                  SMS
                </button>
                <button
                  onClick={() => shareViaEmail(convoy!.code, convoy!.trip_id, convoy!.name)}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text2)] hover:text-[var(--text)] transition-colors border border-[var(--border)]"
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
                  className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)]"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-[var(--badge-vehicle-bg)] flex items-center justify-center">
                      <span className="text-sm font-medium text-[var(--primary)]">
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
                        className="text-xs text-[var(--error-text)] hover:text-[var(--danger)] transition-colors"
                      >
                        Remove
                      </button>
                    )}
                    {member.user === user?.id && (
                      <button
                        onClick={handleLeaveConvoy}
                        className="text-xs text-[var(--error-text)] hover:text-[var(--danger)] transition-colors"
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
            <div className="rounded-xl p-4 card">
              <h2 className="text-lg font-medium text-[var(--text)] mb-4">Host Controls</h2>
              <div className="flex space-x-3 mb-4">
                {convoy.status === 'not_started' && (
                  <button
                    onClick={handleStartConvoy}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-[var(--success-text)] hover:bg-[var(--success-bg)] transition-colors border border-[var(--success-border-light)]"
                  >
                    Start Convoy
                  </button>
                )}
                <button
                  onClick={handleEndSession}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-[var(--error-text)] hover:bg-[var(--error-bg)] transition-colors border border-[var(--danger-border-light)]"
                >
                  End Session
                </button>
                <button
                  onClick={handleDeleteConvoy}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-[var(--error-text)] hover:bg-[var(--error-bg)] transition-colors border border-[var(--danger-border-light)]"
                >
                  Delete Convoy
                </button>
              </div>

              <div className="border-t border-[var(--border)] pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-[var(--text)]">Simulation Mode</h3>
                  <button
                    onClick={handleToggleSimulationMode}
                    disabled={simLoading}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--warning)] focus:ring-offset-2 ${
                      isSimulationEnabled ? 'bg-[var(--warning)]' : 'bg-[var(--surface-hover)]'
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
                    <p className="text-xs text-[var(--warning-text)] rounded-lg p-2 warning-banner">
                      Simulation mode enabled. Real GPS positions are disabled for this convoy.
                    </p>

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[var(--text2)]">Speed:</label>
                      <select
                        value={simSpeed}
                        onChange={(e) => setSimSpeed(Number(e.target.value))}
                        className="text-xs rounded-lg px-2 py-1 input-field"
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
                          Wait at Meeting Point
                        </p>
                        <p className="text-[10px] text-[var(--text2)] opacity-70">
                          All vehicles wait at meeting point until every member arrives, then resume
                          together
                        </p>
                      </div>
                      <button
                        onClick={() => setWaitAtMeeting(!waitAtMeeting)}
                        disabled={simRunning}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 ${
                          waitAtMeeting ? 'bg-[var(--primary)]' : 'bg-[var(--surface-hover)]'
                        } ${simRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[var(--toggle-knob)] shadow ring-0 transition duration-200 ease-in-out ${
                            waitAtMeeting ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
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
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 ${
                          isKeepLatestOnly ? 'bg-[var(--primary)]' : 'bg-[var(--surface-hover)]'
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
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--success-text)] hover:bg-[var(--success-bg)] disabled:opacity-50 transition-colors border border-[var(--success-border-light)]"
                        >
                          {simLoading ? 'Starting...' : 'Start Simulation'}
                        </button>
                      ) : (
                        <button
                          onClick={handleStopSimulation}
                          disabled={simLoading}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--error-text)] hover:bg-[var(--error-bg)] disabled:opacity-50 transition-colors border border-[var(--danger-border-light)]"
                        >
                          {simLoading ? 'Stopping...' : 'Stop'}
                        </button>
                      )}
                      <button
                        onClick={handleRestartSimulation}
                        disabled={simLoading}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--warning-text)] hover:bg-[var(--warning-bg)] disabled:opacity-50 transition-colors border border-[var(--warning-border-light)]"
                      >
                        {simLoading ? 'Restarting...' : 'Restart (Clear + Start)'}
                      </button>
                      <button
                        onClick={handleClearPositions}
                        disabled={simLoading || simRunning}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text2)] hover:text-[var(--text)] disabled:opacity-50 transition-colors border border-[var(--border)]"
                      >
                        Clear Positions
                      </button>
                    </div>

                    {simRunning && (
                      <div className="flex items-center gap-2 text-xs text-[var(--success-text)]">
                        <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
                        Running at {simSpeed}x speed
                      </div>
                    )}

                    {simError && <p className="text-xs text-[var(--error-text)]">{simError}</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl p-4 card">
            <h2 className="text-lg font-medium text-[var(--text)] mb-4">Your Vehicle</h2>{' '}
            {(() => {
              const myMember = members.find((m) => m.user === user?.id)
              const vehicle = myMember?.expand?.vehicle
              if (vehicle) {
                return (
                  <div className="p-3 rounded-xl bg-[var(--surface)]">
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
                    className="text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
                  >
                    Add one in Profile
                  </button>
                </p>
              )
            })()}
          </div>

          <div className="rounded-xl p-4 card">
            <h2 className="text-lg font-medium text-[var(--text)] mb-4">Convoy Info</h2>
            <dl className="space-y-2 text-sm">
              {(convoy.source_name || convoy.dest_name) && (
                <div className="flex justify-between">
                  <dt className="text-[var(--text2)]">Route</dt>
                  <dd className="text-[var(--text)] text-right">
                    {members.find((m) => m.user === user?.id)?.join_name ||
                      convoy.source_name ||
                      '?'}{' '}
                    → {convoy.dest_name || '?'}
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
                  {new Date(convoy.created_at).toLocaleDateString()}
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
