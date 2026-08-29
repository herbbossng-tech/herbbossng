import * as React from 'react'

import { mockPermissions, mockRole } from '@/data/mockWorkspaces'
import type { Role } from '@/types/database'

interface PermissionsContextValue {
  role: Role
  permissions: ReadonlySet<string>
  hasPermission: (slug: string) => boolean
  hasAnyPermission: (slugs: string[]) => boolean
}

const PermissionsContext = React.createContext<PermissionsContextValue | null>(null)

/**
 * Resolves the current user's permission set for the active workspace.
 * Runs on the mock Owner role/permission catalogue today (every button and
 * nav item is already gated through `hasPermission`, so wiring this up to
 * a real `user_roles` + `role_permissions` query later is a one-file change).
 */
export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const permissions = React.useMemo(() => new Set(mockPermissions.map((p) => p.slug)), [])

  const hasPermission = React.useCallback((slug: string) => permissions.has(slug), [permissions])
  const hasAnyPermission = React.useCallback(
    (slugs: string[]) => slugs.some((slug) => permissions.has(slug)),
    [permissions],
  )

  const value = React.useMemo<PermissionsContextValue>(
    () => ({ role: mockRole, permissions, hasPermission, hasAnyPermission }),
    [permissions, hasPermission, hasAnyPermission],
  )

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissions() {
  const context = React.useContext(PermissionsContext)
  if (!context) throw new Error('usePermissions must be used within a PermissionsProvider')
  return context
}

/** Convenience hook for a single permission check, e.g. `const canApprove = usePermission('orders.approve')`. */
export function usePermission(slug: string) {
  return usePermissions().hasPermission(slug)
}

/** Renders children only if the current user holds the given permission (or any of the given permissions). */
export function PermissionGate({
  permission,
  anyOf,
  fallback = null,
  children,
}: {
  permission?: string
  anyOf?: string[]
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const { hasPermission, hasAnyPermission } = usePermissions()
  const allowed = permission ? hasPermission(permission) : anyOf ? hasAnyPermission(anyOf) : true
  return <>{allowed ? children : fallback}</>
}
