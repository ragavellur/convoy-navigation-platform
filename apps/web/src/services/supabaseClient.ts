import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase'

/**
 * Supabase client bound to the Convoy platform project.
 * URL + publishable anon key come from Vite env vars; the anon key is a
 * public key that ships in the browser bundle (never the service-role key).
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://pbvcbomojmnxukyypvrm.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!SUPABASE_ANON_KEY) {
  console.warn('VITE_SUPABASE_ANON_KEY is not set - Supabase calls will fail')
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'convoy-supabase-auth',
    },
  },
)

export default supabase
