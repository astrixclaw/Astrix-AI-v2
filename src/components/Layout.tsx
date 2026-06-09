import React from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { FiLogOut, FiMenu, FiX } from 'react-icons/fi'
import { useState } from 'react'

export function Layout() {
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
  }

  if (!isAuthenticated || !user) {
    return <Outlet />
  }

  const navItems = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Chat', path: '/chat' },
    { label: 'Group Chat', path: '/group-chat' },
    { label: 'Smart Home', path: '/smart-home' },
    { label: 'Security', path: '/security' },
    ...(user.role === 'admin' ? [{ label: 'Admin', path: '/admin' }] : []),
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-gradient-dark border-b border-purple-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <img 
              src="/astrix-logo.svg" 
              alt="Astrix AI Logo" 
              className="w-10 h-10 group-hover:scale-105 transition-transform drop-shadow-lg"
            />
            <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-primary">Astrix AI</h1>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex gap-6">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="text-gray-300 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-white font-medium text-sm">{user.username}</p>
              <p className="text-gray-400 text-xs uppercase">{user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-gray-300 hover:text-white"
              title="Logout"
            >
              <FiLogOut size={20} />
            </button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-gray-300 hover:text-white"
            >
              {menuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {menuOpen && (
          <nav className="md:hidden bg-black/40 border-t border-purple-500/20 px-4 py-4 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className="block text-gray-300 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-purple-500/20 mt-16 py-8 bg-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400 text-sm">
          <p>Astrix AI v2.0 • Built with React + Electron + Tailwind CSS</p>
        </div>
      </footer>
    </div>
  )
}
