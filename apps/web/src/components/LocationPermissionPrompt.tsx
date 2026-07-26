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
  if (permissionState === 'granted') return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-full bg-white shadow-lg rounded-lg border border-gray-200 p-4">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <span className="text-2xl">📍</span>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-900">Enable Location</h3>
          <p className="text-xs text-gray-500 mt-1">
            Allow location access to share your position with convoy members.
          </p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
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
