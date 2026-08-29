import { AlertTriangle, Loader2 } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'

/**
 * Dev-only local preview bypass: lets you browse protected routes without a
 * real Supabase session while you're still setting up auth locally. Gated on
 * `import.meta.env.DEV`, which Vite hard-codes to `false` in production
 * builds (`vite build`) — this branch is dead code outside `vite dev` and
 * never ships. No fake credentials involved; it just skips the redirect.
 */
const DEV_PREVIEW_BYPASS = import.meta.env.DEV

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) {
    if (DEV_PREVIEW_BYPASS) {
      return (
        <>
          <div className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-center text-xs font-semibold text-warning">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Local preview — no Supabase session. Sign in normally once auth is set up; this banner never appears in a production build.
          </div>
          <Outlet />
        </>
      )
    }
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
