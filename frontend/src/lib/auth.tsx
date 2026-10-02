import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ApiError, get, setUnauthorizedHandler, tokens } from './api'
import type { User } from './types'

interface AuthState {
  user: User | null
  ready: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  const logout = useCallback(() => {
    tokens.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    if (!tokens.access) {
      setReady(true)
      return
    }
    get<User>('/auth/me/')
      .then(setUser)
      .catch(() => tokens.clear())
      .finally(() => setReady(true))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const r = await fetch('/api/auth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!r.ok) throw new ApiError(r.status, r.status === 401 ? 'Incorrect username or password.' : 'Could not sign in.')
    const data = await r.json()
    tokens.save(data.access, data.refresh)
    setUser(await get<User>('/auth/me/'))
  }, [])

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
