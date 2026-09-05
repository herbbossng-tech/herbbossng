import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'

import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Brand, Workspace } from '@/types/database'

interface WorkspaceContextValue {
  workspaces: Workspace[]
  brands: Brand[]
  /**
   * Guaranteed to be a REAL workspace the user belongs to for any
   * component actually rendered under AppLayout — AppLayout itself
   * blocks rendering its children until isLoading is false and
   * hasWorkspaceAccess is true (see Gate AppLayout task). Outside
   * that guarantee (isLoading/!hasWorkspaceAccess), this is an inert
   * placeholder that must never be displayed — check those two flags
   * before trusting it, exactly as AppLayout does.
   */
  activeWorkspace: Workspace
  activeBrand: Brand | null
  workspaceBrands: Brand[]
  setActiveWorkspaceId: (id: string) => void
  setActiveBrandId: (id: string) => void
  isLoading: boolean
  hasWorkspaceAccess: boolean
  refetchWorkspaces: () => void
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null)

const STORAGE_KEY_WORKSPACE = 'gcos.activeWorkspaceId'
const STORAGE_KEY_BRAND = 'gcos.activeBrandId'

function readStoredId(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStoredId(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage may be unavailable (private mode) — active selection just won't persist.
  }
}

// Only ever used as a type-satisfying placeholder while isLoading or
// !hasWorkspaceAccess — AppLayout never renders its children (and so
// never any real consumer of useWorkspace()) in that state. Never
// displayed; never a fabricated workspace shown to the user.
const EMPTY_WORKSPACE: Workspace = {
  id: '',
  name: '',
  slug: '',
  country_code: null,
  currency_code: null,
  timezone: 'UTC',
  logo_url: null,
  status: 'active',
  settings: {},
  created_at: '',
  updated_at: '',
  created_by: null,
  updated_by: null,
  deleted_at: null,
}

async function fetchMyWorkspacesAndBrands(): Promise<{ workspaces: Workspace[]; brands: Brand[] }> {
  const [workspacesRes, brandsRes] = await Promise.all([
    supabase.from('workspaces').select('*').is('deleted_at', null).order('name'),
    supabase.from('brands').select('*').is('deleted_at', null).order('name'),
  ])
  if (workspacesRes.error) throw workspacesRes.error
  if (brandsRes.error) throw brandsRes.error
  return {
    workspaces: (workspacesRes.data ?? []) as Workspace[],
    brands: (brandsRes.data ?? []) as Brand[],
  }
}

/**
 * Real, Supabase-backed workspace/brand membership. RLS
 * (public.user_workspace_ids()) is what actually scopes these two
 * queries to "workspaces/brands this user belongs to" — there is no
 * client-side filtering standing in for that; a workspace id a user
 * doesn't belong to simply never appears in `workspacesRes.data`.
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const userId = session?.user?.id

  const { data, isLoading: queryLoading, refetch } = useQuery({
    queryKey: ['my-workspaces-and-brands', userId],
    queryFn: fetchMyWorkspacesAndBrands,
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const workspaces = data?.workspaces ?? []
  const brands = data?.brands ?? []
  const isLoading = authLoading || (Boolean(userId) && queryLoading)
  const hasWorkspaceAccess = workspaces.length > 0

  const [activeWorkspaceId, setActiveWorkspaceIdState] = React.useState<string | null>(() => readStoredId(STORAGE_KEY_WORKSPACE))
  const [activeBrandId, setActiveBrandIdState] = React.useState<string | null>(() => readStoredId(STORAGE_KEY_BRAND))

  // Reset the remembered selection when the signed-in user changes
  // (e.g. sign out then sign back in as someone else) so a stale
  // workspace id from a previous session can't leak forward.
  const lastUserId = React.useRef(userId)
  React.useEffect(() => {
    if (lastUserId.current !== userId) {
      lastUserId.current = userId
      setActiveWorkspaceIdState(readStoredId(STORAGE_KEY_WORKSPACE))
      setActiveBrandIdState(readStoredId(STORAGE_KEY_BRAND))
    }
  }, [userId])

  const activeWorkspace = React.useMemo(() => {
    if (workspaces.length === 0) return EMPTY_WORKSPACE
    return workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0]
  }, [workspaces, activeWorkspaceId])

  const workspaceBrands = React.useMemo(
    () => brands.filter((b) => b.workspace_id === activeWorkspace.id),
    [brands, activeWorkspace.id],
  )
  const activeBrand = workspaceBrands.find((b) => b.id === activeBrandId) ?? workspaceBrands[0] ?? null

  const setActiveWorkspaceId = React.useCallback(
    (id: string) => {
      setActiveWorkspaceIdState(id)
      writeStoredId(STORAGE_KEY_WORKSPACE, id)
      const firstBrand = brands.find((b) => b.workspace_id === id)
      if (firstBrand) {
        setActiveBrandIdState(firstBrand.id)
        writeStoredId(STORAGE_KEY_BRAND, firstBrand.id)
      } else {
        setActiveBrandIdState(null)
      }
      // A workspace switch changes the effective permission scope too.
      queryClient.invalidateQueries({ queryKey: ['effective-permissions'] })
    },
    [brands, queryClient],
  )

  const setActiveBrandId = React.useCallback((id: string) => {
    setActiveBrandIdState(id)
    writeStoredId(STORAGE_KEY_BRAND, id)
  }, [])

  const value = React.useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      brands,
      activeWorkspace,
      activeBrand,
      workspaceBrands,
      setActiveWorkspaceId,
      setActiveBrandId,
      isLoading,
      hasWorkspaceAccess,
      refetchWorkspaces: () => void refetch(),
    }),
    [workspaces, brands, activeWorkspace, activeBrand, workspaceBrands, setActiveWorkspaceId, setActiveBrandId, isLoading, hasWorkspaceAccess, refetch],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = React.useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider')
  return context
}
