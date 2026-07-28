import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const validateForm = (): string | null => {
    if (!name.trim()) return 'Name is required'
    if (!email.trim()) return 'Email is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email format'
    if (password.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter'
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter'
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number'
    if (password !== confirmPassword) return 'Passwords do not match'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsLoading(true)

    try {
      await register(email, password, name.trim())
      navigate('/map')
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Registration failed. Email may already be in use.'
      if (message.includes('already')) {
        setError('An account with this email already exists.')
      } else {
        setError(message || 'Registration failed. Please try again.')
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
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-[var(--text2)]">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-[var(--primary)] hover:text-[var(--primary)] transition-colors"
            >
              Sign in
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
              <label htmlFor="name" className="sr-only">
                Full name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field appearance-none relative block w-full px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent focus:z-10"
                placeholder="Full name"
              />
            </div>
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
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field appearance-none relative block w-full px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent focus:z-10"
                placeholder="Password (min 8 chars, uppercase, lowercase, number)"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field appearance-none relative block w-full px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent focus:z-10"
                placeholder="Confirm password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RegisterPage
