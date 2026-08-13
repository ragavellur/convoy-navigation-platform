import { useState, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useConvoyRoster, type RosterMember } from '../stores/ConvoyRosterContext'
import { formatSpeedKmh } from '../utils/memberStatus'
import { useAuth } from '../hooks/useAuth'
import VoicePanel from './VoicePanel'
import ChatPanel from './ChatPanel'
import supabase from '../services/supabaseClient'

const STATUS_COLORS: Record<string, string> = {
  'in-transit': 'bg-[var(--success)]',
  stopped: 'bg-[var(--warning)]',
  offline: 'bg-[var(--toggle-off-bg)]',
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
  trekker: '🥾',
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
  const [convoyInfo, setConvoyInfo] = useState<{
    name: string
    description?: string
    source_name?: string
    dest_name?: string
  } | null>(null)

  useEffect(() => {
    if (!convoyId) return
    const load = async () => {
      try {
        const { data } = await supabase
          .from('convoys')
          .select('name, description, source_name, dest_name')
          .eq('id', convoyId)
          .maybeSingle()
        if (data) {
          setConvoyInfo({
            name: data.name,
            description: data.description ?? undefined,
            source_name: data.source_name ?? undefined,
            dest_name: data.dest_name ?? undefined,
          })
        }
      } catch {
        /* convoy info fetch is non-critical */
      }
    }
    load()
  }, [convoyId])

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
      <>
        <aside className="hidden lg:flex lg:flex-col lg:w-80 overflow-y-auto glass">
          <div className="p-4 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold text-[var(--text)]">Convoy Panel</h2>
            <p className="text-xs text-[var(--text2)] mt-1">No convoy active</p>
          </div>
          <div className="flex-1 p-4 flex items-center justify-center">
            <div className="text-center text-sm text-[var(--text2)]">
              <p className="mb-3">Join or create a convoy to see members here.</p>
              <Link
                to="/convoy"
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                Manage Convoy
              </Link>
            </div>
          </div>
        </aside>
      </>
    )
  }

  const activeCount = members.filter((m) => m.status !== 'offline').length
  const transitCount = members.filter((m) => m.status === 'in-transit').length
  const myMembership = members.find((m) => m.userId === user?.id)
  const mySourceName = myMembership?.joinName || convoyInfo?.source_name

  return (
    <>
      <aside
        ref={sidebarRef}
        className={`hidden lg:flex lg:flex-col overflow-hidden transition-all duration-300 ${
          isExpanded ? 'lg:w-80' : 'lg:w-12'
        } glass`}
      >
        {isExpanded ? (
          <>
            {convoyInfo && (
              <div className="p-4 border-b border-[var(--border)] bg-[var(--primary-faint-bg)]">
                <h2 className="text-sm font-semibold text-[var(--text)]">{convoyInfo.name}</h2>
                {convoyInfo.description && (
                  <p className="text-xs text-[var(--text2)] mt-0.5">{convoyInfo.description}</p>
                )}
                {(mySourceName || convoyInfo.dest_name) && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-[var(--text2)]">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--success-bg)] text-[var(--success-text)]">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <circle cx="10" cy="10" r="4" />
                      </svg>
                      {mySourceName || '?'}
                    </span>
                    <svg
                      className="w-3 h-3 text-[var(--text2)] opacity-70 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--error-bg)] text-[var(--error-text)]">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {convoyInfo.dest_name || '?'}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="p-4 border-b border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text)]">Convoy Members</h2>
                  <p className="text-xs text-[var(--text2)] mt-1">
                    {activeCount} active · {transitCount} moving
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full bg-[var(--badge-vehicle-bg)] text-[var(--primary)]">
                    {members.length}
                  </span>
                  <button
                    onClick={onToggle}
                    className="p-1 rounded text-[var(--text2)] opacity-70 hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
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
                <div className="p-4 text-center text-sm text-[var(--text2)]">Loading members…</div>
              ) : members.length === 0 ? (
                <div className="p-4 text-center text-sm text-[var(--text2)]">
                  No members in convoy yet.
                </div>
              ) : (
                <ul>
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

            <div className="p-3 border-t border-[var(--border)] space-y-3">
              <VoicePanel />
              <ChatPanel />
              <Link
                to="/convoy"
                className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                Manage Convoy
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center pt-3 gap-2">
            <button
              onClick={onToggle}
              className="p-1.5 rounded text-[var(--text2)] opacity-70 hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
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
            <span className="text-xs font-medium text-[var(--text2)] opacity-70">
              {members.length}
            </span>
            {transitCount > 0 && (
              <span
                className="w-2 h-2 rounded-full bg-[var(--success)]"
                title={`${transitCount} moving`}
              />
            )}
          </div>
        )}
      </aside>

      <div className="lg:hidden fixed top-20 left-0 z-20">
        {!isExpanded && (
          <button
            onClick={onToggle}
            className="absolute top-0 left-0 m-2 p-2 rounded-full border border-[var(--border)] glass text-[var(--text2)] transition-colors"
            aria-label="Open convoy panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 5l7 7-7 7M5 5l7 7-7 7"
              />
            </svg>
          </button>
        )}
        {isExpanded && (
          <div className="fixed inset-0 bg-[var(--overlay)] z-10" onClick={onToggle} />
        )}
        <aside
          ref={sidebarRef}
          className={`fixed left-0 w-80 shadow-2xl z-20 flex flex-col overflow-hidden transition-transform duration-300 top-0 bottom-14 glass-strong ${
            isExpanded ? 'translate-x-0' : '-translate-x-full'
          }`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {convoyInfo && (
            <div className="p-4 border-b border-[var(--border)] bg-[var(--primary-faint-bg)]">
              <h2 className="text-sm font-semibold text-[var(--text)]">{convoyInfo.name}</h2>
              {convoyInfo.description && (
                <p className="text-xs text-[var(--text2)] mt-0.5">{convoyInfo.description}</p>
              )}
              {(mySourceName || convoyInfo.dest_name) && (
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-[var(--text2)]">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--success-bg)] text-[var(--success-text)]">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="4" />
                    </svg>
                    {mySourceName || '?'}
                  </span>
                  <svg
                    className="w-3 h-3 text-[var(--text2)] opacity-70 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--error-bg)] text-[var(--error-text)]">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {convoyInfo.dest_name || '?'}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Convoy Members</h2>
                <p className="text-xs text-[var(--text2)] mt-1">
                  {activeCount} active · {transitCount} moving
                </p>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full bg-[var(--badge-vehicle-bg)] text-[var(--primary)]">
                  {members.length}
                </span>
                <button
                  onClick={onToggle}
                  className="p-1 rounded text-[var(--text2)] opacity-70 hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
                  aria-label="Close panel"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading && members.length === 0 ? (
              <div className="p-4 text-center text-sm text-[var(--text2)]">Loading members…</div>
            ) : members.length === 0 ? (
              <div className="p-4 text-center text-sm text-[var(--text2)]">
                No members in convoy yet.
              </div>
            ) : (
              <ul>
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

          <div className="p-3 border-t border-[var(--border)] space-y-3">
            <VoicePanel />
            <ChatPanel />
            <Link
              to="/convoy"
              className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
            >
              Manage Convoy
            </Link>
          </div>
        </aside>
      </div>
    </>
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
        isFocused ? 'bg-[var(--primary-subtle-bg)]' : 'hover:bg-[var(--surface)]'
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
            <div className="w-9 h-9 rounded-full bg-[var(--badge-vehicle-bg)] flex items-center justify-center text-xs font-semibold text-[var(--primary)]">
              {initials}
            </div>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--nav-bg)] ${STATUS_COLORS[member.status]}`}
            title={STATUS_LABELS[member.status]}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-[var(--text)] truncate">
              {member.userName}
            </span>
            {isSelf && (
              <span className="text-[10px] font-medium text-[var(--primary)] bg-[var(--badge-vehicle-bg)] px-1.5 py-0.5 rounded">
                You
              </span>
            )}
            {member.role === 'owner' && (
              <span className="text-[10px] font-medium text-[var(--warning-text)] bg-[var(--badge-host-bg)] px-1.5 py-0.5 rounded">
                Host
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {member.vehicleType && (
              <span className="text-xs text-[var(--text2)]">
                {VEHICLE_ICONS[member.vehicleType] ?? '🚐'}{' '}
                {member.vehicleName || member.vehicleType}
              </span>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          {member.status !== 'offline' && member.position ? (
            <>
              <div className="text-xs font-medium text-[var(--text)]">
                {formatSpeedKmh(member.position.speed)}
              </div>
              <div className="text-[10px] text-[var(--text2)]">{STATUS_LABELS[member.status]}</div>
            </>
          ) : (
            <div className="text-xs text-[var(--text2)] opacity-70">Offline</div>
          )}
        </div>
      </div>
    </li>
  )
}
