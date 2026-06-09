import { useState, useCallback, useRef } from 'react'
import { apiClient } from '@api/client'
import type { VoiceState } from '@types/index'

export function useVoice() {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isRecording: false,
    isProcessing: false,
    error: null,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      setVoiceState({ isRecording: true, isProcessing: false, error: null })
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
    } catch (error: any) {
      setVoiceState({
        isRecording: false,
        isProcessing: false,
        error: error.message || 'Failed to start recording',
      })
    }
  }, [])

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve(null)
        return
      }

      const mediaRecorder = mediaRecorderRef.current

      mediaRecorder.onstop = async () => {
        try {
          setVoiceState({ isRecording: false, isProcessing: true, error: null })

          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          const response = await apiClient.transcribeAudio(audioBlob)

          if (response.success && response.data?.text) {
            setVoiceState({ isRecording: false, isProcessing: false, error: null })
            resolve(response.data.text)
          }
        } catch (error: any) {
          setVoiceState({
            isRecording: false,
            isProcessing: false,
            error: error.message || 'Failed to transcribe audio',
          })
          resolve(null)
        }
      }

      mediaRecorder.stop()
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    })
  }, [])

  const synthesizeVoice = useCallback(async (text: string): Promise<Blob | null> => {
    try {
      setVoiceState((prev) => ({ ...prev, isProcessing: true }))
      const audioBlob = await apiClient.synthesizeVoice(text)
      setVoiceState((prev) => ({ ...prev, isProcessing: false }))
      return audioBlob
    } catch (error: any) {
      setVoiceState({
        isRecording: false,
        isProcessing: false,
        error: error.message || 'Failed to synthesize voice',
      })
      return null
    }
  }, [])

  return {
    ...voiceState,
    startRecording,
    stopRecording,
    synthesizeVoice,
  }
}
