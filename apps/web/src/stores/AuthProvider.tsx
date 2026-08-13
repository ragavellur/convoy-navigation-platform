import { useEffect, useState, useCallback, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { User } from '../types'
import supabase from '../services/supabaseClient'
import { AuthContext, AuthContextType, RegisterResult } from './AuthContext'

/** Merge the Supabase session + profiles row into the app's User model. */
async function buildUser(session: Session | null): Promise<User | null> {
  if (!session) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, phone, role, status, avatar_url')
    .eq('id', session.user.id)
    .maybeSingle()

  const meta = session.user.user_metadata as Record<string, unknown>
  const fallbackName = session.user.email?.split('@')[0] || 'User'
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: profile?.name || (meta.name as string) || fallbackName,
    avatar: profile?.avatar_url || (meta.avatar as string) || undefined,
    phone: profile?.phone || (meta.phone as string) || undefined,
    role: (profile?.role || 'member') as 'admin' | 'member',
    status: (profile?.status || 'active') as 'active' | 'inactive' | 'banned',
    created: session.user.created_at,
    updated: session.user.last_sign_in_at || session.user.created_at,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const syncUser = useCallback(async (session: Session | null) => {
    setUser(await buildUser(session))
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      void syncUser(data.session).finally(() => setIsLoading(false))
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUser(session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [syncUser])

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await syncUser(data.session)
  }

  const register = async (
    email: string,
    password: string,
    name: string,
  ): Promise<RegisterResult> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: window.location.origin },
    })
    if (error) throw error
    if (!data.session) {
      return { requiresEmailConfirmation: true }
    }
    await syncUser(data.session)
    return { requiresEmailConfirmation: false }
  }

  const logout = useCallback(() => {
    void supabase.auth.signOut()
    setUser(null)
  }, [])

  const refreshSession = async (): Promise<boolean> => {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      setUser(null)
      return false
    }
    return true
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
