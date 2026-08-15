import { formatIndianAddress, resolveAcceptLanguage } from './nominatim'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`${NOMINATIM_URL}?format=json&lat=${lat}&lon=${lng}&addressdetails=1`, {
      headers: { 'Accept-Language': resolveAcceptLanguage() },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.display_name) return null
    return formatIndianAddress(data)
  } catch {
    return null
  }
}
