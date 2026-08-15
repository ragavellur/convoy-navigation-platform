import supabase from './supabaseClient'

function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return import.meta.env.VITE_APP_URL || 'https://convoy.vellur.in'
}

export interface OAuthCallbackError {
  code: string | null
  message: string
}

/** Maps Supabase OAuth callback errors to a structured result. */
export function mapOAuthError(
  code: string | null,
  message: string | null,
  url: URL | null,
): OAuthCallbackError | null {
  const effectiveCode = code || (url?.searchParams.get('error_code') ?? null)
  const effectiveMessage =
    message || url?.searchParams.get('error_description') || url?.searchParams.get('error') || null

  if (!effectiveCode && !effectiveMessage) return null

  const normalized = (effectiveCode || '').toLowerCase()
  const isDuplicate =
    normalized.includes('user_already_exists') ||
    normalized.includes('email_exists') ||
    /already (been )?registered|already exists/i.test(effectiveMessage || '')

  return {
    code: isDuplicate ? 'user_already_exists' : (effectiveCode ?? 'unknown'),
    message: effectiveMessage || '',
  }
}

/**
 * Start a Google sign-in flow. The OAuth round-trip returns to the app's
 * /auth/callback with the intended destination preserved in `redirectTo`.
 */
export async function signInWithGoogle(redirectTo = '/'): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${getBaseUrl()}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
    },
  })
  if (error) throw error
}

/**
 * Link the current (password-authenticated) user's account to a Google
 * identity. Used by the merge fallback when Supabase refused auto-linking.
 */
export async function linkGoogleIdentity(redirectTo = '/'): Promise<void> {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo: `${getBaseUrl()}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
    },
  })
  if (error) throw error
}
