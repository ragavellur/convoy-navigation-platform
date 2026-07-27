import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function HomePage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white sm:text-5xl md:text-6xl">
          Convoy Navigation Platform
        </h1>
        <p className="mt-3 max-w-md mx-auto text-base text-slate-400 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
          Real-time navigation and communication for convoy operations. Track vehicles, share
          locations, and stay connected.
        </p>
        <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
          {isAuthenticated ? (
            <div>
              <Link
                to="/map"
                className="w-full flex items-center justify-center px-8 py-3 text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 md:py-4 md:text-lg md:px-10 transition-colors"
              >
                Open Map
              </Link>
            </div>
          ) : (
            <div className="sm:flex sm:space-x-4">
              <Link
                to="/register"
                className="w-full flex items-center justify-center px-8 py-3 text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 md:py-4 md:text-lg md:px-10 transition-colors"
              >
                Get Started
              </Link>
              <div className="mt-3 sm:mt-0">
                <Link
                  to="/login"
                  className="w-full flex items-center justify-center px-8 py-3 text-base font-medium rounded-lg text-indigo-400 transition-colors md:py-4 md:text-lg md:px-10 whitespace-nowrap"
                  style={{ border: '2px solid rgba(99, 102, 241, 0.6)' }}
                >
                  Sign In
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default HomePage
