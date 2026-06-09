import React, { useState, useEffect, useRef } from 'react'
import { apiClient } from '@api/client'
import { useVoice } from '@hooks/useVoice'
import toast from 'react-hot-toast'
import { FiSend, FiMic, FiLoader, FiVolume2 } from 'react-icons/fi'
import type { ChatMessage } from '@types/index'

export function Chat() {
  const [sessionId] = useState(Math.random().toString(36).substr(2, 9))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { isRecording, startRecording, stopRecording, isProcessing } = useVoice()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      sender: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await apiClient.sendMessage(sessionId, input)
      if (response.success && response.data) {
        const assistantMessage: ChatMessage = {
          id: response.data.id || Math.random().toString(36).substr(2, 9),
          sender: 'assistant',
          content: response.data.content || 'No response',
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, assistantMessage])
      }
    } catch (error: any) {
      toast.error('Failed to send message')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVoiceRecord = async () => {
    try {
      if (!isRecording) {
        await startRecording()
        toast.success('Recording...')
      } else {
        const text = await stopRecording()
        if (text) {
          setInput(text)
          toast.success('Transcribed!')
        }
      }
    } catch (error: any) {
      toast.error('Voice recording failed')
    }
  }

  const handlePlayVoice = async (message: ChatMessage) => {
    try {
      const audioBlob = await apiClient.synthesizeVoice(message.content)
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audio.play()
    } catch (error: any) {
      toast.error('Failed to play voice')
    }
  }

  return (
    <div className="flex flex-col h-screen max-h-[calc(100vh-120px)] bg-gradient-dark rounded-xl border border-purple-500/20 overflow-hidden">
      {/* Header */}
      <div className="bg-black/40 border-b border-purple-500/20 px-6 py-4">
        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-primary">Chat with Astrix AI</h2>
        <p className="text-gray-400 text-sm mt-1">Session ID: {sessionId}</p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mb-4">
              <span className="text-white text-3xl">✨</span>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Start a conversation</h3>
            <p className="text-gray-400">Send a message or use voice to chat with Astrix AI</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.sender === 'user'
                      ? 'bg-gradient-primary'
                      : 'bg-gradient-to-br from-purple-500 to-pink-500'
                  }`}
                >
                  <span className="text-white text-sm font-bold">
                    {message.sender === 'user' ? 'U' : '✨'}
                  </span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                    message.sender === 'user'
                      ? 'bg-purple-600/60 text-white rounded-br-none'
                      : 'bg-white/10 text-gray-100 rounded-bl-none border border-white/10'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <p className="text-xs opacity-60 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>

                  {/* Voice button for assistant messages */}
                  {message.sender === 'assistant' && (
                    <button
                      onClick={() => handlePlayVoice(message)}
                      className="mt-2 flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 rounded px-2 py-1 transition-colors"
                    >
                      <FiVolume2 size={12} />
                      Play
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">✨</span>
            </div>
            <div className="bg-white/10 px-4 py-3 rounded-lg text-gray-300 flex items-center gap-2 border border-white/10">
              <FiLoader className="animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-black/40 border-t border-purple-500/20 p-6">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message or use voice..."
            disabled={isLoading || isRecording || isProcessing}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:bg-white/10 transition-colors disabled:opacity-50"
          />

          <button
            type="button"
            onClick={handleVoiceRecord}
            disabled={isLoading || isProcessing}
            className={`p-3 rounded-lg transition-all ${
              isRecording
                ? 'bg-red-500/60 hover:bg-red-500'
                : 'bg-white/10 hover:bg-white/20'
            } text-white disabled:opacity-50`}
            title="Voice input"
          >
            {isRecording ? <FiMic className="animate-pulse" size={20} /> : <FiMic size={20} />}
          </button>

          <button
            type="submit"
            disabled={isLoading || !input.trim() || isRecording || isProcessing}
            className="px-6 py-3 bg-gradient-primary text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
          >
            <FiSend size={18} />
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
