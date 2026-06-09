import axios, { AxiosInstance, AxiosError } from 'axios'
import type { ApiResponse } from '@types/index'

class ApiClient {
  private instance: AxiosInstance
  private baseURL: string

  constructor(baseURL: string = import.meta.env.VITE_API_URL || 'http://localhost:3000') {
    this.baseURL = baseURL
    this.instance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Add token to every request
    this.instance.interceptors.request.use((config) => {
      const token = localStorage.getItem('auth_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    // Handle responses and errors
    this.instance.interceptors.response.use(
      (response) => response.data,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('auth_user')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  setBaseURL(url: string) {
    this.baseURL = url
    this.instance = axios.create({
      baseURL: url,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  setToken(token: string) {
    localStorage.setItem('auth_token', token)
  }

  // Auth endpoints
  async login(username: string, password: string): Promise<ApiResponse<{ user: any; token: string }>> {
    return this.instance.post('/auth/login', { username, password })
  }

  async logout(): Promise<ApiResponse<null>> {
    return this.instance.post('/auth/logout')
  }

  async register(username: string, email: string, password: string): Promise<ApiResponse<any>> {
    return this.instance.post('/auth/register', { username, email, password })
  }

  async verifyToken(): Promise<ApiResponse<{ user: any }>> {
    return this.instance.get('/auth/verify')
  }

  // User management endpoints
  async getUsers(): Promise<ApiResponse<any[]>> {
    return this.instance.get('/users')
  }

  async getUserById(id: string): Promise<ApiResponse<any>> {
    return this.instance.get(`/users/${id}`)
  }

  async updateUser(id: string, data: Record<string, unknown>): Promise<ApiResponse<any>> {
    return this.instance.patch(`/users/${id}`, data)
  }

  async deleteUser(id: string): Promise<ApiResponse<null>> {
    return this.instance.delete(`/users/${id}`)
  }

  // Smart home endpoints
  async getSmartHomeDevices(): Promise<ApiResponse<any[]>> {
    return this.instance.get('/smart-home/devices')
  }

  async controlDevice(deviceId: string, action: Record<string, unknown>): Promise<ApiResponse<any>> {
    return this.instance.post(`/smart-home/devices/${deviceId}/control`, action)
  }

  async getHueLights(): Promise<ApiResponse<any[]>> {
    return this.instance.get('/smart-home/hue/lights')
  }

  async controlHueLight(lightId: string, state: Record<string, unknown>): Promise<ApiResponse<any>> {
    return this.instance.put(`/smart-home/hue/lights/${lightId}`, state)
  }

  async getHueScenes(): Promise<ApiResponse<any[]>> {
    return this.instance.get('/smart-home/hue/scenes')
  }

  async activateHueScene(sceneId: string): Promise<ApiResponse<any>> {
    return this.instance.post(`/smart-home/hue/scenes/${sceneId}/activate`)
  }

  // Chat endpoints
  async sendMessage(sessionId: string, content: string): Promise<ApiResponse<any>> {
    return this.instance.post(`/chat/${sessionId}/messages`, { content })
  }

  async getChatHistory(sessionId: string): Promise<ApiResponse<any[]>> {
    return this.instance.get(`/chat/${sessionId}/messages`)
  }

  async createChatSession(title: string): Promise<ApiResponse<any>> {
    return this.instance.post('/chat/sessions', { title })
  }

  async getChatSessions(): Promise<ApiResponse<any[]>> {
    return this.instance.get('/chat/sessions')
  }

  // Voice endpoints
  async transcribeAudio(audioBlob: Blob): Promise<ApiResponse<{ text: string }>> {
    const formData = new FormData()
    formData.append('audio', audioBlob)
    return this.instance.post('/voice/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  }

  async synthesizeVoice(text: string, voiceId?: string): Promise<Blob> {
    const response = await this.instance.post(
      '/voice/synthesize',
      { text, voiceId },
      { responseType: 'blob' }
    )
    return response as any
  }
}

export const apiClient = new ApiClient()
export default ApiClient
