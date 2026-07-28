import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/map'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Please enter both email and password')
      return
    }

    setIsLoading(true)

    try {
      await login(email, password)
      navigate(redirectTo)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('Failed to authenticate')) {
        setError('Invalid email or password')
      } else if (message.includes('network')) {
        setError('Network error. Please check your connection.')
      } else {
        setError('Login failed. Please try again.')
      }
    } finally {
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
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-[var(--text2)]">
            Or{' '}
            <Link
              to="/register"
              className="font-medium text-[var(--primary)] hover:text-[var(--primary)] transition-colors"
            >
              create a new account
            </Link>
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
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
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
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field appearance-none relative block w-full px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent focus:z-10"
                placeholder="Password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <p className="text-xs text-center text-[var(--text2)]">
            Your session will be remembered until you sign out.
          </p>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
