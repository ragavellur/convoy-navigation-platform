import { useEffect, useState, useCallback, ReactNode } from 'react'
import { User } from '../types'
import pb from '../services/pocketbase'
import { AuthContext, AuthContextType } from './AuthContext'

function getInitialUser(): User | null {
  if (pb.authStore.isValid && pb.authStore.record) {
    return pb.authStore.record as unknown as User
  }
  return null
}

function clearAuthStorage() {
  localStorage.removeItem('pocketbase_auth')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getInitialUser)
  const [isLoading] = useState(false)

  const syncUser = useCallback(() => {
    if (pb.authStore.isValid && pb.authStore.record) {
      setUser(pb.authStore.record as unknown as User)
    } else {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    const handleStorage = () => {
      syncUser()
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('popstate', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('popstate', handleStorage)
    }
  }, [syncUser])

  const login = async (email: string, password: string) => {
    const authData = await pb.collection('users').authWithPassword(email, password)
    setUser(authData.record as unknown as User)
  }

  const register = async (email: string, password: string, name: string) => {
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name,
      role: 'member',
      status: 'active',
    })
    await login(email, password)
  }

  const logout = useCallback(() => {
    pb.authStore.clear()
    clearAuthStorage()
    setUser(null)
  }, [])

  const refreshSession = async (): Promise<boolean> => {
    if (!pb.authStore.isValid) {
      return false
    }
    try {
      await pb.collection('users').authRefresh()
      return true
    } catch {
      pb.authStore.clear()
      clearAuthStorage()
      setUser(null)
      return false
    }
  }

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    refreshSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
