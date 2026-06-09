import React, { useState } from 'react'
import { FiCamera, FiPlus, FiTrash2, FiSettings, FiLoader } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import type { SmartHomeDevice } from '@types/index'

interface Camera extends SmartHomeDevice {
  rtspUrl?: string
  resolution?: string
  fps?: number
  status?: 'online' | 'offline'
}

export function Security() {
  const [cameras, setCameras] = useState<Camera[]>([
    {
      id: '1',
      name: 'Front Door',
      type: 'camera',
      state: { on: true },
      rtspUrl: 'rtsp://192.168.1.100:554/stream',
      resolution: '2560x1440',
      fps: 30,
      status: 'online',
    },
  ])

  const [showAddCamera, setShowAddCamera] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    rtspUrl: '',
    resolution: '1920x1080',
    fps: 30,
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleAddCamera = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.rtspUrl) {
      toast.error('Please fill in all fields')
      return
    }

    setIsLoading(true)
    try {
      const newCamera: Camera = {
        id: Math.random().toString(36).substr(2, 9),
        name: formData.name,
        type: 'camera',
        state: { on: true },
        rtspUrl: formData.rtspUrl,
        resolution: formData.resolution,
        fps: formData.fps,
        status: 'online',
      }

      setCameras([...cameras, newCamera])
      setFormData({ name: '', rtspUrl: '', resolution: '1920x1080', fps: 30 })
      setShowAddCamera(false)
      toast.success('Camera added successfully!')
    } catch (error) {
      toast.error('Failed to add camera')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteCamera = (id: string) => {
    setCameras(cameras.filter((c) => c.id !== id))
    toast.success('Camera removed')
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-primary">
            Security Cameras
          </h1>
          <p className="text-gray-400">Monitor your ZOSI DVR and IP cameras</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowAddCamera(!showAddCamera)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg transition-all"
        >
          <FiPlus size={20} />
          Add Camera
        </motion.button>
      </motion.div>

      {/* Add Camera Form */}
      {showAddCamera && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-xl p-6 space-y-4"
        >
          <h3 className="text-lg font-semibold text-white">Add New Camera</h3>
          <form onSubmit={handleAddCamera} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Camera Name */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">Camera Name</label>
                <input
                  type="text"
                  placeholder="e.g., Front Door, Backyard"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 outline-none transition"
                />
              </div>

              {/* Resolution */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">Resolution</label>
                <select
                  value={formData.resolution}
                  onChange={(e) => setFormData({ ...formData, resolution: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none transition"
                >
                  <option>1280x720</option>
                  <option>1920x1080</option>
                  <option>2560x1440</option>
                  <option>3840x2160</option>
                </select>
              </div>

              {/* RTSP URL */}
              <div className="col-span-2">
                <label className="block text-sm text-gray-300 mb-2">RTSP Stream URL</label>
                <input
                  type="text"
                  placeholder="rtsp://192.168.1.100:554/stream1"
                  value={formData.rtspUrl}
                  onChange={(e) => setFormData({ ...formData, rtspUrl: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 outline-none transition"
                />
                <p className="text-xs text-gray-400 mt-1">
                  For ZOSI DVR: rtsp://192.168.x.x:554/stream1 (channel 1-4)
                </p>
              </div>

              {/* FPS */}
              <div className="col-span-2">
                <label className="block text-sm text-gray-300 mb-2">Frame Rate (FPS)</label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={formData.fps}
                  onChange={(e) => setFormData({ ...formData, fps: parseInt(e.target.value) })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none transition"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
              >
                {isLoading ? 'Adding...' : 'Add Camera'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddCamera(false)}
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Cameras Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {cameras.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">
            <FiCamera size={48} className="mx-auto mb-4 opacity-50" />
            <p>No cameras added yet. Click "Add Camera" to get started!</p>
          </div>
        ) : (
          cameras.map((camera) => (
            <motion.div
              key={camera.id}
              variants={itemVariants}
              className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-xl p-6 hover:border-purple-500/50 transition-all group"
            >
              {/* Status Indicator */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FiCamera size={24} className="text-purple-400" />
                  <div>
                    <h3 className="text-white font-semibold">{camera.name}</h3>
                    <div className="flex items-center gap-1 mt-1">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          camera.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                      <span className="text-xs text-gray-400">{camera.status || 'online'}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteCamera(camera.id)}
                  className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition opacity-0 group-hover:opacity-100"
                >
                  <FiTrash2 size={18} />
                </button>
              </div>

              {/* Camera Preview (Placeholder) */}
              <div className="bg-black rounded-lg mb-4 h-32 flex items-center justify-center border border-gray-700">
                <div className="text-center">
                  <FiCamera size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-xs text-gray-500">Live Stream</p>
                </div>
              </div>

              {/* Camera Details */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-300">
                  <span className="text-gray-400">Resolution</span>
                  <span>{camera.resolution || '1920x1080'}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span className="text-gray-400">Frame Rate</span>
                  <span>{camera.fps || 30} FPS</span>
                </div>
                <div className="flex justify-between text-gray-300 text-xs break-all">
                  <span className="text-gray-400">Stream</span>
                  <span className="text-right">{camera.rtspUrl}</span>
                </div>
              </div>

              {/* Action Button */}
              <button className="w-full mt-4 px-3 py-2 bg-purple-600/20 border border-purple-500/50 text-purple-300 rounded-lg hover:bg-purple-600/30 transition flex items-center justify-center gap-2">
                <FiSettings size={16} />
                Configure
              </button>
            </motion.div>
          ))
        )}
      </motion.div>
    </div>
  )
}
