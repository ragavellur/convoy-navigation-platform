import { useState } from 'react'
import type { PermissionState } from '../hooks/useGeolocationStream'

interface LocationPermissionPromptProps {
  permissionState: PermissionState
  error: string | null
  onRequestPermission: () => void
}

function LocationPermissionPrompt({
  permissionState,
  error,
  onRequestPermission,
}: LocationPermissionPromptProps) {
  const [dismissed, setDismissed] = useState(false)

  if (permissionState === 'granted' || permissionState === 'requesting' || dismissed) return null

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-sm w-full bg-[var(--card)] shadow-lg rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <span className="text-2xl">📍</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--text)]">Enable Location</h3>
            <button
              onClick={() => setDismissed(true)}
              className="text-[var(--text2)] hover:text-[var(--text)]"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="text-xs text-[var(--text2)] mt-1">
            Allow location access to share your position with convoy members.
          </p>
          {error && <p className="text-xs text-[var(--error-text)] mt-1">{error}</p>}
          <div className="mt-3 flex space-x-2">
            <button
              onClick={onRequestPermission}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              {permissionState === 'timeout' ? 'Retry' : 'Enable'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LocationPermissionPrompt
