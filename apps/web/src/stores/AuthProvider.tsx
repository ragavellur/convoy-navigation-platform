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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getInitialUser)

  const syncUser = useCallback(() => {
    if (pb.authStore.isValid && pb.authStore.record) {
      setUser(pb.authStore.record as unknown as User)
    } else {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange(() => {
      syncUser()
    })
    return () => unsubscribe()
  }, [syncUser])

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pocketbase_auth') {
        syncUser()
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
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
    })
    await login(email, password)
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
  }

  const refreshSession = async (): Promise<boolean> => {
    if (!pb.authStore.isValid) {
      return false
    }
    try {
      await pb.collection('users').authRefresh()
      return true
    } catch {
      pb.authStore.clear()
      setUser(null)
      return false
    }
  }

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading: false,
    login,
    register,
    logout,
    refreshSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
