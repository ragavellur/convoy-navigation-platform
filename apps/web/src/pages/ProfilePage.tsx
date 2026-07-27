import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import pb from '../services/pocketbase'
import {
  isPushSupported,
  getPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  getPermissionState,
} from '../services/pushNotifications'

interface Vehicle {
  id: string
  name: string
  type: 'car' | 'truck' | 'motorcycle' | 'other'
  color?: string
  license_plate: string
  status: string
}

const VEHICLE_TYPES = ['car', 'truck', 'motorcycle', 'other'] as const

function ProfilePage() {
  const { user } = useAuth()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loadingVehicles, setLoadingVehicles] = useState(true)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [newVehicle, setNewVehicle] = useState({
    name: '',
    type: 'car' as Vehicle['type'],
    color: '',
    license_plate: '',
  })
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [error, setError] = useState('')
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    const fetchVehicles = async () => {
      if (!user) return
      setLoadingVehicles(true)
      try {
        const records = await pb.collection('vehicles').getFullList({
          filter: `owner = "${user.id}"`,
          sort: '-created',
        })
        setVehicles(records as unknown as Vehicle[])
      } catch {
        // Collection may not exist yet
      } finally {
        setLoadingVehicles(false)
      }
    }
    fetchVehicles()
  }, [user])

  useEffect(() => {
    const checkPush = async () => {
      const supported = await isPushSupported()
      setPushSupported(supported)
      if (!supported) return
      const sub = await getPushSubscription()
      setPushEnabled(sub !== null || getPermissionState() === 'granted')
    }
    checkPush()
  }, [])

  const handleTogglePush = async () => {
    if (!pushSupported) return
    setPushLoading(true)
    try {
      if (pushEnabled) {
        await unsubscribeFromPush()
        setPushEnabled(false)
      } else {
        const sub = await subscribeToPush()
        setPushEnabled(sub !== null)
      }
    } catch {
      // permission denied or error
    } finally {
      setPushLoading(false)
    }
  }

  const handleAddVehicle = async () => {
    if (!newVehicle.name.trim() || !newVehicle.license_plate.trim()) return
    setSavingVehicle(true)
    setError('')
    try {
      await pb.collection('vehicles').create({
        name: newVehicle.name.trim(),
        type: newVehicle.type,
        color: newVehicle.color.trim() || undefined,
        license_plate: newVehicle.license_plate.trim(),
        owner: user?.id,
        status: 'active',
      })
      setNewVehicle({ name: '', type: 'car', color: '', license_plate: '' })
      setShowAddVehicle(false)
      const records = await pb.collection('vehicles').getFullList({
        filter: `owner = "${user?.id}"`,
        sort: '-created',
      })
      setVehicles(records as unknown as Vehicle[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add vehicle')
    } finally {
      setSavingVehicle(false)
    }
  }

  const handleDeleteVehicle = async (vehicleId: string) => {
    try {
      await pb.collection('vehicles').update(vehicleId, { status: 'retired' })
      setVehicles((prev) => prev.filter((v) => v.id !== vehicleId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove vehicle')
    }
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-white mb-6">Profile</h1>

      <div
        className="rounded-xl"
        style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)' }}
      >
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center space-x-4 mb-6">
            <div className="h-16 w-16 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <span className="text-2xl font-bold text-indigo-400">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || '?'}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{user?.name || 'User'}</h2>
              <p className="text-slate-400">{user?.email}</p>
            </div>
          </div>

          <div className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-lg font-medium text-white mb-4">Account Details</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-slate-400">Name</dt>
                <dd className="mt-1 text-sm text-white">{user?.name || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-400">Email</dt>
                <dd className="mt-1 text-sm text-white">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-400">Phone</dt>
                <dd className="mt-1 text-sm text-white">{user?.phone || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-400">Role</dt>
                <dd className="mt-1 text-sm text-white capitalize">{user?.role || 'member'}</dd>
              </div>
            </dl>
          </div>

          <div className="border-t pt-6 mt-6" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">My Vehicles</h3>
              <button
                onClick={() => setShowAddVehicle(!showAddVehicle)}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                {showAddVehicle ? 'Cancel' : '+ Add Vehicle'}
              </button>
            </div>

            {error && (
              <div
                className="mb-3 p-2 rounded-xl text-sm text-red-400"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                {error}
              </div>
            )}

            {showAddVehicle && (
              <div
                className="mb-4 p-4 rounded-xl space-y-3"
                style={{ background: 'rgba(255, 255, 255, 0.03)' }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Vehicle name"
                    value={newVehicle.name}
                    onChange={(e) => setNewVehicle((p) => ({ ...p, name: e.target.value }))}
                    className="rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="License plate"
                    value={newVehicle.license_plate}
                    onChange={(e) =>
                      setNewVehicle((p) => ({ ...p, license_plate: e.target.value }))
                    }
                    className="rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                    }}
                  />
                  <select
                    value={newVehicle.type}
                    onChange={(e) =>
                      setNewVehicle((p) => ({ ...p, type: e.target.value as Vehicle['type'] }))
                    }
                    className="rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Color (optional)"
                    value={newVehicle.color}
                    onChange={(e) => setNewVehicle((p) => ({ ...p, color: e.target.value }))}
                    className="rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                    }}
                  />
                </div>
                <button
                  onClick={handleAddVehicle}
                  disabled={
                    savingVehicle || !newVehicle.name.trim() || !newVehicle.license_plate.trim()
                  }
                  className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {savingVehicle ? 'Saving...' : 'Save Vehicle'}
                </button>
              </div>
            )}

            {loadingVehicles ? (
              <p className="text-sm text-slate-400">Loading vehicles...</p>
            ) : vehicles.length === 0 ? (
              <p className="text-sm text-slate-400">No vehicles added yet.</p>
            ) : (
              <div className="space-y-2">
                {vehicles.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-lg">
                        {v.type === 'car'
                          ? '🚗'
                          : v.type === 'truck'
                            ? '🚛'
                            : v.type === 'motorcycle'
                              ? '🏍️'
                              : '🚐'}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-white">{v.name}</p>
                        <p className="text-xs text-slate-400">
                          {v.type} · {v.color ? `${v.color} · ` : ''}
                          {v.license_plate}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteVehicle(v.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-6 mt-6" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-lg font-medium text-white mb-4">Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Push Notifications</p>
                  <p className="text-sm text-slate-400">
                    {!pushSupported
                      ? 'Not supported in this browser'
                      : pushEnabled
                        ? 'Enabled — receive alerts for convoy updates'
                        : 'Receive alerts for convoy updates'}
                  </p>
                </div>
                <button
                  aria-label="Toggle push notifications"
                  onClick={handleTogglePush}
                  disabled={!pushSupported || pushLoading}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    pushEnabled ? 'bg-indigo-600' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      pushEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  ></span>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Location Sharing</p>
                  <p className="text-sm text-slate-400">Share your location with convoy members</p>
                </div>
                <button
                  aria-label="Toggle location sharing"
                  className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-indigo-600 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  <span className="translate-x-5 inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
