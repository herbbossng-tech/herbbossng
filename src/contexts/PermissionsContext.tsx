import { useQuery } from '@tanstack/react-query'
import * as React from 'react'

import { useWorkspace } from '@/contexts/WorkspaceContext'
import { supabase } from '@/lib/supabase'
import type { Role } from '@/types/database'

interface PermissionsContextValue {
  /** First role the user holds in the active workspace — kept for ProfileMenu's existing single-badge display. See `roles` for the full list. */
  role: Role
  /** Every role the user holds in the active workspace (a user can hold more than one). */
  roles: Role[]
  permissions: ReadonlySet<string>
  hasPermission: (slug: string) => boolean
  hasAnyPermission: (slugs: string[]) => boolean
  isLoading: boolean
}

const PermissionsContext = React.createContext<PermissionsContextValue | null>(null)

const FALLBACK_ROLE: Role = {
  id: '',
  workspace_id: null,
  name: 'Member',
  slug: 'member',
  description: null,
  is_system_role: false,
  created_at: '',
  updated_at: '',
  created_by: null,
  updated_by: null,
  deleted_at: null,
}

interface EffectivePermissionRow {
  role_id: string
  role_name: string
  role_slug: string
  is_system_role: boolean
  permission_slug: string | null
}

async function fetchEffectivePermissions(workspaceId: string): Promise<EffectivePermissionRow[]> {
  const { data, error } = await supabase.rpc('get_effective_permissions', { p_workspace_id: workspaceId })
  if (error) throw error
  return (data ?? []) as EffectivePermissionRow[]
}

/**
 * Real, database-backed authorization: resolves the current user's
 * actual roles/permissions in the active workspace via
 * get_effective_permissions() (see migration 0023). This is the
 * ONLY place that determines what the UI shows — the RPC itself is
 * just a read reflecting user_roles/role_permissions, so there is no
 * separate "mock Owner" path left anywhere in the frontend.
 *
 * These gates are UX only. The actual security boundary is Postgres
 * RLS + the SECURITY DEFINER functions — every meaningful mutation
 * re-checks permission server-side regardless of what this context
 * reports (see the Phase 5 security test matrix).
 */
export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspace, hasWorkspaceAccess, isLoading: workspaceLoading } = useWorkspace()

  const { data, isLoading: queryLoading } = useQuery({
    queryKey: ['effective-permissions', activeWorkspace.id],
    queryFn: () => fetchEffectivePermissions(activeWorkspace.id),
    enabled: hasWorkspaceAccess && Boolean(activeWorkspace.id),
    staleTime: 30_000,
  })

  const rows = data ?? []

  const permissions = React.useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      if (row.permission_slug) set.add(row.permission_slug)
    }
    return set
  }, [rows])

  const roles = React.useMemo(() => {
    const seen = new Map<string, Role>()
    for (const row of rows) {
      if (!seen.has(row.role_id)) {
        seen.set(row.role_id, {
          id: row.role_id,
          workspace_id: activeWorkspace.id,
          name: row.role_name,
          slug: row.role_slug,
          description: null,
          is_system_role: row.is_system_role,
          created_at: '',
          updated_at: '',
          created_by: null,
          updated_by: null,
          deleted_at: null,
        })
      }
    }
    return Array.from(seen.values())
  }, [rows, activeWorkspace.id])

  const hasPermission = React.useCallback((slug: string) => permissions.has(slug), [permissions])
  const hasAnyPermission = React.useCallback((slugs: string[]) => slugs.some((slug) => permissions.has(slug)), [permissions])

  const value = React.useMemo<PermissionsContextValue>(
    () => ({
      role: roles[0] ?? FALLBACK_ROLE,
      roles,
      permissions,
      hasPermission,
      hasAnyPermission,
      isLoading: workspaceLoading || (hasWorkspaceAccess && queryLoading),
    }),
    [roles, permissions, hasPermission, hasAnyPermission, workspaceLoading, hasWorkspaceAccess, queryLoading],
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
