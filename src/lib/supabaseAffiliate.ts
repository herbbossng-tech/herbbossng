import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * A second Supabase client, deliberately separate from src/lib/supabase.ts's
 * `supabase`. Supabase JS keeps exactly one auth session per client instance
 * (keyed by a single localStorage entry) — if the affiliate portal reused the
 * staff client, a staff member and an affiliate signed in on the same browser
 * would silently clobber each other's session. `storageKey` gives this
 * client its own localStorage slot, so a staff session and an affiliate
 * session coexist independently in the same browser. Every affiliate-portal
 * page/hook must use this client, never `supabase` from lib/supabase.ts.
 */
export const supabaseAffiliate = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'gcos-affiliate-auth',
    },
  },
)
