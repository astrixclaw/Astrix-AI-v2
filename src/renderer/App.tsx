import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Layout } from '@components/Layout'
import { Login } from '@components/Login'
import { Dashboard } from '@components/Dashboard'
import { Chat } from '@components/Chat'
import { GroupChat } from '@components/GroupChat'
import { SmartHome } from '@components/SmartHome'
import { Security } from '@components/Security'
import { Admin } from '@components/Admin'
import { useAuth } from '@hooks/useAuth'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto animate-spin">
            <div className="w-full h-full border-4 border-purple-500/30 border-t-purple-500 rounded-full" />
          </div>
          <p className="text-gray-300">Loading Astrix...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <Router>
      <Toaster
        position="bottom-right"
        toastOptions={{
          success: {
            style: {
              background: '#10b981',
              color: '#fff',
            },
          },
          error: {
            style: {
              background: '#ef4444',
              color: '#fff',
            },
          },
        }}
      />

      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="" element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="group-chat" element={<GroupChat />} />
          <Route path="smart-home" element={<SmartHome />} />
          <Route path="security" element={<Security />} />
          <Route path="admin" element={<Admin />} />
        </Route>

        {/* Catch All */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  )
}

export default App
