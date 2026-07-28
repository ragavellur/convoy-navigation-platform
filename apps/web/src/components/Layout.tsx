import { useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../stores/ThemeContext'
import { useSWUpdate } from '../hooks/useSWUpdate'
import { usePwaInstall } from '../hooks/usePwaInstall'
import RosterSidebar from './RosterSidebar'

function Layout() {
  const { isAuthenticated, user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { showUpdate, offlineReady, dismiss: dismissUpdate, applyUpdate } = useSWUpdate()
  const { canInstall, promptInstall, dismiss: dismissInstall } = usePwaInstall()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true)

  const handleLogout = () => {
    logout()
    navigate('/login')
    setIsMobileMenuOpen(false)
  }

  const navLinks = isAuthenticated
    ? [
        { to: '/map', label: 'Map' },
        { to: '/convoy', label: 'Convoy' },
        { to: '/profile', label: 'Profile' },
      ]
    : []

  const isMapPage = location.pathname === '/map'

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <nav
        className="sticky top-0 z-50 border-b overflow-visible"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--nav-bg)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20">
            <div className="flex items-center">
              <Link to="/" className="flex-shrink-0 flex items-center gap-3 h-16">
                <img
                  src="/icons/logo.png"
                  alt="Convoy"
                  className="object-contain rounded-lg"
                  style={{ width: 50, height: 60 }}
                />
                <div className="flex flex-col justify-center">
                  <span className="text-2xl font-bold text-[var(--text)] leading-none">Convoy</span>
                  <span className="text-[10px] font-medium text-[var(--text2)] tracking-widest mt-1">
                    Stay Together. Drive Smarter.
                  </span>
                </div>
              </Link>
              <div className="hidden md:ml-6 md:flex md:space-x-8">
                <Link
                  to="/"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-[var(--text2)] hover:text-[var(--text)]"
                >
                  Home
                </Link>
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                      location.pathname === link.to
                        ? 'text-indigo-400 border-b-2 border-indigo-400'
                        : 'text-[var(--text2)] hover:text-[var(--text)]'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="hidden md:flex md:items-center md:space-x-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                )}
              </button>
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-[var(--text2)]">{user?.name || user?.email}</span>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-sm font-medium text-[var(--text2)] hover:text-[var(--text)] transition-colors"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
            <div className="flex items-center md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-lg text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
        {isMobileMenuOpen && (
          <div
            className="md:hidden border-t"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--nav-bg-solid)',
              backdropFilter: 'blur(40px)',
            }}
          >
            <div className="px-2 pt-2 pb-3 space-y-1">
              <Link
                to="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
              >
                Home
              </Link>
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-lg text-base font-medium ${
                    location.pathname === link.to
                      ? 'text-indigo-400 bg-indigo-500/10'
                      : 'text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface)]'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="border-t px-4 py-3 border-[var(--border)]">
              {isAuthenticated ? (
                <div className="space-y-2">
                  <p className="text-sm text-[var(--text2)]">{user?.name || user?.email}</p>
                  <button
                    onClick={toggleTheme}
                    className="w-full text-left px-3 py-2 rounded-lg text-base font-medium text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
                  >
                    {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 rounded-lg text-base font-medium text-red-400 hover:bg-red-500/10"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-base font-medium text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-base font-medium text-indigo-400 hover:bg-indigo-500/10"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {isMapPage && isAuthenticated ? (
        <div className="flex-1 flex">
          <RosterSidebar
            isExpanded={isSidebarExpanded}
            onToggle={() => setIsSidebarExpanded(!isSidebarExpanded)}
          />
          <main className="flex-1 min-h-0">
            <Outlet />
          </main>
        </div>
      ) : (
        <main className="flex-1 pb-16 md:pb-0">
          <Outlet />
        </main>
      )}

      {isAuthenticated && (
        <nav
          className="fixed bottom-0 left-0 right-0 md:hidden z-50 border-t"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--nav-bg-solid)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
          }}
        >
          <div className="flex justify-around">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.to
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex flex-col items-center py-2 px-3 ${
                    isActive ? 'text-indigo-400' : 'text-[var(--text2)] opacity-70'
                  }`}
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {link.to === '/map' && (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                      />
                    )}
                    {link.to === '/convoy' && (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    )}
                    {link.to === '/profile' && (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    )}
                  </svg>
                  <span className="text-xs mt-1">{link.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      )}

      {(showUpdate || offlineReady) && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm"
          style={{
            background: 'var(--toast-bg)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--primary-border-strong)',
          }}
        >
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text)]">
              {offlineReady ? 'App ready for offline use' : 'New version available'}
            </p>
            <p className="text-xs text-[var(--text2)] mt-0.5">
              {offlineReady
                ? 'You can use Convoy without internet.'
                : 'Refresh to get the latest updates.'}
            </p>
          </div>
          {showUpdate && (
            <button
              onClick={applyUpdate}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors whitespace-nowrap"
            >
              Refresh
            </button>
          )}
          <button
            onClick={dismissUpdate}
            className="p-1 text-[var(--text2)] hover:text-[var(--text)] transition-colors"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {canInstall && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm"
          style={{
            background: 'var(--toast-bg)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--success-border-light)',
          }}
        >
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text)]">Install Convoy</p>
            <p className="text-xs text-[var(--text2)] mt-0.5">
              Add to home screen for quick access.
            </p>
          </div>
          <button
            onClick={promptInstall}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-emerald-600 hover:bg-emerald-500 transition-colors whitespace-nowrap"
          >
            Install
          </button>
          <button
            onClick={dismissInstall}
            className="p-1 text-[var(--text2)] hover:text-[var(--text)] transition-colors"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export default Layout
