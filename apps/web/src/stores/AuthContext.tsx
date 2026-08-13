import { createContext } from 'react'
import { User } from '../types'

export interface RegisterResult {
  requiresEmailConfirmation: boolean
}

export interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<RegisterResult>
  logout: () => void
  refreshSession: () => Promise<boolean>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
