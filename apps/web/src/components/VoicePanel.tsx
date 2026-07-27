import { useState, useRef, useCallback, useEffect } from 'react'
import { voiceChannel, type VoiceState, type VoicePeer } from '../services/voiceChannel'
import { useConvoyRoster } from '../stores/ConvoyRosterContext'
import { useAuth } from '../hooks/useAuth'

export default function VoicePanel() {
  const { convoyId } = useConvoyRoster()
  const { user } = useAuth()
  const [state, setState] = useState<VoiceState>('disconnected')
  const [peers, setPeers] = useState<VoicePeer[]>([])
  const [activeSpeaker, setActiveSpeaker] = useState<{ userId: string; userName: string } | null>(
    null,
  )
  const pttHeld = useRef(false)
  const [isPttHeld, setIsPttHeld] = useState(false)

  const handleJoin = useCallback(async () => {
    if (!convoyId || !user) return
    await voiceChannel.join(convoyId, user.id, user.name, {
      onStateChange: setState,
      onPeersChange: setPeers,
      onActiveSpeaker: (userId, userName) => {
        if (userId && userName) setActiveSpeaker({ userId, userName })
        else setActiveSpeaker(null)
      },
    })
  }, [convoyId, user])

  const handleLeave = useCallback(() => {
    voiceChannel.leave()
  }, [])

  const handlePttStart = useCallback(async () => {
    if (pttHeld.current) return
    pttHeld.current = true
    setIsPttHeld(true)
    await voiceChannel.startSpeaking()
  }, [])

  const handlePttStop = useCallback(() => {
    pttHeld.current = false
    setIsPttHeld(false)
    voiceChannel.stopSpeaking()
  }, [])

  useEffect(() => {
    return () => {
      voiceChannel.leave()
    }
  }, [])

  if (!convoyId) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Voice Channel</h3>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                state === 'connected' || state === 'speaking'
                  ? 'bg-green-500'
                  : state === 'connecting'
                    ? 'bg-yellow-500'
                    : 'bg-gray-400'
              }`}
            />
            <span className="text-xs text-gray-500 capitalize">{state}</span>
          </div>
        </div>
      </div>

      <div className="p-3">
        {state === 'disconnected' ? (
          <button
            onClick={handleJoin}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            Join Voice
          </button>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-gray-500">
              {peers.length + 1} participant{peers.length !== 1 ? 's' : ''}
            </div>

            {activeSpeaker && (
              <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 rounded-md">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-green-700 font-medium">
                  {activeSpeaker.userName} is speaking
                </span>
              </div>
            )}

            <div className="relative">
              <button
                onPointerDown={handlePttStart}
                onPointerUp={handlePttStop}
                onPointerLeave={handlePttStop}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-colors select-none ${
                  isPttHeld
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                {isPttHeld ? 'Speaking...' : 'Hold to Talk'}
              </button>
            </div>

            <button
              onClick={handleLeave}
              className="w-full px-3 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md"
            >
              Leave Voice
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
