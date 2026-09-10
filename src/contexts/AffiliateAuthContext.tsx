import type { Session, User } from '@supabase/supabase-js'
import * as React from 'react'

import { isSupabaseConfigured } from '@/lib/supabase'
import { supabaseAffiliate } from '@/lib/supabaseAffiliate'
import type { Affiliate } from '@/types/database'

interface AuthResult {
  error: string | null
}

interface AffiliateAuthContextValue {
  session: Session | null
  user: User | null
  affiliate: Affiliate | null
  loading: boolean
  isSupabaseConfigured: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<AuthResult>
  updatePassword: (newPassword: string) => Promise<AuthResult>
  refreshAffiliate: () => Promise<void>
}

const AffiliateAuthContext = React.createContext<AffiliateAuthContextValue | null>(null)

export function AffiliateAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [affiliate, setAffiliate] = React.useState<Affiliate | null>(null)
  const [loading, setLoading] = React.useState(true)

  const loadAffiliate = React.useCallback(async (userId: string) => {
    const { data, error } = await supabaseAffiliate.from('affiliates').select('*').eq('auth_user_id', userId).maybeSingle()
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[GCOS] Failed to load affiliate profile', error)
      setAffiliate(null)
      return
    }
    setAffiliate((data as Affiliate | null) ?? null)
  }, [])

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    supabaseAffiliate.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        void loadAffiliate(data.session.user.id)
      }
      setLoading(false)
    })

    const { data: subscription } = supabaseAffiliate.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        void loadAffiliate(nextSession.user.id)
      } else {
        setAffiliate(null)
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [loadAffiliate])

  const signIn = React.useCallback<AffiliateAuthContextValue['signIn']>(async (email, password) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured yet.' }
    }
    const { error } = await supabaseAffiliate.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signOut = React.useCallback(async () => {
    if (!isSupabaseConfigured) return
    await supabaseAffiliate.auth.signOut()
  }, [])

  const sendPasswordReset = React.useCallback<AffiliateAuthContextValue['sendPasswordReset']>(async (email) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured yet.' }
    }
    const { error } = await supabaseAffiliate.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/affiliate/reset-password`,
    })
    return { error: error?.message ?? null }
  }, [])

  const updatePassword = React.useCallback<AffiliateAuthContextValue['updatePassword']>(async (newPassword) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured yet.' }
    }
    const { error } = await supabaseAffiliate.auth.updateUser({ password: newPassword })
    return { error: error?.message ?? null }
  }, [])

  const refreshAffiliate = React.useCallback(async () => {
    if (session?.user) await loadAffiliate(session.user.id)
  }, [session, loadAffiliate])

  const value = React.useMemo<AffiliateAuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      affiliate,
      loading,
      isSupabaseConfigured,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      refreshAffiliate,
    }),
    [session, affiliate, loading, signIn, signOut, sendPasswordReset, updatePassword, refreshAffiliate],
  )

  return <AffiliateAuthContext.Provider value={value}>{children}</AffiliateAuthContext.Provider>
}

export function useAffiliateAuth() {
  const context = React.useContext(AffiliateAuthContext)
  if (!context) throw new Error('useAffiliateAuth must be used within an AffiliateAuthProvider')
  return context
}
