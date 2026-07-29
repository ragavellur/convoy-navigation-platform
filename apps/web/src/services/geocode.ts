const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`${NOMINATIM_URL}?format=json&lat=${lat}&lon=${lng}&addressdetails=0`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.display_name || null
  } catch {
    return null
  }
}
