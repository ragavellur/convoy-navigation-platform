import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import pb from '../services/pocketbase'

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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile</h1>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center space-x-4 mb-6">
            <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center">
              <span className="text-2xl font-bold text-indigo-600">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || '?'}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{user?.name || 'User'}</h2>
              <p className="text-gray-500">{user?.email}</p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Account Details</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Name</dt>
                <dd className="mt-1 text-sm text-gray-900">{user?.name || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="mt-1 text-sm text-gray-900">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Phone</dt>
                <dd className="mt-1 text-sm text-gray-900">{user?.phone || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Role</dt>
                <dd className="mt-1 text-sm text-gray-900 capitalize">{user?.role || 'member'}</dd>
              </div>
            </dl>
          </div>

          <div className="border-t border-gray-200 pt-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">My Vehicles</h3>
              <button
                onClick={() => setShowAddVehicle(!showAddVehicle)}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                {showAddVehicle ? 'Cancel' : '+ Add Vehicle'}
              </button>
            </div>

            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            {showAddVehicle && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Vehicle name"
                    value={newVehicle.name}
                    onChange={(e) => setNewVehicle((p) => ({ ...p, name: e.target.value }))}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="License plate"
                    value={newVehicle.license_plate}
                    onChange={(e) =>
                      setNewVehicle((p) => ({ ...p, license_plate: e.target.value }))
                    }
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <select
                    value={newVehicle.type}
                    onChange={(e) =>
                      setNewVehicle((p) => ({ ...p, type: e.target.value as Vehicle['type'] }))
                    }
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button
                  onClick={handleAddVehicle}
                  disabled={
                    savingVehicle || !newVehicle.name.trim() || !newVehicle.license_plate.trim()
                  }
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingVehicle ? 'Saving...' : 'Save Vehicle'}
                </button>
              </div>
            )}

            {loadingVehicles ? (
              <p className="text-sm text-gray-500">Loading vehicles...</p>
            ) : vehicles.length === 0 ? (
              <p className="text-sm text-gray-500">No vehicles added yet.</p>
            ) : (
              <div className="space-y-2">
                {vehicles.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
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
                        <p className="text-sm font-medium text-gray-900">{v.name}</p>
                        <p className="text-xs text-gray-500">
                          {v.type} · {v.color ? `${v.color} · ` : ''}
                          {v.license_plate}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteVehicle(v.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-6 mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Push Notifications</p>
                  <p className="text-sm text-gray-500">Receive alerts for convoy updates</p>
                </div>
                <button className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-indigo-600 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                  <span className="translate-x-5 inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"></span>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Location Sharing</p>
                  <p className="text-sm text-gray-500">Share your location with convoy members</p>
                </div>
                <button className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-indigo-600 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
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
