import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { resolveShareToken } from '../services/shareLocation'

type ShareState = 'loading' | 'inactive' | 'redirecting'

function SharePage() {
  const { token } = useParams<{ token: string }>()
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<ShareState>('loading')

  const noToken = !isLoading && isAuthenticated && !token
  const displayState = noToken ? 'inactive' : state

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/s/${token ?? ''}`)}`)
      return
    }

    if (!token) return

    let cancelled = false
    resolveShareToken(token)
      .then((resolved) => {
        if (cancelled) return
        if (!resolved) {
          setState('inactive')
          return
        }
        setState('redirecting')
        navigate(`/map?convoy=${resolved.convoy}`, { replace: true })
      })
      .catch(() => {
        if (!cancelled) setState('inactive')
      })

    return () => {
      cancelled = true
    }
  }, [isLoading, isAuthenticated, token, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--bg)]">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="flex justify-center">
          <img src="/icons/icon.svg" alt="Convoy" className="h-16 w-16" />
        </div>

        {displayState === 'loading' && (
          <div className="text-sm text-[var(--text2)]">Checking share link…</div>
        )}

        {displayState === 'redirecting' && (
          <div className="text-sm text-[var(--text2)]">Taking you to the live map…</div>
        )}

        {displayState === 'inactive' && (
          <>
            <h2 className="text-2xl font-bold text-[var(--text)]">Link inactive</h2>
            <p className="text-sm text-[var(--text2)]">
              This share link is no longer active. The owner may have revoked it, or the link is
              invalid.
            </p>
            <Link
              to="/"
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
            >
              Go to Home
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default SharePage
