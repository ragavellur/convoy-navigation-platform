import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { withSentryReactRouterV6Routing } from '@sentry/react'
import { AuthProvider } from './stores/AuthProvider'
import { ConvoyRosterProvider } from './stores/ConvoyRosterContext'
import { ThemeProvider } from './stores/ThemeContext'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import LinkAccountPage from './pages/LinkAccountPage'
import SharePage from './pages/SharePage'
import MapPage from './pages/MapPage'
import ConvoyPage from './pages/ConvoyPage'
import ConvoyDetailPage from './pages/ConvoyDetailPage'
import JoinPage from './pages/JoinPage'
import ProfilePage from './pages/ProfilePage'
import NotFoundPage from './pages/NotFoundPage'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorFallback from './components/ErrorFallback'
import { ErrorBoundary } from '@sentry/react'

const SentryBrowserRouter = withSentryReactRouterV6Routing(BrowserRouter)

function App() {
  return (
    <ErrorBoundary fallback={ErrorFallback} showDialog={false}>
      <ThemeProvider>
        <SentryBrowserRouter>
          <AuthProvider>
            <ConvoyRosterProvider>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route path="login" element={<LoginPage />} />
                  <Route path="register" element={<RegisterPage />} />
                  <Route path="auth/callback" element={<AuthCallbackPage />} />
                  <Route path="link-account" element={<LinkAccountPage />} />
                  <Route path="s/:token" element={<SharePage />} />
                  <Route path="join" element={<JoinPage />} />
                  <Route
                    path="map"
                    element={
                      <ProtectedRoute>
                        <MapPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="convoy"
                    element={
                      <ProtectedRoute>
                        <ConvoyPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="convoy/:id"
                    element={
                      <ProtectedRoute>
                        <ConvoyDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="profile"
                    element={
                      <ProtectedRoute>
                        <ProfilePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </ConvoyRosterProvider>
          </AuthProvider>
        </SentryBrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
