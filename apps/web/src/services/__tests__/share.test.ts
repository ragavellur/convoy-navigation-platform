import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getDeepLink, shareViaWhatsApp, shareViaSMS, shareViaEmail, shareNative } from '../share'

const ORIGINAL_ENV = import.meta.env.VITE_APP_URL

beforeEach(() => {
  import.meta.env.VITE_APP_URL = 'https://convoy.test'
  vi.stubGlobal('window', { open: vi.fn(), location: { origin: 'https://convoy.test' } })
})

afterEach(() => {
  import.meta.env.VITE_APP_URL = ORIGINAL_ENV
  vi.unstubAllGlobals()
})

describe('getDeepLink', () => {
  it('generates link with code only', () => {
    expect(getDeepLink('ABC123')).toBe('https://convoy.test/join?code=ABC123')
  })

  it('generates link with code and tripId', () => {
    const link = getDeepLink('ABC123', 'trip-1')
    expect(link).toContain('code=ABC123')
    expect(link).toContain('trip_id=trip-1')
  })
})

describe('shareViaWhatsApp', () => {
  it('opens WhatsApp with convoy link', () => {
    shareViaWhatsApp('ABC123', undefined, 'Test Convoy')
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('wa.me'), '_blank')
  })
})

describe('shareViaSMS', () => {
  it('opens SMS with convoy link', () => {
    shareViaSMS('ABC123')
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('sms:'), '_blank')
  })
})

describe('shareViaEmail', () => {
  it('opens email with convoy details', () => {
    shareViaEmail('ABC123', undefined, 'Test Convoy')
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('mailto:'), '_blank')
  })
})

describe('shareNative', () => {
  it('returns false when navigator.share is not available', async () => {
    vi.stubGlobal('navigator', { share: undefined })
    const result = await shareNative('ABC123')
    expect(result).toBe(false)
  })

  it('calls navigator.share and returns true', async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share: shareFn })
    const result = await shareNative('ABC123')
    expect(result).toBe(true)
    expect(shareFn).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String) }))
  })

  it('returns false when navigator.share throws', async () => {
    const shareFn = vi.fn().mockRejectedValue(new Error('Abort'))
    vi.stubGlobal('navigator', { share: shareFn })
    const result = await shareNative('ABC123')
    expect(result).toBe(false)
  })
})
