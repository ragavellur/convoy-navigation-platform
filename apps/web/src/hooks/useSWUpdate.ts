import { useEffect, useState, useCallback } from 'react'
import { registerSW } from 'virtual:pwa-register'

let updateSW: (() => Promise<void>) | null = null

const register = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('sw-update-available'))
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('sw-offline-ready'))
  },
})

updateSW = register

export function useSWUpdate() {
  const [showUpdate, setShowUpdate] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    const onNeedRefresh = () => setShowUpdate(true)
    const onOfflineReady = () => setOfflineReady(true)

    window.addEventListener('sw-update-available', onNeedRefresh)
    window.addEventListener('sw-offline-ready', onOfflineReady)

    return () => {
      window.removeEventListener('sw-update-available', onNeedRefresh)
      window.removeEventListener('sw-offline-ready', onOfflineReady)
    }
  }, [])

  const dismiss = useCallback(() => {
    setShowUpdate(false)
    setOfflineReady(false)
  }, [])

  const applyUpdate = useCallback(() => {
    updateSW?.().then(() => {
      window.location.reload()
    })
  }, [])

  return { showUpdate, offlineReady, dismiss, applyUpdate }
}
