import { useState, useCallback, useEffect } from 'react'
import { apiClient } from '@api/client'
import type { SmartHomeDevice, HueLight } from '@types/index'

export function useSmartHome() {
  const [devices, setDevices] = useState<SmartHomeDevice[]>([])
  const [hueLights, setHueLights] = useState<HueLight[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDevices = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await apiClient.getSmartHomeDevices()
      if (response.success && response.data) {
        setDevices(response.data)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch devices')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchHueLights = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await apiClient.getHueLights()
      if (response.success && response.data) {
        setHueLights(response.data)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch Hue lights')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const controlLight = useCallback(
    async (lightId: string, state: Record<string, unknown>) => {
      try {
        await apiClient.controlHueLight(lightId, state)
        // Update local state optimistically
        setHueLights((prev) =>
          prev.map((light) => (light.id === lightId ? { ...light, state: { ...light.state, ...state } } : light))
        )
        return true
      } catch (err: any) {
        setError(err.message || 'Failed to control light')
        return false
      }
    },
    []
  )

  const controlDevice = useCallback(
    async (deviceId: string, action: Record<string, unknown>) => {
      try {
        await apiClient.controlDevice(deviceId, action)
        return true
      } catch (err: any) {
        setError(err.message || 'Failed to control device')
        return false
      }
    },
    []
  )

  const activateScene = useCallback(async (sceneId: string) => {
    try {
      await apiClient.activateHueScene(sceneId)
      return true
    } catch (err: any) {
      setError(err.message || 'Failed to activate scene')
      return false
    }
  }, [])

  useEffect(() => {
    fetchDevices()
    fetchHueLights()
  }, [fetchDevices, fetchHueLights])

  return {
    devices,
    hueLights,
    isLoading,
    error,
    fetchDevices,
    fetchHueLights,
    controlLight,
    controlDevice,
    activateScene,
  }
}
