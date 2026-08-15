import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import supabase from '../services/supabaseClient'
import { linkGoogleIdentity } from '../services/oauth'

function LinkAccountPage() {
  const [searchParams] = useSearchParams()
  const emailParam = searchParams.get('email') || ''
  const provider = searchParams.get('provider') || 'google'
  const redirect = searchParams.get('redirect') || '/'

  const [email, setEmail] = useState(emailParam)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const providerLabel = provider === 'google' ? 'Google' : provider

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Please enter both email and password')
      return
    }

    setIsLoading(true)

    try {
      await login(email.trim(), password)

      // If Google is already linked, just continue to the destination.
      const { data } = await supabase.auth.getUserIdentities()
      const alreadyLinked = (data?.identities ?? []).some((i) => i.provider === provider)
      if (alreadyLinked) {
        navigate(redirect, { replace: true })
        return
      }

      await linkGoogleIdentity(redirect)
      // linkIdentity performs a full OAuth redirect; nothing to do after.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (
        message.includes('Invalid login credentials') ||
        message.includes('Failed to authenticate')
      ) {
        setError('Invalid email or password. Please verify your account password.')
      } else if (message.includes('Email not confirmed')) {
        setError('Please confirm your email address before connecting your account.')
      } else if (message.includes('already linked')) {
        navigate(redirect, { replace: true })
      } else {
        setError('Could not connect your account. Please try again.')
      }
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--bg)]">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center mb-4">
            <img src="/icons/icon.svg" alt="Convoy" className="h-16 w-16" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-[var(--text)]">
            Connect your account
          </h2>
          <p className="mt-3 text-center text-sm text-[var(--text2)]">
            An account with this email already exists. Sign in with your password to connect your{' '}
            {providerLabel} account — you'll then be able to sign in with either method.
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="error-banner rounded-xl p-4">
              <div className="text-sm text-[var(--error-text)]">{error}</div>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label htmlFor="link-email" className="sr-only">
                Email address
              </label>
              <input
                id="link-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field appearance-none relative block w-full px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent focus:z-10"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="link-password" className="sr-only">
                Password
              </label>
              <input
                id="link-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field appearance-none relative block w-full px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent focus:z-10"
                placeholder="Your account password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Connecting…' : 'Connect Google account'}
            </button>
          </div>

          <p className="text-xs text-center text-[var(--text2)]">
            Prefer not to connect?{' '}
            <Link
              to={`/login?redirect=${encodeURIComponent(redirect)}`}
              className="font-medium text-[var(--primary)] hover:text-[var(--primary)] transition-colors"
            >
              Sign in with email instead
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default LinkAccountPage
