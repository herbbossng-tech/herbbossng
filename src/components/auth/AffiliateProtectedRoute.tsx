import { Loader2 } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAffiliateAuth } from '@/contexts/AffiliateAuthContext'

export function AffiliateProtectedRoute() {
  const { session, loading } = useAffiliateAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/affiliate/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
