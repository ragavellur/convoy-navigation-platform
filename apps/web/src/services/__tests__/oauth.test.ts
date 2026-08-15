import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { harness } from './helpers/supabaseTest'

vi.mock('../supabaseClient', async () => {
  const { harness } = await import('./helpers/supabaseTest')
  return { default: harness.supabase }
})

import { mapOAuthError, signInWithGoogle, linkGoogleIdentity } from '../oauth'

beforeEach(() => {
  harness.reset()
  vi.stubGlobal('window', { location: { origin: 'https://convoy.test' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mapOAuthError', () => {
  it('returns null when there is no error', () => {
    expect(mapOAuthError(null, null, null)).toBeNull()
  })

  it('maps user_already_exists code', () => {
    const result = mapOAuthError(
      'user_already_exists',
      'A user with this email already exists',
      null,
    )
    expect(result?.code).toBe('user_already_exists')
  })

  it('maps email_exists code', () => {
    expect(mapOAuthError('email_exists', 'msg', null)?.code).toBe('user_already_exists')
  })

  it('detects duplicate email from the message text', () => {
    const result = mapOAuthError(null, 'User already registered', null)
    expect(result?.code).toBe('user_already_exists')
  })

  it('falls back to the raw code for other errors', () => {
    const result = mapOAuthError('access_denied', 'cancelled', null)
    expect(result?.code).toBe('access_denied')
  })

  it('reads the code from the URL when none is provided', () => {
    const url = new URL('https://convoy.test/auth/callback?error_code=user_already_exists')
    expect(mapOAuthError(null, null, url)?.code).toBe('user_already_exists')
  })
})

describe('signInWithGoogle', () => {
  it('calls signInWithOAuth with provider google and callback redirect', async () => {
    await signInWithGoogle('/s/abc')
    expect(harness.supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `https://convoy.test/auth/callback?redirect=${encodeURIComponent('/s/abc')}`,
      },
    })
  })

  it('throws when the OAuth call fails', async () => {
    harness.supabase.auth.signInWithOAuth.mockResolvedValueOnce({
      data: { url: '' },
      error: new Error('provider not configured'),
    })
    await expect(signInWithGoogle()).rejects.toThrow('provider not configured')
  })
})

describe('linkGoogleIdentity', () => {
  it('calls linkIdentity with provider google and callback redirect', async () => {
    await linkGoogleIdentity('/convoy')
    expect(harness.supabase.auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `https://convoy.test/auth/callback?redirect=${encodeURIComponent('/convoy')}`,
      },
    })
  })
})
