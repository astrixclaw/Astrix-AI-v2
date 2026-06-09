import React, { useState } from 'react'
import { useSmartHome } from '@hooks/useSmartHome'
import toast from 'react-hot-toast'
import { FiLoader, FiPower } from 'react-icons/fi'
import { motion } from 'framer-motion'
import type { HueLight } from '@types/index'

export function SmartHome() {
  const { hueLights, isLoading, error, controlLight } = useSmartHome()
  const [selectedLight, setSelectedLight] = useState<string | null>(null)

  const handleToggleLight = async (light: HueLight) => {
    const success = await controlLight(light.id, { on: !light.state.on })
    if (success) {
      toast.success(`Light ${light.state.on ? 'turned off' : 'turned on'}`)
    } else {
      toast.error('Failed to control light')
    }
  }

  const handleBrightness = async (light: HueLight, brightness: number) => {
    const success = await controlLight(light.id, { bri: brightness })
    if (success) {
      toast.success(`Brightness set to ${Math.round((brightness / 254) * 100)}%`)
    }
  }

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
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.3 },
    },
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-2"
      >
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-primary">
          Smart Home Control
        </h1>
        <p className="text-gray-400">Manage your Hue lights and smart devices</p>
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-200"
        >
          {error}
        </motion.div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <FiLoader className="animate-spin text-purple-400 mr-2" size={24} />
          <span className="text-gray-300">Loading devices...</span>
        </div>
      )}

      {/* Lights Grid */}
      {!isLoading && hueLights.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {hueLights.map((light) => (
            <motion.div
              key={light.id}
              variants={itemVariants}
              onClick={() => setSelectedLight(light.id)}
              className={`bg-gradient-subtle border transition-all cursor-pointer rounded-xl p-6 ${
                selectedLight === light.id
                  ? 'border-purple-500/60 shadow-lg shadow-purple-500/20'
                  : 'border-purple-500/30 hover:border-purple-500/50'
              }`}
            >
              {/* Light Status */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all ${
                      light.state.on
                        ? 'bg-yellow-400/20 text-yellow-400'
                        : 'bg-gray-600/20 text-gray-400'
                    }`}
                  >
                    <span>💡</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{light.name}</h3>
                    <p className="text-xs text-gray-500">{light.type}</p>
                  </div>
                </div>

                {/* Power Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleLight(light)
                  }}
                  className={`p-2 rounded-lg transition-all ${
                    light.state.on
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-gray-600/20 text-gray-400 hover:bg-gray-600/30'
                  }`}
                >
                  <FiPower size={18} />
                </button>
              </div>

              {/* Brightness Control */}
              {light.state.on && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-400">Brightness</label>
                    <span className="text-sm font-medium text-purple-300">
                      {Math.round((light.state.bri / 254) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="254"
                    value={light.state.bri || 100}
                    onChange={(e) => handleBrightness(light, parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              )}

              {/* Status Indicator */}
              <div className="mt-4 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${light.state.on ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                <span className="text-xs text-gray-400">
                  {light.state.on ? 'On' : 'Off'}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Empty State */}
      {!isLoading && hueLights.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="w-20 h-20 bg-gradient-subtle rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
            <span className="text-4xl">💡</span>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No devices found</h3>
          <p className="text-gray-400 mb-6">
            Connect your Hue bridge and lights to get started
          </p>
          <button className="px-6 py-2 bg-gradient-primary text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all">
            Configure Hue Bridge
          </button>
        </motion.div>
      )}
    </div>
  )
}
