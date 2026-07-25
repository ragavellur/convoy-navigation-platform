const BASE_URL = 'https://ragavellur.github.io/convoy-navigation-platform'

export interface DeepLinkData {
  code: string
  tripId?: string
  securityToken?: string
}

export function generateDeepLink(code: string, tripId?: string, securityToken?: string): string {
  const params = new URLSearchParams({ code })
  if (tripId) params.set('trip_id', tripId)
  if (securityToken) params.set('token', securityToken)
  return `${BASE_URL}/join?${params.toString()}`
}

export function parseDeepLink(url: string): DeepLinkData | null {
  try {
    let parsed: URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
      parsed = new URL(url)
    } else if (url.startsWith('/join')) {
      parsed = new URL(`${BASE_URL}${url}`)
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
