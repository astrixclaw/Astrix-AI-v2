import React, { useState, useEffect } from 'react'
import { apiClient } from '@api/client'
import toast from 'react-hot-toast'
import { FiTrash2, FiEdit2, FiPlus, FiLoader } from 'react-icons/fi'
import { motion } from 'framer-motion'
import type { User } from '@types/index'

export function Admin() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showNewUserForm, setShowNewUserForm] = useState(false)
  const [formData, setFormData] = useState({ username: '', email: '', password: '', role: 'user' })

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setIsLoading(true)
    try {
      const response = await apiClient.getUsers()
      if (response.success && response.data) {
        setUsers(response.data)
      }
    } catch (error: any) {
      toast.error('Failed to fetch users')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await apiClient.register(formData.username, formData.email, formData.password)
      if (response.success) {
        toast.success('User created successfully')
        setFormData({ username: '', email: '', password: '', role: 'user' })
        setShowNewUserForm(false)
        fetchUsers()
      }
    } catch (error: any) {
      toast.error('Failed to create user')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        await apiClient.deleteUser(userId)
        toast.success('User deleted')
        fetchUsers()
      } catch (error: any) {
        toast.error('Failed to delete user')
      }
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between"
      >
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-primary">
            Admin Panel
          </h1>
          <p className="text-gray-400">Manage users and system permissions</p>
        </div>
        <button
          onClick={() => setShowNewUserForm(!showNewUserForm)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all"
        >
          <FiPlus size={18} />
          New User
        </button>
      </motion.div>

      {/* New User Form */}
      {showNewUserForm && (
        <motion.form
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleCreateUser}
          className="bg-gradient-subtle border border-purple-500/30 rounded-xl p-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              className="px-6 py-2 bg-gradient-primary text-white rounded-lg font-semibold hover:shadow-lg transition-all"
            >
              Create User
            </button>
            <button
              type="button"
              onClick={() => setShowNewUserForm(false)}
              className="px-6 py-2 bg-white/10 text-white rounded-lg font-semibold hover:bg-white/20 transition-all"
            >
              Cancel
            </button>
          </div>
        </motion.form>
      )}

      {/* Users Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <FiLoader className="animate-spin text-purple-400 mr-2" size={24} />
          <span className="text-gray-300">Loading users...</span>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-subtle border border-purple-500/30 rounded-xl overflow-hidden"
        >
          <table className="w-full">
            <thead className="bg-black/40 border-b border-purple-500/20">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Username</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Email</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Role</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Created</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-white font-medium">{user.username}</td>
                  <td className="px-6 py-4 text-gray-400 text-sm">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      user.role === 'admin'
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-sm">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        className="p-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors"
                        title="Edit"
                      >
                        <FiEdit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                        title="Delete"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <div className="bg-gradient-subtle border border-purple-500/30 rounded-xl p-6">
          <p className="text-gray-400 text-sm mb-2">Total Users</p>
          <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-primary">{users.length}</p>
        </div>
        <div className="bg-gradient-subtle border border-purple-500/30 rounded-xl p-6">
          <p className="text-gray-400 text-sm mb-2">Admins</p>
          <p className="text-3xl font-bold text-purple-400">{users.filter((u) => u.role === 'admin').length}</p>
        </div>
        <div className="bg-gradient-subtle border border-purple-500/30 rounded-xl p-6">
          <p className="text-gray-400 text-sm mb-2">Regular Users</p>
          <p className="text-3xl font-bold text-blue-400">{users.filter((u) => u.role === 'user').length}</p>
        </div>
      </motion.div>
    </div>
  )
}
