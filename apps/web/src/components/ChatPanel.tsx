import { useState, useEffect, useRef, useCallback } from 'react'
import { useConvoyRoster } from '../stores/ConvoyRosterContext'
import { useAuth } from '../hooks/useAuth'
import {
  sendTextMessage,
  getMessages,
  subscribeToMessages,
  unsubscribeMessages,
  type ChatMessage,
} from '../services/chatService'

export default function ChatPanel() {
  const { convoyId } = useConvoyRoster()
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!convoyId || !isOpen) return

    let isMounted = true
    getMessages(convoyId).then((msgs) => {
      if (isMounted) setMessages(msgs)
    })

    subscribeToMessages(convoyId, (msg) => {
      if (isMounted) setMessages((prev) => [...prev, msg])
    })

    return () => {
      isMounted = false
      unsubscribeMessages()
    }
  }, [convoyId, isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    if (!convoyId || !user || !input.trim()) return
    const content = input.trim()
    setInput('')
    await sendTextMessage(convoyId, user.id, user.name, content)
  }, [convoyId, user, input])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  if (!convoyId) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50"
      >
        <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
        <div className="flex items-center gap-1">
          {messages.length > 0 && <span className="text-xs text-gray-500">{messages.length}</span>}
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100">
          <div className="h-64 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center mt-8">No messages yet</p>
            ) : (
              messages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} isSelf={msg.sender === user?.id} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="p-1.5 text-indigo-600 hover:text-indigo-700 disabled:text-gray-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChatBubble({ message, isSelf }: { message: ChatMessage; isSelf: boolean }) {
  const time = new Date(message.created).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (message.type === 'system') {
    return (
      <div className="text-center">
        <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] px-3 py-1.5 rounded-lg ${
          isSelf
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
        }`}
      >
        {!isSelf && (
          <p className="text-[10px] font-medium text-indigo-600 mb-0.5">{message.senderName}</p>
        )}
        <p className="text-sm">{message.content}</p>
        <p className={`text-[10px] mt-0.5 ${isSelf ? 'text-indigo-200' : 'text-gray-400'}`}>
          {time}
        </p>
      </div>
    </div>
  )
}
