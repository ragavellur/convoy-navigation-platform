import { useEffect, useState, ReactNode } from 'react'
import { User } from '../types'
import pb from '../services/pocketbase'
import { AuthContext, AuthContextType } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      if (pb.authStore.isValid) {
        setUser(pb.authStore.record as unknown as User)
      }
      setIsLoading(false)
    }
    initAuth()

    const unsubscribe = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        setUser(pb.authStore.record as unknown as User)
      } else {
        setUser(null)
      }
    })

    return () => unsubscribe()
  }, [])

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

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
