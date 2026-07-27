function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return import.meta.env.VITE_APP_URL || 'https://convoy.vellur.in'
}

export interface DeepLinkData {
  code: string
  tripId?: string
  securityToken?: string
}

export function generateDeepLink(code: string, tripId?: string, securityToken?: string): string {
  const params = new URLSearchParams({ code })
  if (tripId) params.set('trip_id', tripId)
  if (securityToken) params.set('token', securityToken)
  return `${getBaseUrl()}/join?${params.toString()}`
}

export function parseDeepLink(url: string): DeepLinkData | null {
  try {
    let parsed: URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
      parsed = new URL(url)
    } else if (url.startsWith('/join')) {
      parsed = new URL(`${getBaseUrl()}${url}`)
    } else {
      return null
    }

    const code = parsed.searchParams.get('code')
    if (!code) return null

    return {
      code,
      tripId: parsed.searchParams.get('trip_id') || undefined,
      securityToken: parsed.searchParams.get('token') || undefined,
    }
  } catch {
    return null
  }
}

export function validateConvoyCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code)
}
