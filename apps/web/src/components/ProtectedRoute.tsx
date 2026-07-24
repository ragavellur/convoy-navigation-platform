import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ReactNode } from 'react'
import pb from '../services/pocketbase'

interface ProtectedRouteProps {
  children: ReactNode
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, refreshSession } = useAuth()

  useEffect(() => {
    if (isAuthenticated) {
      refreshSession()
    }
  }, [isAuthenticated, refreshSession])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    )
  }

  const storeValid = pb.authStore.isValid

  if (!isAuthenticated || !storeValid) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
