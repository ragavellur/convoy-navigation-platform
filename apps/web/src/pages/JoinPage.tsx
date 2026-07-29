import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import pb from '../services/pocketbase'
import SearchBar from '../components/SearchBar'
import { parseDeepLink, validateConvoyCode } from '../services/deepLink'
import type { SearchResult } from '../types'

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
  const [joinSourceLat, setJoinSourceLat] = useState<number | null>(null)
  const [joinSourceLng, setJoinSourceLng] = useState<number | null>(null)
  const [joinSourceName, setJoinSourceName] = useState('')
  const [showJoinSearch, setShowJoinSearch] = useState(false)
  const [gettingJoinLocation, setGettingJoinLocation] = useState(false)
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
        join_lat: joinSourceLat,
        join_lng: joinSourceLng,
        join_name: joinSourceName || undefined,
      })
      navigate(`/map?convoy=${convoyId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join convoy')
      setJoinState('vehicle-select')
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="max-w-md w-full bg-[var(--card)] shadow rounded-lg p-6 text-center">
          <h1 className="text-xl font-bold text-[var(--text)] mb-2">Join Failed</h1>
          <p className="text-[var(--text2)] mb-4">{error}</p>
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
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="max-w-md w-full bg-[var(--card)] shadow rounded-lg p-6">
          <h1 className="text-xl font-bold text-[var(--text)] mb-2 text-center">Join Convoy</h1>
          {convoyName && (
            <p className="text-sm text-[var(--text2)] text-center mb-4">
              {isTrekker ? '🥾' : '🚗'} {convoyName}
            </p>
          )}
          {isTrekker ? (
            <p className="text-sm text-[var(--text2)] text-center mb-4">
              Trekking convoy — no vehicle needed.
            </p>
          ) : vehicles.length === 0 ? (
            <div className="text-center">
              <p className="text-sm text-[var(--text2)] mb-4">
                You need a vehicle to join a convoy.
              </p>
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
                <label className="block text-sm font-medium text-[var(--text)] mb-1">
                  Select your vehicle
                </label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full border border-[var(--input-border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
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
          <div>
            <label className="block text-xs font-medium text-[var(--text2)] mb-1">
              Your Starting Point
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setGettingJoinLocation(true)
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      setJoinSourceLat(pos.coords.latitude)
                      setJoinSourceLng(pos.coords.longitude)
                      setJoinSourceName('Current location')
                      setShowJoinSearch(false)
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
                  !showJoinSearch && joinSourceLat
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
                  showJoinSearch
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
                    setShowJoinSearch(false)
                  }}
                />
              </div>
            )}
            {joinSourceName && !showJoinSearch && (
              <p className="text-xs text-[var(--text2)] mt-1">{joinSourceName}</p>
            )}
          </div>
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="max-w-md w-full bg-[var(--card)] shadow rounded-lg p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)] mx-auto mb-4" />
        <p className="text-[var(--text2)]">
          {joinState === 'joining' ? 'Joining convoy...' : 'Loading...'}
        </p>
      </div>
    </div>
  )
}

export default JoinPage
