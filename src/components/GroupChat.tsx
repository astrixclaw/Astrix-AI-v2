import React, { useState, useEffect, useRef } from 'react'
import { FiSend, FiUsers, FiSmile, FiImage } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import type { ChatMessage } from '@types/index'

interface GroupMessage extends ChatMessage {
  senderName: string
  senderRole?: 'admin' | 'user'
  avatar?: string
}

export function GroupChat() {
  const [messages, setMessages] = useState<GroupMessage[]>([
    {
      id: '1',
      sender: 'admin',
      senderName: 'Admin',
      content: 'Welcome to the household group chat! 👋',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: '2',
      sender: 'user1',
      senderName: 'Keena',
      content: 'Hey everyone! How is everyone doing?',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
    },
  ])

  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const currentUser = 'admin' // This should come from auth context
  const currentUserName = 'You'

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const newMessage: GroupMessage = {
      id: Math.random().toString(36).substr(2, 9),
      sender: currentUser,
      senderName: currentUserName,
      content: input,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, newMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Here you would send the message to your backend API
      // await apiClient.sendGroupMessage(newMessage)
      toast.success('Message sent!')
    } catch (error) {
      toast.error('Failed to send message')
      setMessages((prev) => prev.filter((m) => m.id !== newMessage.id))
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmojiClick = (emoji: string) => {
    setInput(input + emoji)
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-purple-500',
      'bg-blue-500',
      'bg-pink-500',
      'bg-green-500',
      'bg-orange-500',
    ]
    const index = name.charCodeAt(0) % colors.length
    return colors[index]
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-gray-700 p-6 space-y-2"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-primary rounded-lg">
            <FiUsers className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Household Chat</h1>
            <p className="text-sm text-gray-400">Communicate with family members</p>
          </div>
        </div>
      </motion.div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, index) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`flex gap-3 ${msg.sender === currentUser ? 'flex-row-reverse' : ''}`}
          >
            {/* Avatar */}
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white ${getAvatarColor(msg.senderName)}`}
            >
              {getInitials(msg.senderName)}
            </div>

            {/* Message Bubble */}
            <div className={`flex-1 max-w-md ${msg.sender === currentUser ? 'text-right' : ''}`}>
              <div className="flex items-center gap-2 mb-1 px-3">
                <span className="font-semibold text-white text-sm">{msg.senderName}</span>
                {msg.senderRole === 'admin' && (
                  <span className="text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                </span>
              </div>

              <div
                className={`px-4 py-2 rounded-xl ${
                  msg.sender === currentUser
                    ? 'bg-gradient-primary text-white'
                    : 'bg-gray-800 text-gray-100 border border-gray-700'
                }`}
              >
                <p className="break-words">{msg.content}</p>
              </div>
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-700 p-6 space-y-4 bg-gray-900/50">
        {/* Emoji Quick Select */}
        <div className="flex gap-2 text-2xl">
          {['👋', '😊', '👍', '❤️', '🎉', '😂'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              className="hover:scale-125 transition-transform cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Message Form */}
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <input
            type="text"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 outline-none transition"
          />
          <button
            type="button"
            className="p-3 text-gray-400 hover:text-purple-400 hover:bg-gray-800 rounded-lg transition"
            title="Attach image"
          >
            <FiImage size={20} />
          </button>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-gradient-primary text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2 font-semibold"
          >
            {isLoading ? '...' : <FiSend size={20} />}
          </button>
        </form>

        {/* Tip */}
        <p className="text-xs text-gray-500 text-center">
          💡 Use emojis to express yourself or type @username to mention someone
        </p>
      </div>
    </div>
  )
}
