import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[GCOS] Supabase env vars are not set. Running against mock data only. ' +
      'Copy .env.example to .env.local and fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to connect a real project.',
  )
}

/**
 * Not generically typed with `Database` — see the note at the bottom of
 * src/types/database.ts for why. Every function that calls into this
 * client declares its own typed parameters/return values and casts
 * responses explicitly (`as Product`, etc.), so callers still get full
 * type safety; only the raw query-builder arguments are unchecked.
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
