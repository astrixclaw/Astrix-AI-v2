import axios, { AxiosError } from 'axios'

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
    public details?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function handleApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError
    const status = axiosError.response?.status
    const data = axiosError.response?.data as any

    const message = data?.error || axiosError.message || 'An error occurred'
    const code = data?.code || `HTTP_${status}`

    return new ApiError(message, code, status, data)
  }

  if (error instanceof Error) {
    return new ApiError(error.message)
  }

  return new ApiError('An unknown error occurred')
}

export function isNetworkError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    return !error.response // No response means network error
  }
  return false
}

export function isAuthError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    return error.response?.status === 401
  }
  return false
}
