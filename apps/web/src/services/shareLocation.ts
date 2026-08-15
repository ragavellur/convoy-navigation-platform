import supabase from './supabaseClient'

export interface ResolvedShare {
  convoy: string
  convoyName: string | null
  ownerName: string | null
  phase: string
  displayName: string | null
  status: string
}

export interface MyShare {
  id: string
  token: string
  convoy: string
  displayName: string | null
  status: string
}

const TOKEN_LENGTH = 24
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/**
 * Generate a URL-safe, unguessable share token using the platform's
 * CSPRNG. 24 chars from a 64-symbol alphabet ~ 144 bits of entropy.
 */
export function generateShareToken(length: number = TOKEN_LENGTH): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let token = ''
  for (let i = 0; i < length; i++) {
    token += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length]
  }
  return token
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return import.meta.env.VITE_APP_URL || 'https://convoy.vellur.in'
}

/** Absolute URL for a share token, e.g. https://convoy.vellur.in/s/<token>. */
export function buildShareUrl(token: string): string {
  return `${getBaseUrl()}/s/${token}`
}

/**
 * Create a share link for a convoy owned by the current user.
 * Returns the new token + share row id, or null if the insert failed.
 */
export async function createLocationShare(
  convoyId: string,
  displayName?: string,
): Promise<{ token: string; shareId: string } | null> {
  const token = generateShareToken()
  const { data, error } = await supabase
    .from('location_shares')
    .insert({ convoy: convoyId, token, display_name: displayName ?? null })
    .select('id, token')
    .single()
  if (error) throw error
  return { token: data.token, shareId: data.id }
}

/**
 * Find the owner's active share for a convoy (if any) so the UI can
 * reuse it instead of minting a new token. RLS restricts to the owner.
 */
export async function findActiveShare(convoyId: string): Promise<MyShare | null> {
  const { data, error } = await supabase
    .from('location_shares')
    .select('id, token, convoy, display_name, status')
    .eq('convoy', convoyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    token: data.token,
    convoy: data.convoy,
    displayName: data.display_name,
    status: data.status,
  }
}

/**
 * Resolve a share token to its convoy. Any authenticated viewer may
 * call this; the RPC returns zero rows for revoked/unknown tokens.
 */
export async function resolveShareToken(token: string): Promise<ResolvedShare | null> {
  const { data, error } = await supabase.rpc('resolve_share_token', { token })
  if (error) throw error
  const rows = (data ?? []) as Array<{
    convoy: string
    convoy_name: string | null
    owner_name: string | null
    phase: string
    display_name: string | null
    status: string
  }>
  if (rows.length === 0) return null
  const row = rows[0]
  return {
    convoy: row.convoy,
    convoyName: row.convoy_name,
    ownerName: row.owner_name,
    phase: row.phase,
    displayName: row.display_name,
    status: row.status,
  }
}

/** Revoke a share link so the token no longer resolves. */
export async function revokeShare(shareId: string): Promise<void> {
  const { error } = await supabase
    .from('location_shares')
    .update({ status: 'revoked' })
    .eq('id', shareId)
  if (error) throw error
}

/** List the current user's shares (RLS limits to the owner). */
export async function listMyShares(): Promise<MyShare[]> {
  const { data, error } = await supabase
    .from('location_shares')
    .select('id, token, convoy, display_name, status')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    token: row.token,
    convoy: row.convoy,
    displayName: row.display_name,
    status: row.status,
  }))
}
