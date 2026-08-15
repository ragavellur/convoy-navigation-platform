import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import supabase from '../services/supabaseClient'
import { mapOAuthError } from '../services/oauth'

function AuthCallbackPage() {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const handledRef = useRef(false)

  const redirect = searchParams.get('redirect') || '/'

  useEffect(() => {
    if (handledRef.current || isLoading) return

    const handle = async () => {
      handledRef.current = true

      if (user) {
        navigate(redirect, { replace: true })
        return
      }

      // No session — check whether Supabase rejected the OAuth identity.
      let code: string | null = null
      let message: string | null = null
      try {
        const { error } = await supabase.auth.getSession()
        if (error) {
          const normalized = mapOAuthError(error.code ?? null, error.message, null)
          code = normalized?.code ?? null
          message = normalized?.message ?? null
        }
      } catch {
        /* ignore */
      }

      const oauthError = mapOAuthError(code, message, new URL(window.location.href))

      if (oauthError?.code === 'user_already_exists') {
        const email = searchParams.get('email') || ''
        const params = new URLSearchParams()
        params.set('provider', 'google')
        if (email) params.set('email', email)
        params.set('redirect', redirect)
        navigate(`/link-account?${params.toString()}`, { replace: true })
        return
      }

      if (oauthError) {
        navigate(`/login?error=oauth&redirect=${encodeURIComponent(redirect)}`, { replace: true })
        return
      }

      navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true })
    }

    void handle()
  }, [isLoading, user, redirect, navigate, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="text-sm text-[var(--text2)]">Completing sign-in…</div>
    </div>
  )
}

export default AuthCallbackPage
