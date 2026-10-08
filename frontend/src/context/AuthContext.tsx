import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, clearTokens, getToken, setTokens } from '../services/api'
import type { AuthTokens, AuthUser } from '../types'

interface AuthContextValue {
  isAuthenticated: boolean
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !!getToken(),
  )
  const [user, setUser] = useState<AuthUser | null>(null)

  // Fetch /api/auth/me/ whenever we become authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setUser(null)
      return
    }
    api.get<AuthUser>('/auth/me/').then(setUser).catch(() => {
      // Token may be expired; clean up silently
      clearTokens()
      setIsAuthenticated(false)
      setUser(null)
    })
  }, [isAuthenticated])

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api.post<AuthTokens>('/auth/token/', { email, password })
    setTokens(tokens.access, tokens.refresh)
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    clearTokens()
    setIsAuthenticated(false)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ isAuthenticated, user, login, logout }),
    [isAuthenticated, user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
