import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On app startup: check if there's a SESSION token (cleared on browser/tab close)
  // SECURITY: sessionStorage is never persisted to disk — token dies with the tab
  useEffect(() => {
    const token = sessionStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    authAPI.me()
      .then(res => setUser(res.data))
      .catch(() => sessionStorage.removeItem('token'))  // expired — clear it
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const res = await authAPI.login(email, password)
    // Store in sessionStorage — clears automatically when browser/tab is closed
    sessionStorage.setItem('token', res.data.access_token)
    const meRes = await authAPI.me()
    setUser(meRes.data)
  }

  async function register(name, email, password) {
    // Register returns 202 Accepted with { status: "pending" }
    // NOT a JWT — user cannot log in until admin approves
    const res = await authAPI.register(name, email, password)
    return res.data  // caller handles the pending state UI
  }

  function logout() {
    sessionStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

