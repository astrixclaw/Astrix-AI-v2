import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { FiMessageSquare, FiSmartphone, FiSettings, FiUsers } from 'react-icons/fi'
import { motion } from 'framer-motion'

export function Dashboard() {
  const { user } = useAuth()

  const cards = [
    {
      title: 'Chat with AI',
      description: 'Communicate with your AI assistant through text or voice',
      icon: FiMessageSquare,
      color: 'from-blue-500 to-cyan-500',
      path: '/chat',
    },
    {
      title: 'Smart Home',
      description: 'Control your Hue lights and smart devices',
      icon: FiSmartphone,
      color: 'from-purple-500 to-pink-500',
      path: '/smart-home',
    },
    {
      title: 'Settings',
      description: 'Configure your preferences and integrations',
      icon: FiSettings,
      color: 'from-orange-500 to-red-500',
      path: '/settings',
    },
    ...(user?.role === 'admin'
      ? [
          {
            title: 'Admin Panel',
            description: 'Manage users and system settings',
            icon: FiUsers,
            color: 'from-green-500 to-emerald-500',
            path: '/admin',
          },
        ]
      : []),
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4 },
    },
  }

  return (
    <div className="space-y-12">
      {/* Welcome Section with Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-4">
          <img 
            src="/astrix-logo.svg" 
            alt="Astrix AI Logo" 
            className="w-12 h-12 drop-shadow-lg"
          />
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-primary">
              Welcome back, {user?.username}!
            </h1>
            <p className="text-gray-400 text-lg">
              Your intelligent assistant is ready to help. Choose what you'd like to do.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <div className="bg-gradient-subtle border border-purple-500/30 rounded-xl p-6 backdrop-blur-sm">
          <p className="text-gray-400 text-sm font-medium mb-2">Role</p>
          <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-primary capitalize">{user?.role}</p>
        </div>
        <div className="bg-gradient-subtle border border-purple-500/30 rounded-xl p-6 backdrop-blur-sm">
          <p className="text-gray-400 text-sm font-medium mb-2">Status</p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <p className="text-2xl font-bold text-green-400">Online</p>
          </div>
        </div>
        <div className="bg-gradient-subtle border border-purple-500/30 rounded-xl p-6 backdrop-blur-sm">
          <p className="text-gray-400 text-sm font-medium mb-2">Version</p>
          <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-primary">v2.0</p>
        </div>
      </motion.div>

      {/* Feature Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <motion.div key={card.path} variants={itemVariants}>
              <Link
                to={card.path}
                className="block h-full bg-gradient-subtle border border-purple-500/30 rounded-xl p-8 hover:border-purple-500/60 transition-all hover:shadow-lg hover:shadow-purple-500/20 group backdrop-blur-sm"
              >
                <div className={`w-14 h-14 bg-gradient-to-br ${card.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="text-white" size={24} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{card.title}</h3>
                <p className="text-gray-400 text-sm mb-4">{card.description}</p>
                <div className="flex items-center gap-2 text-purple-400 text-sm font-medium group-hover:gap-3 transition-all">
                  <span>Get started</span>
                  <span>→</span>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Info Box */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6"
      >
        <p className="text-blue-200">
          💡 <strong>Pro tip:</strong> You can use voice commands in the Chat interface to interact hands-free with your AI assistant.
        </p>
      </motion.div>
    </div>
  )
}
