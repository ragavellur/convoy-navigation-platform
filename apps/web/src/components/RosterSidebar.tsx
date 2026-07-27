import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useConvoyRoster, type RosterMember } from '../stores/ConvoyRosterContext'
import { formatSpeedKmh } from '../utils/memberStatus'
import { useAuth } from '../hooks/useAuth'
import VoicePanel from './VoicePanel'
import ChatPanel from './ChatPanel'

const STATUS_COLORS: Record<string, string> = {
  'in-transit': 'bg-green-500',
  stopped: 'bg-yellow-500',
  offline: 'bg-gray-400',
}

const STATUS_LABELS: Record<string, string> = {
  'in-transit': 'In Transit',
  stopped: 'Stopped',
  offline: 'Offline',
}

const VEHICLE_ICONS: Record<string, string> = {
  car: '🚗',
  truck: '🚛',
  motorcycle: '🏍️',
  other: '🚐',
}

interface RosterSidebarProps {
  isExpanded: boolean
  onToggle: () => void
}

export default function RosterSidebar({ isExpanded, onToggle }: RosterSidebarProps) {
  const { members, convoyId, isLoading, focusMemberId, setFocusMemberId } = useConvoyRoster()
  const { user } = useAuth()
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null) return
      const delta = e.changedTouches[0].clientX - touchStart
      if (Math.abs(delta) > 50) {
        if (delta > 0 && !isExpanded) onToggle()
        if (delta < 0 && isExpanded) onToggle()
      }
      setTouchStart(null)
    },
    [touchStart, isExpanded, onToggle],
  )

  const handleFocusMember = useCallback(
    (memberId: string) => {
      setFocusMemberId(focusMemberId === memberId ? null : memberId)
    },
    [focusMemberId, setFocusMemberId],
  )

  if (!convoyId) {
    return (
      <aside className="hidden lg:flex lg:flex-col lg:w-80 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Convoy Panel</h2>
          <p className="text-xs text-gray-500 mt-1">No convoy active</p>
        </div>
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="text-center text-sm text-gray-500">
            <p className="mb-3">Join or create a convoy to see members here.</p>
            <Link
              to="/convoy"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Manage Convoy
            </Link>
          </div>
        </div>
      </aside>
    )
  }

  const activeCount = members.filter((m) => m.status !== 'offline').length
  const transitCount = members.filter((m) => m.status === 'in-transit').length

  return (
    <aside
      ref={sidebarRef}
      className={`hidden lg:flex lg:flex-col bg-white border-r border-gray-200 overflow-hidden transition-all duration-300 ${
        isExpanded ? 'lg:w-80' : 'lg:w-12'
      }`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {isExpanded ? (
        <>
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Convoy Members</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {activeCount} active · {transitCount} moving
                </p>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
                  {members.length}
                </span>
                <button
                  onClick={onToggle}
                  className="p-1 rounded text-gray-400 hover:text-gray-600"
                  aria-label="Collapse sidebar"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading && members.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">Loading members…</div>
            ) : members.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No members in convoy yet.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {members.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    isFocused={focusMemberId === member.id}
                    isSelf={member.userId === user?.id}
                    onFocus={() => handleFocusMember(member.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="p-3 border-t border-gray-200 space-y-3">
            <VoicePanel />
            <ChatPanel />
            <Link
              to="/convoy"
              className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Manage Convoy
            </Link>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center pt-3 gap-2">
          <button
            onClick={onToggle}
            className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Expand sidebar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 5l7 7-7 7M5 5l7 7-7 7"
              />
            </svg>
          </button>
          <span className="text-xs font-medium text-gray-500">{members.length}</span>
          {transitCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-green-500" title={`${transitCount} moving`} />
          )}
        </div>
      )}
    </aside>
  )
}

function MemberCard({
  member,
  isFocused,
  isSelf,
  onFocus,
}: {
  member: RosterMember
  isFocused: boolean
  isSelf: boolean
  onFocus: () => void
}) {
  const initials = member.userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <li
      className={`px-4 py-3 cursor-pointer transition-colors ${
        isFocused ? 'bg-indigo-50' : 'hover:bg-gray-50'
      }`}
      onClick={onFocus}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          {member.userAvatar ? (
            <img
              src={member.userAvatar}
              alt={member.userName}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700">
              {initials}
            </div>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${STATUS_COLORS[member.status]}`}
            title={STATUS_LABELS[member.status]}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900 truncate">{member.userName}</span>
            {isSelf && (
              <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                You
              </span>
            )}
            {member.role === 'host' && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                Host
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {member.vehicleType && (
              <span className="text-xs text-gray-500">
                {VEHICLE_ICONS[member.vehicleType] ?? '🚐'}{' '}
                {member.vehicleName || member.vehicleType}
              </span>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          {member.status !== 'offline' && member.position ? (
            <>
              <div className="text-xs font-medium text-gray-900">
                {formatSpeedKmh(member.position.speed)}
              </div>
              <div className="text-[10px] text-gray-500">{STATUS_LABELS[member.status]}</div>
            </>
          ) : (
            <div className="text-xs text-gray-400">Offline</div>
          )}
        </div>
      </div>
    </li>
  )
}
