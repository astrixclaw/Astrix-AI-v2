import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@api/client'
import type { User, AuthState } from '@types/index'

export function useAuth() {
  const navigate = useNavigate()
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  })

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedToken = localStorage.getItem('auth_token')
        const storedUser = localStorage.getItem('auth_user')

        if (storedToken && storedUser) {
          apiClient.setToken(storedToken)
          const user = JSON.parse(storedUser)
          setAuthState({
            user,
            token: storedToken,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
        } else {
          setAuthState((prev) => ({ ...prev, isLoading: false }))
        }
      } catch (error) {
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Failed to initialize auth',
        }))
      }
    }

    initAuth()
  }, [])

  const login = useCallback(
    async (username: string, password: string) => {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }))
      try {
        const response = await apiClient.login(username, password)
        if (response.success && response.data) {
          const { user, token } = response.data
          apiClient.setToken(token)
          localStorage.setItem('auth_token', token)
          localStorage.setItem('auth_user', JSON.stringify(user))

          setAuthState({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
          navigate('/dashboard')
          return true
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.error || 'Login failed'
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }))
      }
      return false
    },
    [navigate]
  )

  const logout = useCallback(async () => {
    try {
      await apiClient.logout()
    } catch (error) {
      console.error('Logout request failed:', error)
    }

    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    setAuthState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    })
    navigate('/login')
  }, [navigate])

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }))
      try {
        const response = await apiClient.register(username, email, password)
        if (response.success) {
          navigate('/login')
          return true
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.error || 'Registration failed'
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }))
      }
      return false
    },
    [navigate]
  )

  return {
    ...authState,
    login,
    logout,
    register,
  }
}
