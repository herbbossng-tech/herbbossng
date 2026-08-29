import * as React from 'react'

import { mockBrands, mockWorkspaces } from '@/data/mockWorkspaces'
import type { Brand, Workspace } from '@/types/database'

interface WorkspaceContextValue {
  workspaces: Workspace[]
  brands: Brand[]
  activeWorkspace: Workspace
  activeBrand: Brand | null
  workspaceBrands: Brand[]
  setActiveWorkspaceId: (id: string) => void
  setActiveBrandId: (id: string) => void
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

/**
 * Runs on mockWorkspaces/mockBrands today. Swap the two `mock*` reads below
 * for TanStack Query calls against `supabase.from('workspaces'|'brands')`
 * once real tenant data exists — every consumer of this context is
 * already written against the real `Workspace`/`Brand` DB types.
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const workspaces = mockWorkspaces
  const brands = mockBrands

  const [activeWorkspaceId, setActiveWorkspaceIdState] = React.useState(
    () => readStoredId(STORAGE_KEY_WORKSPACE) ?? workspaces[0].id,
  )
  const [activeBrandId, setActiveBrandIdState] = React.useState<string | null>(() => readStoredId(STORAGE_KEY_BRAND))

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0]
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
      }
    },
    [brands],
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
    }),
    [workspaces, brands, activeWorkspace, activeBrand, workspaceBrands, setActiveWorkspaceId, setActiveBrandId],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = React.useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider')
  return context
}
