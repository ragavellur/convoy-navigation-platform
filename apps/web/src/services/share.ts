function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return import.meta.env.VITE_APP_URL || 'https://convoy.vellur.in'
}

export function getDeepLink(code: string, tripId?: string): string {
  const params = new URLSearchParams({ code })
  if (tripId) params.set('trip_id', tripId)
  return `${getBaseUrl()}/join?${params.toString()}`
}

export function shareViaWhatsApp(code: string, tripId?: string, convoyName?: string): void {
  const link = getDeepLink(code, tripId)
  const text = `Join my convoy${convoyName ? ` "${convoyName}"` : ''}! Use code: ${code}\n${link}`
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
}

export function shareViaSMS(code: string, tripId?: string, convoyName?: string): void {
  const link = getDeepLink(code, tripId)
  const body = `Join my convoy${convoyName ? ` "${convoyName}"` : ''}! Code: ${code}\n${link}`
  window.open(`sms:?body=${encodeURIComponent(body)}`, '_blank')
}

export function shareViaEmail(code: string, tripId?: string, convoyName?: string): void {
  const link = getDeepLink(code, tripId)
  const subject = `Join Convoy: ${convoyName || code}`
  const body = `You're invited to join convoy "${convoyName || code}".\n\nConvoy Code: ${code}\nJoin Link: ${link}\n\nClick the link or enter the code in the app to join.`
  window.open(
    `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    '_blank',
  )
}

export async function shareNative(
  code: string,
  tripId?: string,
  convoyName?: string,
): Promise<boolean> {
  if (!navigator.share) return false
  const link = getDeepLink(code, tripId)
  try {
    await navigator.share({
      title: `Join Convoy: ${convoyName || code}`,
      text: `Join my convoy${convoyName ? ` "${convoyName}"` : ''}! Code: ${code}`,
      url: link,
    })
    return true
  } catch {
    return false
  }
}
