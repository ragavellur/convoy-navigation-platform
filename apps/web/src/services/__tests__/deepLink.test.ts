import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateDeepLink, parseDeepLink, validateConvoyCode } from '../deepLink'

const ORIGINAL_ENV = import.meta.env.VITE_APP_URL

beforeEach(() => {
  import.meta.env.VITE_APP_URL = 'https://convoy.test'
})

afterEach(() => {
  import.meta.env.VITE_APP_URL = ORIGINAL_ENV
})

describe('generateDeepLink', () => {
  it('generates a link with just a code', () => {
    const link = generateDeepLink('ABC123')
    expect(link).toBe('https://convoy.test/join?code=ABC123')
  })

  it('includes tripId and securityToken when provided', () => {
    const link = generateDeepLink('ABC123', 'trip-1', 'tok-abc')
    expect(link).toContain('code=ABC123')
    expect(link).toContain('trip_id=trip-1')
    expect(link).toContain('token=tok-abc')
  })
})

describe('parseDeepLink', () => {
  it('parses a full URL', () => {
    const result = parseDeepLink('https://convoy.test/join?code=ABC123&trip_id=trip-1')
    expect(result).toEqual({ code: 'ABC123', tripId: 'trip-1', securityToken: undefined })
  })

  it('parses a relative path', () => {
    const result = parseDeepLink('/join?code=XYZ789')
    expect(result).toEqual({ code: 'XYZ789', tripId: undefined, securityToken: undefined })
  })

  it('returns null for invalid URL', () => {
    expect(parseDeepLink('not-a-url')).toBeNull()
  })

  it('returns null when no code param', () => {
    expect(parseDeepLink('https://convoy.test/join')).toBeNull()
  })

  it('parses all optional params', () => {
    const result = parseDeepLink('https://convoy.test/join?code=ABC123&trip_id=trip-1&token=secret')
    expect(result).toEqual({ code: 'ABC123', tripId: 'trip-1', securityToken: 'secret' })
  })
})

describe('validateConvoyCode', () => {
  it('validates a correct 6-char uppercase alphanumeric code', () => {
    expect(validateConvoyCode('ABC123')).toBe(true)
  })

  it('rejects lowercase letters', () => {
    expect(validateConvoyCode('abc123')).toBe(false)
  })

  it('rejects too short code', () => {
    expect(validateConvoyCode('AB12')).toBe(false)
  })

  it('rejects code with special characters', () => {
    expect(validateConvoyCode('AB@123')).toBe(false)
  })
})
