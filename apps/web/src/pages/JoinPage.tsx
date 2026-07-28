import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import pb from '../services/pocketbase'
import { parseDeepLink, validateConvoyCode } from '../services/deepLink'

interface VehicleOption {
  id: string
  name: string
  type: string
  license_plate: string
  color?: string
}

function JoinPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [joinState, setJoinState] = useState<'loading' | 'vehicle-select' | 'joining'>('loading')
  const [convoyId, setConvoyId] = useState<string | null>(null)
  const [convoyType, setConvoyType] = useState<'vehicle' | 'trekker' | null>(null)
  const [convoyName, setConvoyName] = useState('')

  useEffect(() => {
    const init = async () => {
      const urlParams = new URLSearchParams(searchParams.toString())
      const url = `/join?${urlParams.toString()}`
      const data = parseDeepLink(url)

      if (!data || !validateConvoyCode(data.code)) {
        setError('Invalid deep link. Please check the convoy code.')
        return
      }

      if (!pb.authStore.isValid) {
        const allParams = urlParams.toString()
        navigate(`/login?redirect=/join?${allParams}`)
        return
      }

      try {
        const results = await pb.collection('convoys').getFullList({
          filter: `code = "${data.code}" && status = "active"`,
        })

        if (results.length === 0) {
          throw new Error('Convoy not found or inactive')
        }

        const convoy = results[0]
        setConvoyId(convoy.id)
        setConvoyType(convoy.convoy_type || 'vehicle')
        setConvoyName(convoy.name)

        const existing = await pb.collection('convoy_members').getFullList({
          filter: `convoy = "${convoy.id}" && user = "${pb.authStore.record?.id}" && status = "active"`,
        })

        if (existing.length > 0) {
          navigate(`/map?convoy=${convoy.id}`)
          return
        }

        if (convoy.convoy_type === 'trekker') {
          let trekkerVehicleId = ''
          const existingTrekkers = await pb.collection('vehicles').getFullList({
            filter: `owner = "${pb.authStore.record?.id}" && type = "trekker" && status = "active"`,
          })
          if (existingTrekkers.length > 0) {
            trekkerVehicleId = existingTrekkers[0].id
          } else {
            const trekkerName =
              pb.authStore.record?.name || pb.authStore.record?.email?.split('@')[0] || 'Trekker'
            const trekker = await pb.collection('vehicles').create({
              owner: pb.authStore.record?.id,
              name: trekkerName,
              type: 'trekker',
              status: 'active',
            })
            trekkerVehicleId = trekker.id
          }
          setSelectedVehicleId(trekkerVehicleId)
          setJoinState('vehicle-select')
          return
        }

        const userVehicles = await pb.collection('vehicles').getFullList({
          filter: `owner = "${pb.authStore.record?.id}" && status = "active"`,
        })

        const activeMembers = await pb.collection('convoy_members').getFullList({
          filter: `user = "${pb.authStore.record?.id}" && status = "active"`,
        })
        const occupiedVehicleIds = new Set(activeMembers.map((m) => m.vehicle).filter(Boolean))

        const opts: VehicleOption[] = userVehicles
          .filter((r) => !occupiedVehicleIds.has(r.id))
          .map((r) => ({
            id: r.id,
            name: r.name,
            type: r.type,
            license_plate: r.license_plate,
            color: r.color,
          }))
        setVehicles(opts)

        if (opts.length === 1) {
          setSelectedVehicleId(opts[0].id)
        }

        setJoinState('vehicle-select')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join convoy')
      }
    }

    init()
  }, [searchParams, navigate])

  const handleJoin = async () => {
    if (!convoyId) return
    if (convoyType === 'vehicle' && !selectedVehicleId) return
    setJoinState('joining')
    setError('')
    try {
      if (selectedVehicleId) {
        const vehicleInConvoy = await pb.collection('convoy_members').getFullList({
          filter: `vehicle = "${selectedVehicleId}" && status = "active"`,
        })
        if (vehicleInConvoy.length > 0) {
          throw new Error(
            'This vehicle is already in another active convoy. Leave that convoy first or use a different vehicle.',
          )
        }
      }
      await pb.collection('convoy_members').create({
        convoy: convoyId,
        user: pb.authStore.record?.id,
        vehicle: selectedVehicleId || undefined,
        role: 'member',
        status: 'active',
        joined_at: new Date().toISOString(),
      })
      navigate(`/map?convoy=${convoyId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join convoy')
      setJoinState('vehicle-select')
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow rounded-lg p-6 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Join Failed</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/convoy')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Go to Convoys
          </button>
        </div>
      </div>
    )
  }

  if (joinState === 'vehicle-select') {
    const isTrekker = convoyType === 'trekker'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow rounded-lg p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">Join Convoy</h1>
          {convoyName && (
            <p className="text-sm text-gray-500 text-center mb-4">
              {isTrekker ? '🥾' : '🚗'} {convoyName}
            </p>
          )}
          {isTrekker ? (
            <p className="text-sm text-gray-500 text-center mb-4">
              Trekking convoy — no vehicle needed.
            </p>
          ) : vehicles.length === 0 ? (
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-4">You need a vehicle to join a convoy.</p>
              <button
                onClick={() => navigate('/profile')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Add Vehicle
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select your vehicle
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
            </div>
          )}
          <button
            onClick={handleJoin}
            disabled={!isTrekker && !selectedVehicleId}
            className="mt-4 w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTrekker ? 'Join as Trekker' : 'Join with Selected Vehicle'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-gray-600">
          {joinState === 'joining' ? 'Joining convoy...' : 'Loading...'}
        </p>
      </div>
    </div>
  )
}

export default JoinPage
