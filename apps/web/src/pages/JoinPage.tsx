import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import pb from '../services/pocketbase'
import { parseDeepLink, validateConvoyCode } from '../services/deepLink'

function JoinPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const handleJoin = async () => {
      const urlParams = new URLSearchParams(searchParams.toString())
      const url = `/join?${urlParams.toString()}`
      const data = parseDeepLink(url)

      if (!data || !validateConvoyCode(data.code)) {
        setError('Invalid deep link. Please check the convoy code.')
        return
      }

      if (!pb.authStore.isValid) {
        navigate(`/login?redirect=/join?code=${data.code}`)
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
        const existing = await pb.collection('convoy_members').getFullList({
          filter: `convoy = "${convoy.id}" && user = "${pb.authStore.record?.id}" && status = "active"`,
        })

        if (existing.length === 0) {
          await pb.collection('convoy_members').create({
            convoy: convoy.id,
            user: pb.authStore.record?.id,
            role: 'member',
            status: 'active',
          })
        }

        navigate(`/map?convoy=${convoy.id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join convoy')
      }
    }

    handleJoin()
  }, [searchParams, navigate])

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-gray-600">Joining convoy...</p>
      </div>
    </div>
  )
}

export default JoinPage
