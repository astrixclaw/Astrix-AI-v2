// Auth types
export interface User {
  id: string
  username: string
  email: string
  role: 'admin' | 'user'
  createdAt: string
  lastLogin?: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  user: User
  token: string
}

// Smart Home types
export interface HueLight {
  id: string
  name: string
  state: {
    on: boolean
    bri: number
    hue?: number
    sat?: number
    xy?: [number, number]
    ct?: number
    colormode?: string
  }
  type: string
  productname: string
}

export interface HueScene {
  id: string
  name: string
  lights: string[]
}

export interface HueRoom {
  id: string
  name: string
  lights: string[]
}

export interface SmartHomeDevice {
  id: string
  name: string
  type: 'light' | 'camera' | 'thermostat' | 'lock'
  status: 'online' | 'offline'
  metadata?: Record<string, unknown>
}

export interface SmartHomeIntegration {
  hue?: {
    bridgeId: string
    bridgeIp: string
    userId: string
    isConnected: boolean
  }
  zosi?: {
    cameraIp: string
    username: string
    isConnected: boolean
  }
}

// Chat types
export interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  content: string
  timestamp: string
  voiceUrl?: string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

// Voice types
export interface VoiceConfig {
  whisperEnabled: boolean
  ttsEnabled: boolean
  preferredTtsVoice: string
  sampleRate: number
}

export interface VoiceState {
  isRecording: boolean
  isProcessing: boolean
  error: string | null
}

// Gateway config
export interface GatewayConfig {
  backendUrl: string
  apiKey?: string
  timeout: number
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
}
